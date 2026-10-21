// Servo Sprint: everything around a run that brings you back. The Daily Run (one seeded course a
// day, America/Vancouver), the daily streak with one free miss a week, missions, the gear shop,
// near-miss nudges, the share card, beat-my-run links, and the read-only summary the site teaser
// reads. Pure helpers plus small state kept in the settings bag; see game/README.md for the keys.

export const TZ = "America/Vancouver";
const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });

// "YYYY-MM-DD" on the Vancouver calendar.
export const vanDay = (ms = Date.now()) => fmtDay.format(new Date(ms));
const dayNum = (d) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5);
export const dayDiff = (a, b) => dayNum(b) - dayNum(a);
const addDays = (d, n) => new Date((dayNum(d) + n) * 864e5).toISOString().slice(0, 10);

// Next Vancouver midnight (daily reset) and next Monday 00:00 (weekly reset), as epoch ms.
export function nextMidnight(ms = Date.now()) {
  const p = Object.fromEntries(fmtParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  let t = ms + ((24 - +p.hour) * 3600 - +p.minute * 60 - +p.second) * 1000;
  t -= t % 1000;
  // Across a DST change the day is 23 or 25 hours: nudge to the real boundary.
  const today = vanDay(ms);
  while (vanDay(t - 1) !== today && t > ms) t -= 3600e3;
  while (vanDay(t) === today) t += 3600e3;
  return t;
}
export function weekOf(ms = Date.now()) {
  const p = Object.fromEntries(fmtParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday] || 0;
  return addDays(vanDay(ms), -back); // that week's Monday
}
export function nextMonday(ms = Date.now()) {
  let t = nextMidnight(ms);
  for (let i = 0; i < 7 && weekOf(t) === weekOf(ms); i++) t = nextMidnight(t + 1000);
  return t;
}

/* ---------- seeded courses ---------- */
// FNV-1a, the same on the Worker, so it can check a daily run's seed.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const dailySeed = (day) => hash32(`factory-run-daily:${day}`);
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- daily streak ---------- */
// One Daily Run a day keeps it. One missed day a week is forgiven (a "free miss").
export function bumpStreak(st, day) {
  st = { n: 0, last: "", freeWeek: "", ...(st || {}) };
  if (st.last === day) return st;
  const gap = st.last ? dayDiff(st.last, day) : 99;
  const wk = weekOf(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 20));
  if (gap === 1) st.n += 1;
  else if (gap === 2 && st.freeWeek !== wk) { st.n += 1; st.freeWeek = wk; st.usedFree = day; }
  else st.n = 1;
  st.last = day;
  return st;
}
// The streak as of today: still alive if you played yesterday (or the day before with the free miss left).
export function liveStreak(st, today = vanDay()) {
  if (!st || !st.last) return { n: 0, alive: false, playedToday: false, freeLeft: true };
  const gap = dayDiff(st.last, today);
  const freeLeft = st.freeWeek !== weekOf();
  return { n: gap <= 1 || (gap === 2 && freeLeft) ? st.n : 0, alive: gap <= 1 || (gap === 2 && freeLeft), playedToday: gap === 0, freeLeft };
}

