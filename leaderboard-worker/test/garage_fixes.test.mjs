// r7 integration fixes to the Garage Worker code (security review): Spare Servos capped by spent gears,
// unmigrated-DB fallback only on a missing column, word-boundary blocklist for robot names / plates,
// robot names can't pose as another player. Node 22+ (node:sqlite), in-memory D1 stand-in; never touches production.
//   WORKER_BUNDLE=./dist/index.js node --no-warnings test/garage_fixes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const { default: worker } = await import(resolve(process.env.WORKER_BUNDLE || resolve(here, "../dist/index.js")));
function mkDb(migrate, hook) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(resolve(here, "../schema.sql"), "utf8"));
  for (const f of ["migrate_r6.sql", ...(migrate ? ["migrate_r7.sql"] : [])]) for (const st of readFileSync(resolve(here, "..", f), "utf8").split(";").map((x) => x.replace(/--.*$/gm, "").trim()).filter(Boolean)) { try { db.exec(st); } catch (e) { if (!/duplicate column/.test(e.message)) throw e; } }
  return { db, D1: { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return db.prepare(sql).get(...a) ?? null; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { if (hook) hook(sql); const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; } } };
}
const O = "https://servosprint.xyz";
let ip = 1;
const mk = (D1) => async (method, path, body) => {
  const headers = { Origin: O, "CF-Connecting-IP": `8.8.${ip++ % 250}.1`, "User-Agent": "t" };
  if (body) headers["Content-Type"] = "application/json";
  const res = await worker.fetch(new Request("https://api.x" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), { DB: D1, ALLOWED_ORIGINS: O, ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" }, {});
  const t = await res.text(); let b = null; try { b = t ? JSON.parse(t) : null; } catch { b = t; } return { s: res.status, b };
};
let fails = 0; const ok = (c, m, i = "") => { console.log((c ? "PASS " : "FAIL ") + m + (c ? "" : " " + JSON.stringify(i))); if (!c) fails++; };
{
  const { D1 } = mkDb(true), call = mk(D1);
  const cl = await call("POST", "/profile/claim", { username: "srv_a", gears: 5000, games: 1, lastPlayed: 1 });
  const auth = { username: "srv_a", code: cl.b.code };
  const sync = (cos, gears = 5000) => call("POST", "/profile/sync", { ...auth, best: 1, games: 2, gears, lastPlayed: 2, cos: { owned: [], eq: {}, ...cos } });
  let r = await sync({ spent: 0, sv: { b: 50, u: 0 } });
  ok(r.s === 200 && r.b.profile.cos.sv.b === 0, "servos with no gears spent are refused", r.b.profile.cos);
  r = await sync({ spent: 900, sv: { b: 2, u: 0 } });
  ok(r.b.profile.cos.sv.b === 2 && r.b.profile.cos.sv.u === 0, "two servos paid for (900 spent) are kept", r.b.profile.cos);
  r = await sync({ spent: 900, sv: { b: 9, u: 0 } });
  ok(r.b.profile.cos.sv.b === 2, "a modified client can't sync more servos than the spent gears bought", r.b.profile.cos);
  r = await sync({ spent: 3150, sv: { b: 7, u: 0 } });
  ok(r.b.profile.cos.sv.b === 3 && r.b.profile.cos.sv.u === 0, "never more than 3 held at once", r.b.profile.cos);
  r = await sync({ spent: 3150, sv: { b: 7, u: 3 } });
  ok(r.b.profile.cos.sv.b === 6 && r.b.profile.cos.sv.u === 3, "used servos free room to hold more (bought <= used + 3, <= spent / 450)", r.b.profile.cos);
  // word-boundary blocklist (each name on a fresh board so the row shows that name)
  const boardRobot = async (robot, design) => { const c = mk(mkDb(true).D1); await c("POST", "/score", { username: "nm_test", score: 300, durationMs: 30000, robot, design }); return (await c("GET", "/scores")).b.scores[0]; };
  const good = ["Sussex", "Dickens", "Grape Ape", "Swanky", "Essex Unit", "Scraper 9"];
  const goodRes = []; for (const n of good) goodRes.push([(await boardRobot(n)).robot, n]);
  ok(goodRes.every(([a, n]) => a === n), "ordinary names (Sussex, Dickens, Grape Ape, Swanky, Essex Unit, Scraper 9) pass", goodRes);
  const bad = ["Sex Bot", "dick", "S3x", "Fuck Unit", "F u c k", "Sh1tbot", "Nazis", "rapey"];
  const badRes = []; for (const n of bad) badRes.push([(await boardRobot(n)).robot, n]);
  ok(badRes.every(([a]) => a === undefined), "rude names still dropped (whole word, leet, spaced out, plural, long stems inside words)", badRes);
  ok((await boardRobot(undefined, "1000ESSEX")).design === "1000ESSEX" && (await boardRobot(undefined, "1000SEX-1")).design === "1000", "plates: ESSEX passes, SEX-1 is cut");
  // impersonation
  const ace = await call("POST", "/profile/claim", { username: "Real_Ace", gears: 0, games: 1, lastPlayed: 1 });
  await call("POST", "/score", { username: "faker", score: 300, durationMs: 30000, robot: "real_ace" });
  await call("POST", "/score", { username: "Real_Ace", code: ace.b.code, score: 290, durationMs: 30000, robot: "Real_Ace" });
  const rs = (await call("GET", "/scores")).b.scores;
  const fk = rs.find((x) => x.username === "faker"), ra = rs.find((x) => x.username === "Real_Ace");
  ok(fk && !("robot" in fk) && ra && ra.robot === "Real_Ace", "a robot name equal to another player's username is dropped (own name allowed)", rs);
  r = await sync({ spent: 3150, sv: { b: 6, u: 3 }, d: { name: "Real_Ace", code: "1000", at: 9 } });
  ok(r.b.profile.cos.d.name === "", "sync drops a robot name that is another player's username", r.b.profile.cos.d);
}
{
  // unmigrated DB: missing columns fall back; any other database error is a real failure (500), not a silent old-style insert
  const { D1 } = mkDb(false), call = mk(D1);
  let r = await call("POST", "/score", { username: "old_db", score: 500, durationMs: 30000, robot: "Unit" });
  ok(r.s === 200, "unmigrated DB: 'no such column' falls back and stores the run");
  const { D1: D2 } = mkDb(true, (sql) => { if (/INSERT INTO scores/.test(sql)) throw new Error("D1_ERROR: database is locked"); }), call2 = mk(D2);
  r = await call2("POST", "/score", { username: "lock_db", score: 500, durationMs: 30000, robot: "Unit" });
  ok(r.s >= 500, "other database errors are not swallowed by the fallback", r);
}
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exitCode = fails ? 1 : 0;
