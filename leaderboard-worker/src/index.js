// Factory Run API: global leaderboard, player profiles with save codes,
// and a private unique-visitor count. Cloudflare Worker + D1.
//
//   GET  /scores            top 10 (best run per name)
//   POST /score             { username, score, durationMs, code? }
//   POST /profile/claim     { username, best?, games?, gears?, lastPlayed? } -> { code } (shown once)
//   POST /profile/restore   { username, code }
//   POST /profile/sync      { username, code, best, games, gears, lastPlayed }
//   POST /passkey/register/options { username, code? | token? } -> { challengeId, options }
//   POST /passkey/register/verify  { challengeId, response, best?, games?, gears?, lastPlayed? }
//                                  -> { token, profile, backupCode? } (backupCode only when the name is new)
//   POST /passkey/login/options    {} -> { challengeId, options } (discoverable, no name needed)
//   POST /passkey/login/verify     { challengeId, response } -> { token, profile }
//   POST /profile/backup-code      { username, token } -> { code } (replaces the old code)
//   POST /hit               once per page load, no body, no cookies
//   GET  /stats             daily uniques; requires a Cloudflare Access JWT
//
// Passkeys (WebAuthn, RP ID auamai.dev) store only the public key and a counter.
// A passkey sign-in returns a session token; /score and /profile/sync take
// either the save code or that token. Only SHA-256 of tokens is kept.
//
// Stored: usernames, run scores, SHA-256 of save codes, SHA-256 of
// (daily salt + IP + UA) for 30 days, and hashed rate-limit keys for one minute.
// No emails, passwords, cookies or raw IPs.

import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no I/O/0/1
const BLOCKLIST = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "nigg", "fag", "slut", "whore",
  "rape", "nazi", "hitler", "porn", "penis", "vagina", "asshole", "bastard", "retard",
  "kike", "chink", "twat", "wank", "jizz", "dildo", "sex",
];

const MIN_DURATION_MS = 3000;
const MAX_DURATION_MS = 3 * 60 * 60 * 1000;
// Same line the game holds itself to (game.js allowedScore): 180 per second of run, plus a
// burst allowance for one multiplier streak that opens at 800/s after 10 s, capped at 8,000.
// Every score the r5 game could post (<= 140/s) still passes.
const MAX_SCORE_PER_SEC = 180;
const SCORE_GRACE = 50;
const BURST = 8000, BURST_FROM_S = 10, BURST_RATE = 800;
const allowedScore = (secs) => secs * MAX_SCORE_PER_SEC + SCORE_GRACE + Math.min(BURST, Math.max(0, secs - BURST_FROM_S) * BURST_RATE);
const STAT_CAP = 100_000_000;
const VISIT_RETENTION_DAYS = 30;

const LIMITS = {
  score: 10,      // per IP per minute
  claim: 5,
  restore: 10,
  sync: 20,
  hit: 30,
  passkey: 20,
  backup: 5,
  err: 20,
};