/* ---------- missions ---------- */
// Pool by kind (skill, route, collect, style), so the three active missions ask for different things.
// "oneRun" goals are a best single run; the rest add up across runs. Old ids keep their meaning (saved progress
// stays valid). Rewards stay 40-90 gears, so the Spare Servo (450) is still 2-3 good runs plus missions.
export const MISSIONS = [
  { id: "smash10", kind: "style", stat: "smash", goal: 10, text: "Smash 10 crates or robots", reward: 60 },
  { id: "gold8", kind: "style", stat: "goldT", goal: 8, text: "Hold the golden wrench 8 s", reward: 80 },
  { id: "screw50", kind: "collect", stat: "screws", goal: 50, text: "Collect 50 screws", reward: 50 },
  { id: "gear60", kind: "collect", stat: "gearsRun", goal: 60, text: "Grab 60 gears in one run", reward: 60, oneRun: true },
  { id: "tools5", kind: "collect", stat: "tools", goal: 5, text: "Pick up 5 tools", reward: 50 },
  { id: "over1", kind: "style", stat: "over", goal: 1, text: "Fill the toolbox for Overdrive", reward: 70 },
  { id: "daily1", kind: "route", stat: "daily", goal: 1, text: "Run today's Daily Run", reward: 40 },
  { id: "jump30", kind: "skill", stat: "jumps", goal: 30, text: "Jump 30 times", reward: 40 },
  { id: "score1500", kind: "skill", stat: "score", goal: 1500, text: "Score 1,500 in one run", reward: 70, oneRun: true },
  // r7.2 pool
  { id: "slide15", kind: "skill", stat: "slides", goal: 15, text: "Slide 15 times", reward: 40 },
  { id: "time75", kind: "skill", stat: "time", goal: 75, text: "Last 75 s in one run", reward: 70, oneRun: true },
  { id: "dist1k", kind: "route", stat: "dist", goal: 1000, text: "Run 1 km in one run", reward: 70, oneRun: true },
  { id: "dist4k", kind: "route", stat: "dist", goal: 4000, text: "Cover 4 km in total", reward: 60 },
  { id: "screwrun", kind: "collect", stat: "screws", goal: 20, text: "Grab 20 screws in one run", reward: 60, oneRun: true },
  { id: "mult3", kind: "style", stat: "mult", goal: 3, text: "Reach a ×3 multiplier", reward: 80, oneRun: true },
  { id: "clean600", kind: "style", stat: "clean", goal: 600, text: "Score 600 without a tool", reward: 90, oneRun: true },
];
// First session: three starter missions a first run finishes (jump, slide, bank gears), so the Toolbox fills
// and the loop is taught by doing. Never drawn again once done.
export const STARTER = [
  { id: "s-jump", kind: "start", stat: "jumps", goal: 3, text: "Jump 3 times", reward: 20 },
  { id: "s-slide", kind: "start", stat: "slides", goal: 2, text: "Slide twice", reward: 20 },
  { id: "s-gears", kind: "start", stat: "gearsRun", goal: 10, text: "Grab 10 gears in one run", reward: 30, oneRun: true },
];
const ALL_M = MISSIONS.concat(STARTER);
const mDef = (id) => ALL_M.find((x) => x.id === id);
const mUnit = { score: "", gearsRun: "", screws: "", smash: "", tools: "", jumps: "", slides: "", over: "", daily: "", goldT: " s", time: " s", dist: " m", mult: "×", clean: "" };
export const STARTER_LIST = () => STARTER.map((m) => ({ id: m.id, prog: 0 }));
// Fill to three, preferring kinds not already showing. rnd is injectable for tests.
export function missionsFill(list = [], rnd = Math.random, avoid = "") {
  list = (Array.isArray(list) ? list : []).filter((m) => m && mDef(m.id)).map((m) => ({ id: m.id, prog: Number.isFinite(m.prog) && m.prog > 0 ? m.prog : 0 })).slice(0, 3);
  while (list.length < 3) {
    const kinds = new Set(list.map((m) => mDef(m.id).kind));
    let pool = MISSIONS.filter((x) => x.id !== avoid && !list.some((m) => m.id === x.id));
    const fresh = pool.filter((x) => !kinds.has(x.kind));
    if (fresh.length) pool = fresh;
    const m = pool[Math.floor(rnd() * pool.length)];
    list.push({ id: m.id, prog: 0 });
  }
  return list;
}
// Apply one run's stats. Returns { list, done: [mission...] } with finished ones replaced.
export function missionsApply(list, stats, rnd) {
  const done = [];
  list = missionsFill(list, rnd).map((m) => {
    const d = mDef(m.id);
    const v = stats[d.stat] || 0;
    const prog = d.oneRun ? Math.max(m.prog, v) : m.prog + v;
    if (prog >= d.goal) { done.push(d); return null; }
    return { id: m.id, prog };
  }).filter(Boolean);
  return { list: missionsFill(list, rnd), done };
}
export const missionInfo = (m) => ({ ...mDef(m.id), prog: m.prog });
// "12 / 50", "640 / 1,000 m", "×2.4 / ×3": progress a player can read at a glance.
export function missionProg(m) {
  const d = missionInfo(m), u = mUnit[d.stat] || "", p = Math.min(d.stat === "mult" ? Math.max(1, d.prog) : d.prog, d.goal);
  const n = (v) => (d.stat === "mult" ? (Math.floor(v * 10) / 10).toString() : fmtN(v));
  return u === "×" ? `×${n(p)} / ×${n(d.goal)}` : `${n(p)} / ${n(d.goal)}${u}`;
}
// Swap one mission: one free swap a day (Vancouver day), never on starter missions. Returns null when not allowed.
export const REROLLS = 1;
export function rerollsLeft(rr, day = vanDay()) { return rr && rr.day === day ? Math.max(0, REROLLS - (rr.n | 0)) : REROLLS; }
export function reroll(list, idx, rr, day = vanDay(), rnd = Math.random) {
  list = missionsFill(list, rnd);
  const cur = list[idx];
  if (!cur || mDef(cur.id).kind === "start" || rerollsLeft(rr, day) <= 0) return null;
  const rest = list.filter((_, i) => i !== idx);
  const next = missionsFill(rest, rnd, cur.id).slice(-1)[0];
  rest.splice(idx, 0, next);
  return { list: rest, rr: { day, n: (rr && rr.day === day ? rr.n | 0 : 0) + 1 } };
}

