// Security tests for the leaderboard Worker (review/security). Runs against a bundle of src/index.js on an
// in-memory SQLite stand-in for D1 (node:sqlite, Node 22+). Never touches the live database.
//   npm run build && WORKER_BUNDLE=./dist/index.js node --no-warnings test/security.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolve(process.env.WORKER_BUNDLE || resolve(here, "../dist/index.js"));
const { default: worker } = await import(bundle);

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(resolve(here, "../schema.sql"), "utf8"));
db.exec(readFileSync(resolve(here, "../migrate_r6.sql"), "utf8"));
const D1 = { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; },
  async first() { return db.prepare(sql).get(...a) ?? null; }, async all() { return { results: db.prepare(sql).all(...a) }; },
  async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; } };

const base = { DB: D1, ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" }; // no ALLOWED_ORIGINS: the built-in default list
const peppered = { ...base, CODE_PEPPER: "test-pepper-0123456789abcdef" };
let ip = 1;
async function call(method, path, body, { origin = "https://servosprint.xyz", env = base, raw, headers: extra = {} } = {}) {
  const headers = { "CF-Connecting-IP": `10.0.${(ip >> 8) & 255}.${ip++ & 255}`, "User-Agent": "t", ...extra };
  if (origin) headers.Origin = origin;
  if (body !== undefined || raw !== undefined) headers["Content-Type"] = "application/json";
  const init = { method, headers, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined };
  if (raw instanceof ReadableStream) init.duplex = "half";
  const res = await worker.fetch(new Request("https://api.x" + path, init), env, {});
  const t = await res.text();
  let b = null; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  return { s: res.status, b, h: res.headers };
}
let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? "PASS " : "FAIL ") + m); if (!c) { fails++; process.exitCode = 1; } };
const stream = (bytes) => new ReadableStream({ start(c) { for (let i = 0; i < bytes; i += 1024) c.enqueue(new Uint8Array(Math.min(1024, bytes - i)).fill(32)); c.close(); } });

/* ---- CORS allowlist ---- */
for (const o of ["https://servosprint.xyz", "https://www.servosprint.xyz", "https://auamai.dev", "https://www.auamai.dev"]) {
  const r = await call("OPTIONS", "/score", undefined, { origin: o });
  ok(r.s === 204 && r.h.get("Access-Control-Allow-Origin") === o, `preflight allowed for ${o}`);
}
for (const o of ["https://auamai.github.io", "https://evil.example", "https://servosprint.xyz.evil.example", "null", ""]) {
  const r = await call("POST", "/score", { username: "cors_x", score: 10, durationMs: 5000 }, { origin: o || null });
  ok(r.s === 403 && !r.h.get("Access-Control-Allow-Origin"), `POST refused from ${o || "(no Origin)"}`);
}
ok((await call("OPTIONS", "/score", undefined, { origin: "https://evil.example" })).s === 403, "preflight refused for a stranger origin");
const preview = { ...base, ALLOWED_ORIGINS: "https://servosprint.xyz,https://servosprint.auamai.workers.dev" };
ok((await call("POST", "/score", { username: "prev_ok", score: 10, durationMs: 5000 }, { origin: "https://servosprint.auamai.workers.dev", env: preview })).s === 200, "workers.dev preview works only when ALLOWED_ORIGINS lists it");

/* ---- body size limits ---- */
ok((await call("POST", "/score", undefined, { raw: "{" + " ".repeat(3000) + "}" })).s === 400, "/score body over 2 KB rejected");
ok((await call("POST", "/score", undefined, { raw: stream(64 * 1024) })).s === 400, "/score chunked body (no Content-Length) over 2 KB rejected");
ok((await call("POST", "/err", undefined, { raw: JSON.stringify({ msg: "x".repeat(10000) }) })).s === 400, "/err body over 4 KB rejected");
ok((await call("POST", "/err", { msg: "boom", kind: "error" })).s === 204, "/err small report still accepted");
ok((await call("POST", "/passkey/login/verify", undefined, { raw: stream(40 * 1024) })).s === 400, "passkey body over 16 KB rejected");
ok((await call("POST", "/score", undefined, { raw: "[1,2]" })).s === 400, "JSON array body rejected");

/* ---- validation and SQL injection (prepared statements) ---- */
ok((await call("POST", "/score", { username: "x' OR '1'='1", score: 10, durationMs: 5000 })).s === 400, "SQL-ish username rejected by the name rule");
ok((await call("POST", "/score", { username: "<img src=x>", score: 10, durationMs: 5000 })).s === 400, "HTML username rejected");
ok((await call("POST", "/score", { username: "fl0at", score: 10.5, durationMs: 5000 })).s === 400, "non-integer score rejected");
ok((await call("POST", "/score", { username: "fl0at", score: "10", durationMs: 5000 })).s === 400, "string score rejected");
ok((await call("POST", "/score", { username: "longrun", score: 10, durationMs: 3 * 3600e3 + 1 })).s === 400, "duration over 3 h rejected");
ok((await call("POST", "/score", { username: "sh1t_x", score: 10, durationMs: 5000 })).s === 400, "blocked name rejected");
const inj = await call("GET", "/scores?board=" + encodeURIComponent("daily' UNION SELECT code_hash, 1 FROM profiles--"));
ok(inj.s === 200 && inj.b.board && Array.isArray(inj.b.scores) && !JSON.stringify(inj.b).includes("code_hash"), "board param can't inject SQL");