const RP_ID = "auamai.dev";
const RP_NAME = "Servo Sprint"; // display name only; existing passkeys are bound to RP_ID, which is unchanged
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = allowedOrigins(env);
    const cors = corsHeaders(origin, allowed);

    try {
      if (request.method === "OPTIONS") {
        if (!allowed.includes(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: cors });
      }

      const route = `${request.method} ${url.pathname.replace(/\/+$/, "") || "/"}`;

      if (route === "GET /stats") return await handleStats(request, env);
      if (route === "GET /scores") return await handleTop(env, cors, url.searchParams.get("board") || "all");

      if (request.method === "POST") {
        // Browser-only API: reject other origins outright.
        if (!allowed.includes(origin)) return json({ error: "origin not allowed" }, 403);
        const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

        switch (url.pathname) {
          case "/hit":
            if (!(await rateLimit(env, ip, "hit", LIMITS.hit))) return json({ error: "slow down" }, 429, cors);
            return await handleHit(request, env, ip, cors);
          case "/score":
            if (!(await rateLimit(env, ip, "score", LIMITS.score))) return json({ error: "slow down" }, 429, cors);
            return await handleScore(request, env, cors);
          case "/profile/claim":
            if (!(await rateLimit(env, ip, "claim", LIMITS.claim))) return json({ error: "slow down" }, 429, cors);
            return await handleClaim(request, env, cors);
          case "/profile/restore":
            if (!(await rateLimit(env, ip, "restore", LIMITS.restore))) return json({ error: "slow down" }, 429, cors);
            return await handleRestore(request, env, cors);
          case "/profile/sync":
            if (!(await rateLimit(env, ip, "sync", LIMITS.sync))) return json({ error: "slow down" }, 429, cors);
            return await handleSync(request, env, cors);
          case "/passkey/register/options":
          case "/passkey/register/verify":
          case "/passkey/login/options":
          case "/passkey/login/verify":
            if (!(await rateLimit(env, ip, "passkey", LIMITS.passkey))) return json({ error: "slow down" }, 429, cors);
            return await handlePasskey(url.pathname, request, env, cors, origin);
          case "/err":
            if (!(await rateLimit(env, ip, "err", LIMITS.err))) return new Response(null, { status: 204, headers: cors });
            return await handleErr(request, cors);
          case "/profile/backup-code":
            if (!(await rateLimit(env, ip, "backup", LIMITS.backup))) return json({ error: "slow down" }, 429, cors);
            return await handleBackupCode(request, env, cors);
        }
      }
      return json({ error: "not found" }, 404, cors);
    } catch (err) {
      console.error(err && err.stack ? err.stack : err);
      return json({ error: "server error" }, 500, cors);
    }
  },

  // Daily: rotate the visit salt and clear expired rows.
  async scheduled(_event, env) {
    const today = utcDay();
    await env.DB.prepare("DELETE FROM visit_salt WHERE day <> ?1").bind(today).run();
    await env.DB.prepare("INSERT OR IGNORE INTO visit_salt (day, salt) VALUES (?1, ?2)").bind(today, randomHex(32)).run();
    await env.DB.prepare("DELETE FROM visits WHERE day < ?1").bind(utcDay(-VISIT_RETENTION_DAYS)).run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE win < ?1").bind(currentWindow() - 1).run();
    await env.DB.prepare("DELETE FROM webauthn_challenges WHERE expires_at < ?1").bind(Date.now()).run();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(Date.now()).run();
  },
};

/* ---------- leaderboard ---------- */