/* ---------- weekly goal ---------- */
// Finish 8 missions between Monday and Sunday (Vancouver): +150 gears, once a week.
export const WEEKLY = { goal: 8, reward: 150 };
export function weekNow(w, wk = weekOf()) { return w && w.wk === wk ? { wk, n: w.n | 0, paid: !!w.paid } : { wk, n: 0, paid: false }; }
export function weekAdd(w, k, wk = weekOf()) {
  const cur = weekNow(w, wk);
  cur.n += k;
  const pay = !cur.paid && cur.n >= WEEKLY.goal;
  if (pay) cur.paid = true;
  return { w: cur, pay: pay ? WEEKLY.reward : 0 };
}

/* ---------- Daily twist ---------- */
// One extra goal for the Daily Run, picked from the day's seed: the same for every player, judged only on the
// Daily Run, worth +50 gears once a day. Rules only: the course and the sim are untouched, so the Daily Run
// and every replay stay identical.
export const TWISTS = [
  { id: "t-screws", stat: "screws", goal: 20, text: "Grab 20 screws" },
  { id: "t-smash", stat: "smash", goal: 4, text: "Smash 4 crates or robots" },
  { id: "t-time", stat: "time", goal: 60, text: "Last 60 s" },
  { id: "t-dist", stat: "dist", goal: 900, text: "Run 900 m" },
  { id: "t-mult", stat: "mult", goal: 2, text: "Reach a ×2 multiplier" },
  { id: "t-jumps", stat: "jumps", goal: 15, text: "Jump 15 times" },
  { id: "t-clean", stat: "clean", goal: 400, text: "Score 400 without a tool" },
];
export const TWIST_REWARD = 50;
export const twistOf = (day) => TWISTS[hash32(`servo-twist:${day}`) % TWISTS.length];
export function twistCheck(tw, stats, day) {
  const t = twistOf(day), paid = !!(tw && tw.day === day && tw.done);
  if (paid || !stats.daily) return { t, done: paid, pay: 0, tw: paid ? tw : { day, done: false } };
  const ok = (stats[t.stat] || 0) >= t.goal;
  return { t, done: ok, pay: ok ? TWIST_REWARD : 0, tw: { day, done: ok } };
}

/* ---------- Line grade (level track) ---------- */
// Grade from lifetime gears banked (profile.gears: runs, missions, rewards). Grade n needs 50·n·(n-1) gears:
// 2 at 100, 3 at 300, 4 at 600, 5 at 1,000 ... 10 at 4,500. Each new grade pays 10·n gears into the Toolbox
// (once, tracked by profile.lv) and some unlock Garage options.
export const GRADE_MAX = 30;
export const gradeAt = (n) => 50 * n * (n - 1);
export function gradeOf(xp) {
  let n = 1;
  while (n < GRADE_MAX && xp >= gradeAt(n + 1)) n++;
  const lo = gradeAt(n), hi = n < GRADE_MAX ? gradeAt(n + 1) : lo;
  return { n, lo, hi, q: hi > lo ? (xp - lo) / (hi - lo) : 1 };
}
export const gradeReward = (n) => 10 * n;
// Garage unlocks earned by grade: [kind, index, grade, label].
export const UNLOCKS = [
  ["pattern", 4, 2, "Rivets pattern"], ["accent", 2, 3, "Off-white plate ink"], ["paint", 4, 4, "Gunmetal paint"],
  ["pattern", 5, 6, "Pinstripe pattern"],
];
export const unlockFor = (kind, i) => UNLOCKS.find((u) => u[0] === kind && u[1] === i) || null;
export const isUnlocked = (kind, i, lv) => { const u = unlockFor(kind, i); return !u || (lv | 0) >= u[2]; };
export const unlocksAt = (n) => UNLOCKS.filter((u) => u[2] === n).map((u) => u[3]);
// Pay any grades reached since the last claim. Mutates p (gears, lv); returns [{ n, reward, unlocks }].
export function gradeClaim(p) {
  const out = [];
  if (!p) return out;
  p.lv = Math.max(1, p.lv | 0);
  for (let guard = 0; guard < GRADE_MAX && gradeOf(p.gears).n > p.lv; guard++) {
    p.lv += 1;
    const reward = gradeReward(p.lv);
    p.gears += reward;
    out.push({ n: p.lv, reward, unlocks: unlocksAt(p.lv) });
  }
  return out;
}
// One-time progression migration (r7.2, stamp pg: 1): an old save starts at the grade its gears already earned,
// with no back-pay (a veteran doesn't get a lump that makes the Spare Servo free); unlocks follow the grade.
export function migrateProgress(p) {
  if (!p || p.pg === 1) return false;
  p.lv = Math.max(p.lv | 0, gradeOf(p.gears | 0).n);
  p.pg = 1;
  return true;
}