/* ---- response headers ---- */
const cl = await call("POST", "/profile/claim", { username: "sec_user", best: 10, games: 1, gears: 5 });
ok(cl.s === 200 && cl.h.get("Cache-Control") === "no-store" && cl.h.get("X-Content-Type-Options") === "nosniff", "claim response (carries the code) is no-store + nosniff");
const top = await call("GET", "/scores");
ok(top.h.get("Cache-Control") === "public, max-age=15", "public board keeps its 15 s cache");

/* ---- per-name brute-force lockout ---- */
const code = cl.b.code;
let last;
for (let i = 0; i < 10; i++) last = await call("POST", "/profile/restore", { username: "sec_user", code: "AAAAAAAAAA" });
ok(last.s === 401, "wrong codes from 10 IPs: 401 each");
ok((await call("POST", "/profile/restore", { username: "sec_user", code })).s === 429, "after 10 misses the name is locked for the minute (even the right code)");
ok((await call("POST", "/score", { username: "sec_user", score: 10, durationMs: 5000, code })).s === 403, "locked name can't post either");
ok((await call("POST", "/profile/restore", { username: "SEC_USER", code })).s === 429, "lock ignores name case");
db.exec("DELETE FROM rate_limits");
ok((await call("POST", "/profile/restore", { username: "sec_user", code })).s === 200, "lock lifts with the window");
ok((await call("POST", "/profile/restore", { username: "sec_user", code: "A".repeat(5000).slice(0, 1500) })).s === 401, "oversized code refused");
ok((await call("POST", "/profile/sync", { username: "sec_user", token: "0".repeat(64) })).s === 401, "unknown session token refused");

/* ---- save code hashing (optional pepper) ---- */
const hashOf = (u) => db.prepare("SELECT code_hash FROM profiles WHERE username = ?").get(u).code_hash;
ok(/^[0-9a-f]{64}$/.test(hashOf("sec_user")), "no CODE_PEPPER: legacy SHA-256 hash (unchanged behaviour)");
ok((await call("POST", "/profile/restore", { username: "sec_user", code }, { env: peppered })).s === 200, "legacy hash still opens with the pepper set");
ok(hashOf("sec_user").startsWith("h1:"), "legacy hash upgraded to HMAC on the next correct code");
ok((await call("POST", "/profile/restore", { username: "sec_user", code }, { env: peppered })).s === 200, "upgraded hash opens");
ok((await call("POST", "/profile/restore", { username: "sec_user", code: "AAAAAAAAAA" }, { env: peppered })).s === 401, "upgraded hash refuses a wrong code");
const cp = await call("POST", "/profile/claim", { username: "pep_user" }, { env: peppered });
ok(cp.s === 200 && hashOf("pep_user").startsWith("h1:") && !hashOf("pep_user").includes(cp.b.code), "new claim with pepper stores HMAC only");

/* ---- passkey challenges: one use, expiry, kind ---- */
const lo = await call("POST", "/passkey/login/options", {}, { origin: "https://auamai.dev" });
ok(lo.s === 200 && /^[0-9a-f]{32}$/.test(lo.b.challengeId) && lo.b.options.rpId === "auamai.dev", "login options: rpId auamai.dev, challenge id");
const fake = { id: "AAAA", rawId: "AAAA", type: "public-key", response: { clientDataJSON: "e30", authenticatorData: "AA", signature: "AA" }, clientExtensionResults: {} };
const v1 = await call("POST", "/passkey/login/verify", { challengeId: lo.b.challengeId, response: fake }, { origin: "https://auamai.dev" });
const v2 = await call("POST", "/passkey/login/verify", { challengeId: lo.b.challengeId, response: fake }, { origin: "https://auamai.dev" });
ok(v1.s === 401 && v2.s === 400 && v2.b.error === "challenge expired", "a challenge is spent by its first verify (no assertion replay)");
const lo2 = await call("POST", "/passkey/login/options", {}, { origin: "https://auamai.dev" });
db.prepare("UPDATE webauthn_challenges SET expires_at = ? WHERE id = ?").run(Date.now() - 1, lo2.b.challengeId);
ok((await call("POST", "/passkey/login/verify", { challengeId: lo2.b.challengeId, response: fake }, { origin: "https://auamai.dev" })).b.error === "challenge expired", "expired challenge refused");
const lo3 = await call("POST", "/passkey/login/options", {}, { origin: "https://auamai.dev" });
ok((await call("POST", "/passkey/register/verify", { challengeId: lo3.b.challengeId, response: fake }, { origin: "https://auamai.dev" })).b.error === "challenge expired", "a login challenge can't be used to register");
ok((await call("POST", "/passkey/register/options", { username: "sec_user" }, { origin: "https://auamai.dev" })).s === 409, "claimed name can't add a passkey without its code");

/* ---- shop state from sync ---- */
const sy = await call("POST", "/profile/sync", { username: "sec_user", code, best: 10, games: 1, gears: 900, cos: { spent: 0, owned: [], eq: { trail: "trail-pearl", trim: "pearl" } } }, { env: peppered });
ok(sy.s === 200 && !("trail" in sy.b.profile.cos.eq) && sy.b.profile.cos.eq.trim === "pearl", "can't wear a shop item that isn't owned (medal colour kept)");
const sy2 = await call("POST", "/profile/sync", { username: "sec_user", code, best: 10, games: 1, gears: 900, cos: { spent: 100, owned: ["trail-pearl"], eq: { trail: "trail-pearl" } } }, { env: peppered });
ok(sy2.b.profile.cos.eq.trail === "trail-pearl", "owned item can be worn");

console.log(`${n - fails}/${n} passed`);