/* ---------- Vancouver calendar (Daily Run and weekly board, round 6) ---------- */
const TZ = "America/Vancouver";
const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtWk = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const vanDay = (ms = Date.now()) => fmtDay.format(new Date(ms));
const dayNum = (d) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5);
const addDays = (d, n) => new Date((dayNum(d) + n) * 864e5).toISOString().slice(0, 10);
function vanWeek(ms = Date.now()) {
  const wd = Object.fromEntries(fmtWk.formatToParts(new Date(ms)).map((x) => [x.type, x.value])).weekday;
  return addDays(vanDay(ms), -({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[wd] || 0));
}
function nextMidnight(ms = Date.now()) {
  const p = Object.fromEntries(fmtWk.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  let t = ms + ((24 - +p.hour) * 3600 - +p.minute * 60 - +p.second) * 1000;
  t -= t % 1000;
  const today = vanDay(ms);
  while (vanDay(t - 1) !== today && t > ms) t -= 3600e3;
  while (vanDay(t) === today) t += 3600e3;
  return t;
}
function nextMonday(ms = Date.now()) { let t = nextMidnight(ms); for (let i = 0; i < 7 && vanWeek(t) === vanWeek(ms); i++) t = nextMidnight(t + 1000); return t; }
// Same FNV-1a as game/meta.js: the Daily Run's seed for a day.
function hash32(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
const dailySeed = (day) => hash32(`factory-run-daily:${day}`);

async function handleTop(env, cors, board = "all") {
  let sql = `SELECT username, MAX(score) AS score FROM scores GROUP BY username ORDER BY score DESC, MIN(created_at) ASC LIMIT 10`;
  let bind = [], resetAt = null;
  if (board === "daily") { sql = `SELECT username, MAX(score) AS score FROM scores WHERE mode = 'daily' AND day = ?1 GROUP BY username ORDER BY score DESC, MIN(created_at) ASC LIMIT 10`; bind = [vanDay()]; resetAt = nextMidnight(); }
  else if (board === "weekly") { sql = `SELECT username, MAX(score) AS score FROM scores WHERE week = ?1 GROUP BY username ORDER BY score DESC, MIN(created_at) ASC LIMIT 10`; bind = [vanWeek()]; resetAt = nextMonday(); }
  // Garage (r7): robot name + design of each name's best run (SQLite takes bare columns from the MAX row).
  let results;
  try { ({ results } = await env.DB.prepare(sql.replace("MAX(score) AS score", "MAX(score) AS score, robot, design")).bind(...bind).all()); }
  catch { ({ results } = await env.DB.prepare(sql).bind(...bind).all()); }
  const row = (r) => {
    const o = { username: r.username, score: r.score }, rb = cleanRobot(r.robot), d = cleanDesign(r.design);
    if (rb) o.robot = rb;
    if (d) o.design = d;
    return o;
  };
  return json({ board, ...(resetAt ? { resetAt, day: vanDay(), week: vanWeek() } : {}), scores: results.map(row) }, 200, {
    ...cors,
    "Cache-Control": "public, max-age=15",
  });
}

async function handleScore(request, env, cors) {
  const body = await readJson(request);
  if (!body) return json({ error: "bad request" }, 400, cors);
  const username = String(body.username || "");
  const score = body.score;
  const durationMs = body.durationMs;

  const nameErr = checkName(username);
  if (nameErr) return json({ error: nameErr }, 400, cors);
  if (!Number.isInteger(score) || score < 0) return json({ error: "invalid score" }, 400, cors);
  if (!Number.isInteger(durationMs)) return json({ error: "invalid duration" }, 400, cors);
  if (durationMs < MIN_DURATION_MS) return json({ error: "run too short" }, 400, cors);
  if (durationMs > MAX_DURATION_MS) return json({ error: "run too long" }, 400, cors);
  if (score > allowedScore(durationMs / 1000)) return json({ error: "implausible score" }, 400, cors);

  // A claimed name only accepts runs that carry its save code or a passkey session token.
  const profile = await env.DB.prepare("SELECT username, code_hash FROM profiles WHERE username = ?1").bind(username).first();
  if (profile) {
    if (!(await codeMatches(profile.username, body.code, profile.code_hash)) && !(await tokenMatches(env, profile.username, body.token))) {
      return json({ error: "name is claimed" }, 403, cors);
    }
  }

  // Run mode (round 6). A Daily Run must carry today's date in Vancouver (or yesterday's, for a
  // run that started before midnight and ended after it) and that day's seed.
  const now = Date.now();
  const mode = body.mode === "daily" || body.mode === "challenge" ? body.mode : "free";
  let day = vanDay(now);
  const revive = body.revive === true ? 1 : 0;
  if (revive && mode === "daily") return json({ error: "no spare servo in the daily run" }, 400, cors);
  if (mode === "daily") {
    const started = vanDay(now - durationMs - 60_000);
    if (body.day !== day && body.day !== started) return json({ error: "daily run is over" }, 400, cors);
    if (body.seed !== dailySeed(body.day)) return json({ error: "wrong daily seed" }, 400, cors);
    day = body.day;
  }
  // Spare Servo (r7): a revive is flagged on the run; the score caps above apply exactly the same.
  // The Daily Run never allows one (every player's daily stays equal).
  const robot = cleanRobot(body.robot), design = cleanDesign(body.design);
  try {
    await env.DB.prepare("INSERT INTO scores (username, score, duration_ms, created_at, mode, day, week, robot, design, revive) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
      .bind(username, score, durationMs, now, mode, day, vanWeek(now), robot, design, revive).run();
  } catch {
    // Database not migrated yet (migrate_r7.sql): store the run the old way rather than lose it.
    await env.DB.prepare("INSERT INTO scores (username, score, duration_ms, created_at, mode, day, week) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(username, score, durationMs, now, mode, day, vanWeek(now)).run();
  }

  const better = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (SELECT MAX(score) AS s FROM scores GROUP BY username) WHERE s > ?1`
  ).bind(score).first();
  const out = { ok: true, rank: (better ? better.n : 0) + 1 };
  if (mode === "daily") {
    const d = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM (SELECT MAX(score) AS s FROM scores WHERE mode = 'daily' AND day = ?2 GROUP BY username) WHERE s > ?1`
    ).bind(score, day).first();
    out.dailyRank = (d ? d.n : 0) + 1;
    out.day = day;
  }
  return json(out, 200, cors);
}

/* ---------- profiles ---------- */

async function handleClaim(request, env, cors) {
  const body = await readJson(request);
  if (!body) return json({ error: "bad request" }, 400, cors);
  const username = String(body.username || "");
  const nameErr = checkName(username);
  if (nameErr) return json({ error: nameErr }, 400, cors);

  const exists = await env.DB.prepare("SELECT 1 AS x FROM profiles WHERE username = ?1").bind(username).first();
  if (exists) return json({ error: "name taken" }, 409, cors);

  const code = randomCode();
  const now = Date.now();
  const s = cleanStats(body);
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO profiles (username, code_hash, best, games, gears, last_played, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
  ).bind(username, await codeHash(username, code), s.best, s.games, s.gears, s.lastPlayed, now).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: "name taken" }, 409, cors);

  // The plain code leaves the server exactly once, here.
  return json({ ok: true, username, code, profile: { username, ...s } }, 200, cors);
}

async function handleRestore(request, env, cors) {
  const body = await readJson(request);
  if (!body) return json({ error: "bad request" }, 400, cors);
  const row = await authProfile(env, body);
  if (!row) return json({ error: "name or code doesn't match" }, 401, cors);
  return json({ ok: true, profile: publicProfile(row) }, 200, cors);
}

async function handleSync(request, env, cors) {
  const body = await readJson(request);
  if (!body) return json({ error: "bad request" }, 400, cors);
  const row = await authProfile(env, body);
  if (!row) return json({ error: "name or code doesn't match" }, 401, cors);
  const s = cleanStats(body);
  // Stats only move forward, so two devices can sync in any order.
  await env.DB.prepare(
    `UPDATE profiles SET best = MAX(best, ?2), games = MAX(games, ?3), gears = MAX(gears, ?4),
       last_played = MAX(last_played, ?5), updated_at = ?6 WHERE username = ?1`
  ).bind(row.username, s.best, s.games, s.gears, s.lastPlayed, Date.now()).run();
  // Gear shop (round 6): owned items only grow, spent only grows and never past the gears earned.
  if (body.cos && typeof body.cos === "object") {
    const cur = parseCos(row.cosmetics), inc = parseCos(JSON.stringify(body.cos));
    const gears = Math.max(row.gears || 0, s.gears);
    const merged = { spent: Math.min(gears, Math.max(cur.spent, inc.spent)), owned: [...new Set([...cur.owned, ...inc.owned])], eq: { ...cur.eq, ...inc.eq } };
    if (cur.sv || inc.sv) { const a = cur.sv || { b: 0, u: 0 }, b = inc.sv || { b: 0, u: 0 }; merged.sv = { b: Math.max(a.b, b.b), u: Math.min(Math.max(a.b, b.b), Math.max(a.u, b.u)) }; }
    if (cur.d || inc.d) merged.d = cur.d && inc.d ? (inc.d.at > cur.d.at ? inc.d : cur.d) : cur.d || inc.d;
    await env.DB.prepare("UPDATE profiles SET cosmetics = ?2 WHERE username = ?1").bind(row.username, JSON.stringify(merged)).run();
  }
  const updated = await env.DB.prepare("SELECT * FROM profiles WHERE username = ?1").bind(row.username).first();
  return json({ ok: true, profile: publicProfile(updated) }, 200, cors);
}

async function authProfile(env, body) {
  const username = String(body.username || "");
  if (!NAME_RE.test(username)) return null;
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE username = ?1").bind(username).first();
  if (!row) return null;
  if (await codeMatches(row.username, body.code, row.code_hash)) return row;
  return (await tokenMatches(env, row.username, body.token)) ? row : null;
}

function publicProfile(r) {
  return { username: r.username, best: r.best, games: r.games, gears: r.gears, lastPlayed: r.last_played, cos: parseCos(r.cosmetics) };
}

const SHOP_IDS = new Set(["trim-navy", "trim-ice", "trail-ribbon", "trail-navy", "trail-pearl", "hammer-navy", "hammer-pearl"]);
function parseCos(text) {
  let c = {};
  try { c = JSON.parse(text || "{}") || {}; } catch { c = {}; }
  const owned = Array.isArray(c.owned) ? [...new Set(c.owned.filter((x) => SHOP_IDS.has(x)))] : [];
  const eq = {};
  for (const k of ["trim", "trail", "hammer"]) if (c.eq && typeof c.eq[k] === "string" && (c.eq[k] === "" || SHOP_IDS.has(c.eq[k]) || /^(pearl|deep|star)$/.test(c.eq[k]))) eq[k] = c.eq[k];
  const spent = Number.isFinite(c.spent) ? Math.max(0, Math.min(STAT_CAP, Math.floor(c.spent))) : 0;
  const out = { spent, owned, eq };
  // r7: Spare Servos bought/used (only grow) and the robot design (newest wins).
  const n = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(STAT_CAP, Math.floor(v))) : 0);
  if (c.sv && typeof c.sv === "object") out.sv = { b: n(c.sv.b), u: Math.min(n(c.sv.u), n(c.sv.b)) };
  if (c.d && typeof c.d === "object") out.d = { name: cleanRobot(c.d.name) || "", code: cleanDesign(c.d.code) || "0000", at: Math.min(n(c.d.at), Date.now() + 60_000) };
  return out;
}