/* ---------- gear shop ---------- */
// Cosmetic only. Prices in gears; the wallet is gears earned minus gears spent.
export const SHOP = [
  { id: "trim-navy", kind: "trim", name: "Cyan pinstripe", price: 200, light: 0x1fa9cc, deep: 0x2c3037 },
  { id: "trim-ice", kind: "trim", name: "Cyan frost", price: 350, light: 0xe9fbff, deep: 0x9beaff },
  { id: "trail-ribbon", kind: "trail", name: "Cyan arc", price: 250, color: 0x3ddcff },
  { id: "trail-navy", kind: "trail", name: "Steel dash", price: 300, color: 0x6b707a },
  { id: "trail-pearl", kind: "trail", name: "White sparks", price: 400, color: 0xf2f0ea },
  { id: "hammer-navy", kind: "hammer", name: "Graphite hammer", price: 150, color: 0x3a3e46 },
  { id: "hammer-pearl", kind: "hammer", name: "Off-white hammer", price: 300, color: 0xf2f0ea },
];
export const cosClean = (c) => {
  c = c && typeof c === "object" ? c : {};
  const ids = new Set(SHOP.map((s) => s.id));
  const owned = Array.isArray(c.owned) ? [...new Set(c.owned.filter((x) => ids.has(x)))] : [];
  const eq = {};
  for (const k of ["trim", "trail", "hammer"]) if (c.eq && typeof c.eq[k] === "string") eq[k] = c.eq[k];
  const n = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  // Spare Servo: b bought, u used (both only grow, so two devices merge with max).
  const sv = c.sv && typeof c.sv === "object" ? { b: n(c.sv.b), u: Math.min(n(c.sv.u), n(c.sv.b)) } : { b: 0, u: 0 };
  const out = { spent: n(c.spent), owned, eq, sv };
  const d = designClean(c.d);
  if (d) out.d = d;
  return out;
};
// Toolbox: the wallet is gears earned (runs + missions) minus gears spent. Never negative.
export const wallet = (p) => Math.max(0, (p ? p.gears : 0) - cosClean(p && p.cos).spent);

/* ---------- Spare Servo ---------- */
// One revive per run, bought with gears, never in the Daily Run. Price: a good 90 s run banks
// ~140 gears (daily_like golden: 141) plus a mission (~60), so 450 is about 2-3 good runs.
export const SERVO = { price: 450, max: 3 };
export const servoCount = (p) => { const s = cosClean(p && p.cos).sv; return Math.max(0, s.b - s.u); };

/* ---------- Garage design: robot name, chassis plate, paint, finish, pattern, accent ---------- */
// Compact code shared with the Worker: 4 digits (paint finish pattern accent) + plate text.
// r7.2: paint 4, pattern 4-5 and accent 2 are earned by Line grade (UNLOCKS); the Worker accepts the wider range.
export const PAINTS = [["Off-white", 0xf2f0ea], ["Graphite", 0x2c3037], ["Signal yellow", 0xffc93c], ["Cyan", 0x3ddcff], ["Gunmetal", 0x4a4f58]];
export const FINISHES = [["Gloss", 0.3, 1], ["Satin", 0.5, 0.45], ["Matte", 0.78, 0]];
export const PATTERNS = ["Plain", "Hazard", "Grid", "Chevron", "Rivets", "Pinstripe"];
export const ACCENTS = [["Yellow", "#FFC93C"], ["Cyan", "#3DDCFF"], ["Off-white", "#F2F0EA"]];
const DESIGN_RE = /^[0-4][0-2][0-5][0-2][A-Z0-9-]{0,8}$/;
const RNAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,15}$/;
const BAD = ["fuck", "shit", "bitch", "cunt", "dick", "pussy", "nigg", "fag", "slut", "whore", "rape", "nazi", "hitler",
  "porn", "penis", "vagina", "asshole", "bastard", "retard", "kike", "chink", "twat", "wank", "jizz", "dildo", "sex"];
