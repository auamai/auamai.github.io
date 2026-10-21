// Challenge ghost tests (r7 ghost): POST/GET /ghost validation, first-write-wins, rate limit, CORS, missing table.
//   npm run build && WORKER_BUNDLE=./dist/index.js node --no-warnings test/ghost.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const { default: worker } = await import(resolve(process.env.WORKER_BUNDLE || resolve(here, "../dist/index.js")));
const mkdb = (withGhosts = true) => {
  const db = new DatabaseSync(":memory:");
  let sql = readFileSync(resolve(here, "../schema.sql"), "utf8");
  if (!withGhosts) sql = sql.split("-- Challenge ghosts")[0];
  db.exec(sql);
  return { prepare(q) { let a = []; const st = { bind(...x) { a = x; return st; },
    async first() { return db.prepare(q).get(...a) ?? null; }, async all() { return { results: db.prepare(q).all(...a) }; },
    async run() { const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; } };
};
const env = { DB: mkdb(), ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" };
let ipn = 1;
async function call(method, path, body, { origin = "https://servosprint.xyz", e = env, ip, raw } = {}) {
  const headers = { "CF-Connecting-IP": ip || `10.9.${(ipn >> 8) & 255}.${ipn++ & 255}`, "User-Agent": "t" };
  if (origin) headers.Origin = origin;
  if (body !== undefined || raw !== undefined) headers["Content-Type"] = "application/json";
  const res = await worker.fetch(new Request("https://api.x" + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) }), e, {});
  const t = await res.text(); let b = null; try { b = JSON.parse(t); } catch { b = t; }
  return { s: res.status, b, h: res.headers };
}
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) { fails++; process.exitCode = 1; } };

// A track like the game writes: n samples, steady pace, score steps summing to `pts`.
function track(n, pts, { flags = 0, dq = 20 } = {}) {
  const u = new Uint8Array(n * 6); let left = pts;
  for (let i = 0; i < n; i++) {
    const o = i * 6, step = i === n - 1 ? left : Math.min(left, Math.floor(pts / n));
    left -= step;
    u[o] = 0; u[o + 1] = 0; u[o + 2] = flags; u[o + 3] = dq; u[o + 4] = step & 255; u[o + 5] = step >> 8;
  }
  return Buffer.from(u).toString("base64");
}

const good = track(200, 1500); // 20 s, 1,500 points
let r = await call("POST", "/ghost", { c: "abc12", s: 1500, b: good });
ok(r.s === 200 && r.b.ok, "valid ghost stored");
r = await call("GET", "/ghost?c=abc12&s=1500", undefined, { origin: "" });
ok(r.s === 200 && r.b.b === good, "GET returns the stored track (no Origin needed)");
ok(/max-age=86400/.test(r.h.get("Cache-Control") || ""), "GET is cacheable for a day");
r = await call("POST", "/ghost", { c: "abc12", s: 1500, b: track(200, 1500, { flags: 1 }) });
r = await call("GET", "/ghost?c=abc12&s=1500");
ok(r.b.b === good, "first write wins (a second upload can't replace it)");
r = await call("GET", "/ghost?c=abc12&s=1499");
ok(r.s === 200 && r.b.b === null && /max-age=60\b/.test(r.h.get("Cache-Control") || ""), "unknown score: 200 { b: null }, short cache (no console error)");
ok((await call("GET", "/ghost?c=ABC&s=1")).s === 400, "bad seed in GET: 400");
ok((await call("GET", "/ghost?c=abc12&s=1e3")).s === 400, "non-integer score in GET: 400");