function cleanStats(b) {
  const n = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(STAT_CAP, Math.floor(v))) : 0);
  const lp = Number.isFinite(b.lastPlayed) ? Math.min(Math.max(0, Math.floor(b.lastPlayed)), Date.now() + 60_000) : 0;
  return { best: n(b.best), games: n(b.games), gears: n(b.gears), lastPlayed: lp };
}

async function codeHash(username, code) {
  return sha256hex(`factory-run:${username.toLowerCase()}:${code}`);
}

async function codeMatches(username, code, storedHash) {
  if (typeof code !== "string") return false;
  const c = code.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!CODE_RE.test(c)) return false;
  return safeEqual(await codeHash(username, c), storedHash);
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b & 31]; // 256 % 32 === 0, so no bias
  return out;
}

/* ---------- passkeys ---------- */

// Client error reports (r6b): message, top stack frames, build id, coarse context. No PII is accepted:
// the body is whitelisted and truncated, URLs lose their query (challenge links carry names), and nothing
// is stored; reports go to the Worker log only (Workers Logs / wrangler tail).
async function handleErr(request, cors) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
  if (!b || typeof b !== "object") return json({ error: "bad body" }, 400, cors);
  const clip = (v, n) => String(v ?? "").replace(/https?:\/\/[^\s)]+/g, (u) => u.split(/[?#]/)[0]).slice(0, n);
  const rec = {
    kind: clip(b.kind, 16), msg: clip(b.msg, 300), src: clip(b.src, 600), build: clip(b.build, 32),
    state: clip(b.state, 12), q: Number.isFinite(+b.q) ? +b.q : null, touch: !!b.touch, n: Math.min(99, Math.max(1, +b.n || 1)),
  };
  if (!rec.msg) return json({ error: "empty" }, 400, cors);
  console.log("client_error " + JSON.stringify(rec));
  return new Response(null, { status: 204, headers: cors });
}

async function handlePasskey(path, request, env, cors, origin) {
  const body = await readJson(request, 16384);
  if (!body) return json({ error: "bad request" }, 400, cors);
  if (path === "/passkey/register/options") return passkeyRegisterOptions(body, env, cors);
  if (path === "/passkey/register/verify") return passkeyRegisterVerify(body, env, cors, origin);
  if (path === "/passkey/login/options") return passkeyLoginOptions(env, cors);
  return passkeyLoginVerify(body, env, cors, origin);
}

// Only pages on auamai.dev (and its subdomains) plus the related origins above can use passkeys for this RP ID.
// WebAuthn Related Origin Requests: these origins may use the auamai.dev RP ID because
// https://auamai.dev/.well-known/webauthn lists them. RP_ID stays auamai.dev, so existing passkeys keep working.
// Keep this list and that file in step.
const RELATED_ORIGINS = ["https://servosprint.xyz", "https://www.servosprint.xyz"];
function passkeyOrigins(env) {
  return allowedOrigins(env).filter((o) => /^https:\/\/([a-z0-9-]+\.)*auamai\.dev$/.test(o) || RELATED_ORIGINS.includes(o));
}

async function userHandle(username) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`factory-run-user:${username.toLowerCase()}`));
  return new Uint8Array(buf).slice(0, 16);
}