// Same rule as the Worker: short stems that hide inside ordinary words (Sussex, Dickens, grape, swanky)
// only match a whole word (plus -s / -y); every other stem matches anywhere, across spaces too.
const WORD_ONLY = new Set(["sex", "dick", "rape", "fag", "wank", "twat", "kike", "chink", "nazi"]);
export function rudeText(s) {
  const leet = (x, one) => x.replace(/0/g, "o").replace(/1/g, one).replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/9/g, "g");
  const vs = (x) => [x, leet(x, "i"), leet(x, "l")];
  const words = String(s).toLowerCase().replace(/\$/g, "s").split(/[^a-z0-9]+/).filter(Boolean), all = words.join("");
  return BAD.some((w) => WORD_ONLY.has(w)
    ? words.some((t) => vs(t).some((v) => v === w || v === w + "s" || v === w + "y"))
    : vs(all).some((v) => v.includes(w)));
}
// Tidy what a player types: trim, squash spaces, drop anything outside the allowed set, cut to length.
export const tidyName = (s) => String(s || "").replace(/\s+/g, " ").replace(/[^A-Za-z0-9 _.-]/g, "").trim().slice(0, 16);
export const tidyPlate = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
export function checkRobotName(s) {
  if (!s) return "";
  if (!RNAME_RE.test(s)) return "Up to 16 letters, numbers, spaces or - _ .";
  return rudeText(s) ? "Try a different name" : "";
}
export const checkPlate = (s) => (rudeText(s) ? "Try different plate text" : "");
export function designClean(d) {
  if (!d || typeof d !== "object") return null;
  const name = tidyName(d.name), code = typeof d.code === "string" && DESIGN_RE.test(d.code) ? d.code : "0000";
  const plate = code.slice(4);
  return {
    name: checkRobotName(name) ? "" : name,
    code: checkPlate(plate) ? code.slice(0, 4) : code,
    at: Number.isFinite(d.at) && d.at > 0 ? Math.floor(d.at) : 0,
  };
}
export const designParts = (code) => {
  const c = typeof code === "string" && DESIGN_RE.test(code) ? code : "0000";
  return { paint: +c[0], finish: +c[1], pattern: +c[2], accent: +c[3], plate: c.slice(4) };
};
export const designCode = (o) => `${o.paint | 0}${o.finish | 0}${o.pattern | 0}${o.accent | 0}${tidyPlate(o.plate)}`;
export const DESIGN_DEFAULT = "0000";
// The chassis plate: machined graphite with the pattern and plate text in the accent colour.
// Used for the robot's texture, the share card and the "Show my robot" image.
export function drawPlate(ctx, x, y, w, h, code) {
  const d = designParts(code), acc = ACCENTS[d.accent][1];
  ctx.save();
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, h * 0.14) : ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = "#14161B"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = acc; ctx.fillStyle = acc; ctx.globalAlpha = 0.32; ctx.lineWidth = h * 0.09;
  if (d.pattern === 1) { for (let i = -h; i < w + h; i += h * 0.36) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); } }
  else if (d.pattern === 2) { const g = h / 6; for (let i = g; i < w; i += g * 1.6) for (let j = g; j < h; j += g * 1.6) { ctx.beginPath(); ctx.arc(x + i, y + j, g * 0.22, 0, 7); ctx.fill(); } }
  else if (d.pattern === 3) { for (let i = -h * 0.2; i < w; i += h * 0.42) { ctx.beginPath(); ctx.moveTo(x + i, y + h * 0.15); ctx.lineTo(x + i + h * 0.3, y + h * 0.5); ctx.lineTo(x + i, y + h * 0.85); ctx.stroke(); } }
  else if (d.pattern === 4) { const r = h * 0.05; for (const [px, py] of [[0.1, 0.18], [0.9, 0.18], [0.1, 0.82], [0.9, 0.82], [0.5, 0.18], [0.5, 0.82]]) { ctx.beginPath(); ctx.arc(x + w * px, y + h * py, r, 0, 7); ctx.fill(); } }
  else if (d.pattern === 5) { ctx.lineWidth = h * 0.035; for (const py of [0.2, 0.27, 0.73, 0.8]) { ctx.beginPath(); ctx.moveTo(x, y + h * py); ctx.lineTo(x + w, y + h * py); ctx.stroke(); } }
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(2, h * 0.05); ctx.strokeStyle = "rgba(242,240,234,0.35)"; ctx.strokeRect(x + h * 0.06, y + h * 0.06, w - h * 0.12, h - h * 0.12);
  const t = d.plate || "SS";
  ctx.font = `600 ${Math.round(h * 0.5)}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const fit = Math.min(1, (w * 0.84) / Math.max(1, ctx.measureText(t).width));
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(fit, 1);
  ctx.fillStyle = "#14161B"; ctx.fillText(t, 2, 2);
  ctx.fillStyle = acc; ctx.fillText(t, 0, 0);
  ctx.restore();
}

/* ---------- Toolbox transactions ---------- */
// Spend gears without ever going negative or spending twice: re-read the saved profile first
// (another tab may have spent since this one loaded), merge, check, apply, save, all in one
// synchronous step. Returns the new wallet, or -1 when there isn't enough.
export function spend(p, price, apply, reload, save) {
  const disk = reload && reload();
  if (disk && disk.username === p.username) {
    p.gears = Math.max(p.gears, disk.gears);
    const a = cosClean(p.cos), b = cosClean(disk.cos);
    p.cos = { ...a, spent: Math.max(a.spent, b.spent), owned: [...new Set([...a.owned, ...b.owned])], sv: { b: Math.max(a.sv.b, b.sv.b), u: Math.max(a.sv.u, b.sv.u) }, ...(a.d || b.d ? { d: (b.d && (!a.d || b.d.at > a.d.at)) ? b.d : a.d } : {}) };
  }
  if (!(price >= 0) || wallet(p) < price) return -1;
  const cos = cosClean(p.cos);
  cos.spent += price;
  apply(cos);
  p.cos = cos;
  save(p);
  return wallet(p);
}
// One-time Toolbox migration (r7): the wallet already was gears minus spent, so the balance a
// player had is kept exactly; this only stamps the profile so it never runs twice.
export function migrateToolbox(p) {
  if (!p || p.tb === 1) return false;
  p.cos = cosClean(p.cos);
  p.tb = 1;
  return true;
}

/* ---------- near-miss nudge ---------- */
export function nearMiss({ score, prevBest, missions, board, me }) {
  const out = [];
  if (prevBest > 0 && score < prevBest && prevBest - score <= Math.max(60, prevBest * 0.2)) out.push({ w: 3, text: `${fmtN(prevBest - score)} to your best` });
  for (const m of missions || []) {
    const d = missionInfo(m), left = d.goal - d.prog;
    if (d.stat !== "mult" && left > 0 && left <= Math.max(2, d.goal * 0.25)) out.push({ w: 2, text: `${fmtN(left)} ${unit(d.stat, left)} from a mission` });
  }
  if (board && board.length) {
    const above = board.filter((r) => r.score > score && r.username.toLowerCase() !== (me || "").toLowerCase());
    if (above.length && above.length <= 10) {
      const k = above.length, need = above[k - 1].score - score + 1;
      if (need <= Math.max(80, score * 0.25)) out.push({ w: 1, text: `${fmtN(need)} to pass #${k}` });
    }
  }
  return out.sort((a, b) => b.w - a.w)[0] || null;
}
const fmtN = (n) => Math.floor(n).toLocaleString("en-US");
const unit = (stat, n) => ({ smash: n === 1 ? "smash" : "smashes", screws: "screws", gearsRun: "gears", tools: n === 1 ? "tool" : "tools", jumps: "jumps", goldT: "s", score: "points", over: "overdrive", daily: "run", slides: n === 1 ? "slide" : "slides", time: "s", dist: "m", clean: "clean points" }[stat] || "");