const bad = async (body, m, code = 400) => { const x = await call("POST", "/ghost", body); ok(x.s === code, `${m} (${x.s} ${x.b && x.b.error})`); };
await bad({ c: "abcdefgh", s: 10, b: good }, "seed too long rejected");
await bad({ c: "abc", s: 0, b: track(40, 0) }, "zero score rejected");
await bad({ c: "abc", s: 1.5, b: good }, "fractional score rejected");
await bad({ c: "abc", s: 1500, b: good + "!" }, "non-base64 rejected");
await bad({ c: "abc", s: 1500, b: Buffer.concat([Buffer.from(good, "base64"), Buffer.alloc(3)]).toString("base64") }, "length not a whole sample rejected");
await bad({ c: "abc", s: 100, b: track(20, 100) }, "under 3 s of track rejected");
await bad({ c: "abc", s: 100, b: track(3001, 100) }, "over 300 s of track rejected (size)");
await bad({ c: "abc", s: 1500, b: track(200, 1500, { flags: 8 }) }, "unknown flag bits rejected");
await bad({ c: "abc", s: 1500, b: track(200, 900) }, "score steps that don't add up rejected");
await bad({ c: "abc", s: 1500, b: track(200, 1600) }, "score steps above the score rejected");
await bad({ c: "abc", s: 90000, b: track(100, 90000) }, "score over the run-time caps rejected");
await bad({ c: "abc", s: 1500, b: track(200, 1500, { dq: 255 }) }, "impossible speed rejected");
await bad({ c: "abc", s: 1500, b: 12 }, "non-string track rejected");
r = await call("POST", "/ghost", undefined, { raw: JSON.stringify({ c: "abc", s: 1500, b: "A".repeat(30000) }) });
ok(r.s === 400, "oversized body rejected before parsing");
r = await call("POST", "/ghost", { c: "abc", s: 1500, b: good }, { origin: "https://evil.example" });
ok(r.s === 403, "foreign origin rejected");
let last = 0;
for (let i = 0; i < 8; i++) last = (await call("POST", "/ghost", { c: "zz" + i, s: 1500, b: good }, { ip: "10.1.1.1" })).s;
ok(last === 429, "rate limited per IP");
// Database without migrate_ghost.sql: POST answers 200 ok:false, GET 200 b:null, nothing throws.
const old = { ...env, DB: mkdb(false) };
r = await call("POST", "/ghost", { c: "q1", s: 1500, b: good }, { e: old });
ok(r.s === 200 && r.b.ok === false, "unmigrated DB: POST answers 200 ok:false");
r = await call("GET", "/ghost?c=q1&s=1500", undefined, { e: old });
ok(r.s === 200 && r.b.b === null, "unmigrated DB: GET answers b: null");
// Course version is part of the key (r8): a classic (v1) link never gets a v2 ghost, nor the other way round.
const v2t = track(200, 1500, { flags: 1 });
r = await call("POST", "/ghost", { c: "cv1", s: 1500, v: 2, b: v2t });
ok(r.s === 200 && r.b.ok, "v2 ghost stored");
ok((await call("GET", "/ghost?c=cv1&s=1500")).b.b === null && (await call("GET", "/ghost?c=cv1&s=1500&v=1")).b.b === null && (await call("GET", "/ghost?c=cv1&s=1500&v=2")).b.b === v2t, "v2 ghost only answers v=2 (a link without v reads as v1)");
r = await call("POST", "/ghost", { c: "cv1", s: 1500, b: good });
ok(r.s === 200 && r.b.ok && (await call("GET", "/ghost?c=cv1&s=1500")).b.b === good && (await call("GET", "/ghost?c=cv1&s=1500&v=2")).b.b === v2t, "v1 and v2 ghosts on the same seed and score are kept apart");
ok((await call("POST", "/ghost", { c: "cv2", s: 1500, v: 0, b: good })).s === 400 && (await call("GET", "/ghost?c=cv1&s=1500&v=x")).s === 400, "bad course version rejected");
// Scores are untouched by the ghost routes.
ok((await call("GET", "/scores")).s === 200, "GET /scores still answers");
// A real game track (written by the game in the browser probe) passes.
if (process.env.REAL_TRACK) { const j = JSON.parse(readFileSync(process.env.REAL_TRACK, "utf8")); r = await call("POST", "/ghost", { c: j.c, s: j.s, b: j.b }); ok(r.s === 200 && r.b.ok, `real game track accepted (${j.s} pts, ${j.b.length} b64)`); }
console.log(fails ? `${fails} failed` : "all ghost tests passed");