async function saveChallenge(env, challenge, kind, username) {
  const id = randomHex(16);
  await env.DB.prepare("INSERT INTO webauthn_challenges (id, challenge, kind, username, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(id, challenge, kind, username || null, Date.now() + CHALLENGE_TTL_MS).run();
  return id;
}

// Each challenge works once: it is deleted as it is read.
async function takeChallenge(env, id, kinds) {
  if (typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id)) return null;
  const row = await env.DB.prepare("DELETE FROM webauthn_challenges WHERE id = ?1 RETURNING challenge, kind, username, expires_at").bind(id).first();
  if (!row || row.expires_at < Date.now() || !kinds.includes(row.kind)) return null;
  return row;
}

async function passkeyRegisterOptions(body, env, cors) {
  const username = String(body.username || "");
  const nameErr = checkName(username);
  if (nameErr) return json({ error: nameErr }, 400, cors);
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE username = ?1").bind(username).first();
  // A claimed name can add a passkey only with its code or a session token.
  if (row && !(await authProfile(env, { username: row.username, code: body.code, token: body.token }))) {
    return json({ error: "name taken" }, 409, cors);
  }
  const name = row ? row.username : username;
  const { results: existing } = await env.DB.prepare("SELECT cred_id, transports FROM passkeys WHERE username = ?1").bind(name).all();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: name,
    userDisplayName: `${name} · Factory Run`,
    userID: await userHandle(name),
    attestationType: "none",
    timeout: 120000,
    excludeCredentials: existing.map((c) => ({ id: c.cred_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    supportedAlgorithmIDs: [-7, -257],
  });
  const challengeId = await saveChallenge(env, options.challenge, row ? "reg-add" : "reg-new", name);
  return json({ ok: true, challengeId, options }, 200, cors);
}

async function passkeyRegisterVerify(body, env, cors, origin) {
  const ch = await takeChallenge(env, body.challengeId, ["reg-new", "reg-add"]);
  if (!ch) return json({ error: "challenge expired" }, 400, cors);
  let v;
  try {
    v = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: passkeyOrigins(env),
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });
  } catch {
    return json({ error: "passkey not verified" }, 400, cors);
  }
  if (!v.verified || !v.registrationInfo) return json({ error: "passkey not verified" }, 400, cors);
  const { credential } = v.registrationInfo;
  const now = Date.now();
  const s = cleanStats(body);
  let backupCode = null;

  if (ch.kind === "reg-new") {
    // The name was free when the options were made; claim it now (or lose the race cleanly).
    backupCode = randomCode();
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO profiles (username, code_hash, best, games, gears, last_played, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
    ).bind(ch.username, await codeHash(ch.username, backupCode), s.best, s.games, s.gears, s.lastPlayed, now).run();
    if (!res.meta || res.meta.changes !== 1) return json({ error: "name taken" }, 409, cors);
  } else {
    await env.DB.prepare(
      `UPDATE profiles SET best = MAX(best, ?2), games = MAX(games, ?3), gears = MAX(gears, ?4),
         last_played = MAX(last_played, ?5), updated_at = ?6 WHERE username = ?1`
    ).bind(ch.username, s.best, s.games, s.gears, s.lastPlayed, now).run();
  }
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO passkeys (cred_id, username, public_key, counter, transports, created_at, last_used)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`
  ).bind(credential.id, ch.username, isoBase64URL.fromBuffer(credential.publicKey), credential.counter || 0,
    JSON.stringify(Array.isArray(body.response?.response?.transports) ? body.response.response.transports.slice(0, 6) : []), now).run();
  if (!ins.meta || ins.meta.changes !== 1) return json({ error: "passkey already saved" }, 409, cors);

  const token = await newSession(env, ch.username);
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE username = ?1").bind(ch.username).first();
  return json({ ok: true, token, profile: publicProfile(row), ...(backupCode ? { backupCode } : {}) }, 200, cors);
}

async function passkeyLoginOptions(env, cors) {
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred", timeout: 120000 });
  const challengeId = await saveChallenge(env, options.challenge, "login", null);
  return json({ ok: true, challengeId, options }, 200, cors);
}

async function passkeyLoginVerify(body, env, cors, origin) {
  const ch = await takeChallenge(env, body.challengeId, ["login"]);
  if (!ch) return json({ error: "challenge expired" }, 400, cors);
  const credId = body.response && typeof body.response.id === "string" ? body.response.id : "";
  if (!credId || credId.length > 1400) return json({ error: "unknown passkey" }, 401, cors);
  const pk = await env.DB.prepare("SELECT * FROM passkeys WHERE cred_id = ?1").bind(credId).first();
  if (!pk) return json({ error: "unknown passkey" }, 401, cors);
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: passkeyOrigins(env),
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: pk.cred_id,
        publicKey: isoBase64URL.toBuffer(pk.public_key),
        counter: pk.counter,
        transports: pk.transports ? JSON.parse(pk.transports) : undefined,
      },
    });
  } catch {
    return json({ error: "passkey not verified" }, 401, cors);
  }
  if (!v.verified) return json({ error: "passkey not verified" }, 401, cors);
  await env.DB.prepare("UPDATE passkeys SET counter = ?2, last_used = ?3 WHERE cred_id = ?1")
    .bind(pk.cred_id, v.authenticationInfo.newCounter || 0, Date.now()).run();
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE username = ?1").bind(pk.username).first();
  if (!row) return json({ error: "unknown passkey" }, 401, cors);
  const token = await newSession(env, row.username);
  return json({ ok: true, token, profile: publicProfile(row) }, 200, cors);
}

// A signed-in device can make a fresh backup code for a device without passkeys.
async function handleBackupCode(request, env, cors) {
  const body = await readJson(request);
  if (!body) return json({ error: "bad request" }, 400, cors);
  const username = String(body.username || "");
  if (!NAME_RE.test(username)) return json({ error: "bad request" }, 400, cors);
  const row = await env.DB.prepare("SELECT username FROM profiles WHERE username = ?1").bind(username).first();
  if (!row || !(await tokenMatches(env, row.username, body.token))) return json({ error: "not signed in" }, 401, cors);
  const code = randomCode();
  await env.DB.prepare("UPDATE profiles SET code_hash = ?2, updated_at = ?3 WHERE username = ?1")
    .bind(row.username, await codeHash(row.username, code), Date.now()).run();
  return json({ ok: true, username: row.username, code }, 200, cors);
}

async function newSession(env, username) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, username, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256hex(`factory-run-session:${token}`), username, now, now + SESSION_TTL_MS).run();
  return token;
}

async function tokenMatches(env, username, token) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return false;
  const row = await env.DB.prepare("SELECT username, expires_at FROM sessions WHERE token_hash = ?1")
    .bind(await sha256hex(`factory-run-session:${token}`)).first();
  return Boolean(row && row.expires_at > Date.now() && row.username.toLowerCase() === username.toLowerCase());
}

/* ---------- unique visitors ---------- */

async function handleHit(request, env, ip, cors) {
  const today = utcDay();
  const db = env.DB;
  await db.prepare("INSERT OR IGNORE INTO visit_salt (day, salt) VALUES (?1, ?2)").bind(today, randomHex(32)).run();
  const saltRow = await db.prepare("SELECT salt FROM visit_salt WHERE day = ?1").bind(today).first();
  await db.prepare("DELETE FROM visit_salt WHERE day <> ?1").bind(today).run();

  const ua = request.headers.get("User-Agent") || "";
  const hash = await sha256hex(saltRow.salt + ip + ua);
  const ins = await db.prepare("INSERT OR IGNORE INTO visits (day, hash) VALUES (?1, ?2)").bind(today, hash).run();
  if (ins.meta && ins.meta.changes === 1) {
    await db.prepare(
      "INSERT INTO daily_uniques (day, uniques) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET uniques = uniques + 1"
    ).bind(today).run();
  }
  await db.prepare("DELETE FROM visits WHERE day < ?1").bind(utcDay(-VISIT_RETENTION_DAYS)).run();
  return new Response(null, { status: 204, headers: cors });
}

async function handleStats(request, env) {
  // Private: no CORS headers, and nothing without a valid Access JWT.
  if (!(await verifyAccessJwt(request, env))) return json({ error: "forbidden" }, 403);
  const { results } = await env.DB.prepare(
    "SELECT day, uniques FROM daily_uniques WHERE day >= ?1 ORDER BY day DESC"
  ).bind(utcDay(-(VISIT_RETENTION_DAYS - 1))).all();
  const all = await env.DB.prepare("SELECT COALESCE(SUM(uniques), 0) AS total, COUNT(*) AS days FROM daily_uniques").first();
  const today = utcDay();
  return json({
    today: (results.find((r) => r.day === today) || { uniques: 0 }).uniques,
    last30Days: results,
    last30Total: results.reduce((a, r) => a + r.uniques, 0),
    allTimeTotal: all.total,
    daysTracked: all.days,
    note: "Daily uniques; the same visitor on two days counts twice.",
    retention: await retentionStats(env),
  }, 200, { "Cache-Control": "no-store" });
}

// Round 6, from the runs table only (names, never IPs), last 30 Vancouver days:
// day-1 / day-7 return (of names whose first run was on day D, how many ran on D+1 / D+7),
// runs per session (a session ends after 30 minutes without a run), Daily Run participation.
async function retentionStats(env) {
  const since = addDays(vanDay(), -37);
  const { results } = await env.DB.prepare(
    "SELECT username, created_at, day, mode FROM scores WHERE day IS NOT NULL AND day >= ?1 ORDER BY username, created_at"
  ).bind(since).all();
  const first = new Map(), days = new Map();
  let sessions = 0, runs = 0, prevU = "", prevT = 0;
  const perDay = new Map();
  for (const r of results) {
    const u = r.username.toLowerCase();
    if (!days.has(u)) days.set(u, new Set());
    days.get(u).add(r.day);
    runs++;
    if (u !== prevU || r.created_at - prevT > 30 * 60_000) sessions++;
    prevU = u; prevT = r.created_at;
    const pd = perDay.get(r.day) || { players: new Set(), daily: new Set() };
    pd.players.add(u); if (r.mode === "daily") pd.daily.add(u);
    perDay.set(r.day, pd);
  }
  // First day seen: the earliest day in range (names first seen before the range are skipped).
  const all = await env.DB.prepare("SELECT username, MIN(created_at) AS t FROM scores GROUP BY username").all();
  for (const r of all.results) first.set(r.username.toLowerCase(), vanDay(r.t));
  const today = vanDay();
  const ret = (n) => {
    let base = 0, back = 0;
    for (const [u, d0] of first) {
      if (d0 < addDays(today, -30) || addDays(d0, n) > addDays(today, -1)) continue;
      base++;
      if (days.get(u) && days.get(u).has(addDays(d0, n))) back++;
    }
    return { cohort: base, returned: back, rate: base ? +(back / base).toFixed(3) : null };
  };
  const daily = [...perDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30)
    .map(([day, v]) => ({ day, players: v.players.size, dailyRunPlayers: v.daily.size, share: v.players.size ? +(v.daily.size / v.players.size).toFixed(3) : 0 }));
  return { day1: ret(1), day7: ret(7), runsPerSession: sessions ? +(runs / sessions).toFixed(2) : null, runs, sessions, dailyRun: daily, since };
}

/* ---------- Cloudflare Access JWT ---------- */

let jwksCache = { team: "", keys: null, at: 0 };

async function verifyAccessJwt(request, env) {
  try {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    const team = String(env.ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const aud = String(env.ACCESS_AUD || "");
    if (!token || !team || !aud) return false;

    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(b64urlToString(parts[0]));
    const payload = JSON.parse(b64urlToString(parts[1]));
    if (header.alg !== "RS256") return false;

    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== `https://${team}`) return false;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return false;
    if (typeof payload.exp !== "number" || payload.exp < now) return false;
    if (typeof payload.nbf === "number" && payload.nbf > now + 60) return false;

    const keys = await getJwks(team);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    return false;
  }
}