/* ---------- beat-my-run links ---------- */
// v: course version (r7 levels). Links without it were made before Factory Zones (v1, the straight hall)
// and still replay that exact course; new links carry v=2.
export function challengeUrl(base, seed, score, name, v = 2) {
  const u = new URL("./", base); // base: the game's own folder (config.js GAME_URL)
  u.searchParams.set("c", (seed >>> 0).toString(36));
  u.searchParams.set("s", String(Math.floor(score)));
  if (name) u.searchParams.set("n", name);
  if (v > 1) u.searchParams.set("v", String(v));
  return u.href;
}
export function readChallenge(search = location.search) {
  const q = new URLSearchParams(search);
  const c = q.get("c"), s = parseInt(q.get("s") || "", 10), n = q.get("n") || "";
  if (!c || !/^[0-9a-z]{1,7}$/.test(c) || !(s >= 0 && s < 1e8)) return null;
  const v = q.get("v") === "2" ? 2 : 1; // unknown or future versions: the classic course, never an error
  return { seed: parseInt(c, 36) >>> 0, score: s, name: /^[A-Za-z0-9_]{3,16}$/.test(n) ? n : "", v };
}

/* ---------- share card ---------- */
// A 1080x1350 image: score, rank, the robot (a frame of the game canvas), and a short "Beat N at <host>" line.
// Share card (1080 x 1350), in the Servo Sprint identity: graphite, off-white numerals, the wordmark,
// a yellow hazard rule, cyan for the rank line. Uses the bundled Inter Tight (300/400) and Plex Mono.
export async function shareCard({ canvas, score, rank, best, daily, day, name, link, wordmark, passed, focusY, robot, design }) {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#14161b"; x.fillRect(0, 0, W, H);
  // Copy the game frame first, before any await: a WebGL canvas without preserveDrawingBuffer is cleared once the
  // frame is composited, so a copy taken after the font await below can come out blank.
  if (canvas) {
    // Cover-fit the frame into its band (y 456-1136) and clip, so a tall phone canvas can't spill behind the type
    // and the score numerals (baseline 408, comma descender to ~440) always sit on flat graphite above it.
    const BY = 456, BH = 680, s = Math.max(W / canvas.width, BH / canvas.height);
    const w = canvas.width * s, h = canvas.height * s;
    x.save(); x.beginPath(); x.rect(0, BY, W, BH); x.clip();
    // Vertical crop: put the robot (focusY, from the camera) a little below the band's middle; the old fixed 62 %
    // crop cut the robot off on tall phone frames. Clamped so the frame always covers the band.
    const oy = Number.isFinite(focusY) ? Math.min(0, Math.max(BH - h, BH * 0.6 - focusY * h)) : (BH - h) * 0.62;
    try { x.globalAlpha = 0.9; x.drawImage(canvas, (W - w) / 2, BY + oy, w, h); x.globalAlpha = 1; } catch { /* tainted or lost */ }
    x.restore();
    const g = x.createLinearGradient(0, BY, 0, BY + BH);
    g.addColorStop(0, "rgba(20,22,27,1)"); g.addColorStop(0.22, "rgba(20,22,27,0.15)"); g.addColorStop(0.75, "rgba(20,22,27,0.15)"); g.addColorStop(1, "rgba(20,22,27,1)");
    x.fillStyle = g; x.fillRect(0, BY, W, BH);
  }
  try { await document.fonts.load('300 200px "Inter Tight"'); await document.fonts.load('400 40px "IBM Plex Mono"'); } catch { /* fallback */ }
  const sans = (w, px) => `${w} ${px}px "Inter Tight", system-ui, sans-serif`, mono = (px) => `400 ${px}px "IBM Plex Mono", ui-monospace, monospace`;
  // Wordmark (SVG, currentColor -> off-white), 64 px cap height, top left on the 8 px grid.
  if (wordmark) {
    try {
      // Size from the mark's own viewBox so a lockup change can never stretch it (64 px cap height).
      const vb = (wordmark.match(/viewBox="([^"]+)"/) || [])[1]?.split(/\s+/).map(Number) || [0, 0, 1149.4, 100];
      const wm = Math.round(64 * vb[2] / vb[3]);
      const svg = wordmark.replaceAll("currentColor", "#f2f0ea").replace("<svg ", `<svg width="${wm * 2}" height="128" `);
      const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode(); x.drawImage(img, 80, 80, wm, 64);
    } catch { /* skip */ }
  }
  x.textBaseline = "alphabetic"; x.fillStyle = "rgba(242,240,234,.64)";
  x.font = mono(32); x.fillText(daily ? `DAILY RUN${dayLabel(day)}` : "SCORE", 80, 232);
  x.fillStyle = "#f2f0ea"; x.font = sans(300, 200); x.fillText(fmtN(score), 68, 408);
  // Lines shrink to fit the 920 px column (long names / links never clip).
  const fit = (t, w, px, max) => { x.font = sans(w, px); const m = x.measureText(t).width; if (m > max) x.font = sans(w, Math.floor(px * max / m)); };
  const line = [best ? "New personal best" : "", passed ? (passed.name ? `Passed ${passed.name} by ${fmtN(passed.by)}` : `Challenge beaten by ${fmtN(passed.by)}`) : "", rank ? `#${rank} on the board` : "", robot ? `${name} · ${robot}` : name || ""].filter(Boolean).join("  ·  ");
  // Garage (r7): the robot's chassis plate, top right, beside the wordmark row.
  if (design && design !== DESIGN_DEFAULT) drawPlate(x, W - 80 - 200, 168, 200, 100, design);
  fit(line, 400, 40, W - 160); x.fillStyle = "#3ddcff"; x.fillText(line, 80, 1168);
  // A short call to action, not the raw challenge URL (that stays in the share/copy payload): the host is the
  // game's own origin (servosprint.xyz live; auamai.dev/game on the portfolio copy).
  let where = "servosprint.xyz";
  try { const u = new URL(link); where = (u.host + u.pathname).replace(/\/+$/, ""); } catch { /* keep default */ }
  const cta = daily ? `Play today's Daily Run at ${where}` : `Beat ${fmtN(score)} at ${where}`;
  x.fillStyle = "#f2f0ea"; fit(cta, 300, 40, W - 160); x.fillText(cta, 80, 1240);
  // Hazard rule: 45 degree stripes, 16 px bands, pixel-aligned.
  x.save(); x.beginPath(); x.rect(80, 1272, 240, 16); x.clip(); x.fillStyle = "#ffc93c"; x.fillRect(80, 1272, 240, 16); x.fillStyle = "#14161b";
  for (let i = -1; i < 9; i++) { const x0 = 80 + i * 32; x.beginPath(); x.moveTo(x0, 1288); x.lineTo(x0 + 16, 1288); x.lineTo(x0 + 32, 1272); x.lineTo(x0 + 16, 1272); x.closePath(); x.fill(); }
  x.restore();
  // toBlob encodes off the main thread; an object URL (not a base64 data URL) keeps the game-over screen smooth.
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return { blob, url: blob ? URL.createObjectURL(blob) : c.toDataURL("image/png") };
}
// "OCT 20" from "2026-10-20", for the Daily Run card (the course is the same for everyone that day).
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dayLabel = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? ` · ${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : "");

// Copy text: async Clipboard API first, then the old textarea + execCommand path (http, older WebViews,
// or a denied permission). Returns true when something reached the clipboard.
export async function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  try {
    const prev = document.activeElement, t = document.createElement("textarea");
    t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
    const ok = document.execCommand && document.execCommand("copy");
    t.remove();
    if (prev && prev.focus) prev.focus({ preventScroll: true }); // keep keyboard focus on the button that was pressed
    return !!ok;
  } catch { return false; }
}

// Share the card. Web Share with the image when the platform takes files (the link rides in the text, since many
// share targets drop `url` next to a file), then link-only Web Share, then download the card and copy the link.
// Safari rejects share() once the tap's user activation has passed (NotAllowedError): that also falls back.
export async function shareOrDownload({ blob, url }, text, link) {
  const file = blob && typeof File === "function" ? new File([blob], "servo-sprint.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${text} ${link}` }); return "shared"; }
    if (navigator.share) { await navigator.share({ text, url: link }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  if (url) {
    const a = document.createElement("a");
    a.href = url; a.download = "servo-sprint.png";
    document.body.appendChild(a); a.click(); a.remove();
  }
  return (await copyText(link)) ? "downloaded+copied" : "downloaded";
}

/* ---------- the site teaser's read-only summary ---------- */
export const PUBLIC_KEY = "au_factory_public_v1";
export function writePublic(o) {
  try {
    const now = Date.now();
    localStorage.setItem(PUBLIC_KEY, JSON.stringify({
      v: 1, name: o.name || "", best: o.best || 0, rank: o.rank || null, streak: o.streak || 0,
      dailyDay: vanDay(now), dailyResetAt: nextMidnight(now), dailyBest: o.dailyBest || 0, weeklyResetAt: nextMonday(now), updatedAt: now,
    }));
  } catch { /* private mode */ }
}