async function getJwks(team) {
  if (jwksCache.team === team && jwksCache.keys && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("certs fetch failed");
  const data = await res.json();
  jwksCache = { team, keys: data.keys || [], at: Date.now() };
  return jwksCache.keys;
}

/* ---------- helpers ---------- */

function checkName(name) {
  if (!NAME_RE.test(name)) return "username must be 3-16 letters, numbers or _";
  const base = name.toLowerCase().replace(/_/g, "");
  const leet = (s, one) => s.replace(/0/g, "o").replace(/1/g, one).replace(/3/g, "e").replace(/4/g, "a")
    .replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/9/g, "g");
  const variants = [base, leet(base, "i"), leet(base, "l")];
  if (variants.some((v) => BLOCKLIST.some((w) => v.includes(w)))) return "username not allowed";
  return "";
}

/* ---------- Garage (r7): robot name + design code ---------- */
// Optional on POST /score and in profile cosmetics. Bad or rude values are dropped (never an error),
// so old clients and odd input still post their score.
const ROBOT_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,15}$/;
const DESIGN_RE = /^[0-3][0-2][0-3][01][A-Z0-9-]{0,8}$/;
function rude(s) {
  const b = String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const leet = (x, one) => x.replace(/0/g, "o").replace(/1/g, one).replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/9/g, "g");
  return [b, leet(b, "i"), leet(b, "l")].some((v) => BLOCKLIST.some((w) => v.includes(w)));
}
function cleanRobot(v) {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s && ROBOT_RE.test(s) && !rude(s) ? s : null;
}
function cleanDesign(v) {
  if (typeof v !== "string" || !DESIGN_RE.test(v)) return null;
  return rude(v.slice(4)) ? v.slice(0, 4) : v;
}

async function rateLimit(env, ip, bucket, limit) {
  const win = currentWindow();
  const key = await sha256hex(`${bucket}:${ip}:${win}`);
  await env.DB.prepare("DELETE FROM rate_limits WHERE win < ?1").bind(win - 1).run();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, win, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key, win) DO UPDATE SET count = count + 1 RETURNING count`
  ).bind(key, win).first();
  return !row || row.count <= limit;
}

function currentWindow() {
  return Math.floor(Date.now() / 60_000);
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "https://auamai.github.io,https://auamai.dev")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin, allowed) {
  if (!allowed.includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

async function readJson(request, max = 2048) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > max) return null;
  try {
    const text = await request.text();
    if (text.length > max) return null;
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function utcDay(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToString(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}
