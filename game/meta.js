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
export const MISSIONS = [
  { id: "smash10", stat: "smash", goal: 10, text: "Smash 10 crates or robots", reward: 60 },
  { id: "gold8", stat: "goldT", goal: 8, text: "Hold the golden wrench 8 s", reward: 80 },
  { id: "screw50", stat: "screws", goal: 50, text: "Collect 50 screws", reward: 50 },
  { id: "gear60", stat: "gearsRun", goal: 60, text: "Grab 60 gears in one run", reward: 60, oneRun: true },
  { id: "tools5", stat: "tools", goal: 5, text: "Pick up 5 tools", reward: 50 },
  { id: "over1", stat: "over", goal: 1, text: "Fill the toolbox for Overdrive", reward: 70 },
  { id: "daily1", stat: "daily", goal: 1, text: "Run today's Daily Run", reward: 40 },
  { id: "jump30", stat: "jumps", goal: 30, text: "Jump 30 times", reward: 40 },
  { id: "score1500", stat: "score", goal: 1500, text: "Score 1,500 in one run", reward: 70, oneRun: true },
];
export function missionsFill(list = []) {
  list = list.filter((m) => MISSIONS.some((x) => x.id === m.id)).slice(0, 3);
  while (list.length < 3) {
    const pool = MISSIONS.filter((x) => !list.some((m) => m.id === x.id));
    const m = pool[Math.floor(Math.random() * pool.length)];
    list.push({ id: m.id, prog: 0 });
  }
  return list;
}
// Apply one run's stats. Returns { list, done: [mission...] } with finished ones replaced.
export function missionsApply(list, stats) {
  const done = [];
  list = list.map((m) => {
    const d = MISSIONS.find((x) => x.id === m.id);
    const v = stats[d.stat] || 0;
    const prog = d.oneRun ? Math.max(m.prog, v) : m.prog + v;
    if (prog >= d.goal) { done.push(d); return null; }
    return { id: m.id, prog };
  }).filter(Boolean);
  return { list: missionsFill(list.concat()), done };
}
export const missionInfo = (m) => ({ ...MISSIONS.find((x) => x.id === m.id), prog: m.prog });

/* ---------- gear shop ---------- */
// Cosmetic only. Prices in gears; the wallet is gears earned minus gears spent.
export const SHOP = [
  { id: "trim-navy", kind: "trim", name: "Navy line", price: 200, light: 0x4f63c4, deep: 0x262d4d },
  { id: "trim-ice", kind: "trim", name: "Ice pearl", price: 350, light: 0xdfe6ff, deep: 0xa9bcff },
  { id: "trail-ribbon", kind: "trail", name: "Periwinkle ribbon", price: 250, color: 0xa9bcff },
  { id: "trail-navy", kind: "trail", name: "Navy dash", price: 300, color: 0x262d4d },
  { id: "trail-pearl", kind: "trail", name: "Pearl sparks", price: 400, color: 0xf4f6fb },
  { id: "hammer-navy", kind: "hammer", name: "Navy hammer", price: 150, color: 0x3a4262 },
  { id: "hammer-pearl", kind: "hammer", name: "Pearl hammer", price: 300, color: 0xf4f6fb },
];
export const cosClean = (c) => {
  c = c && typeof c === "object" ? c : {};
  const ids = new Set(SHOP.map((s) => s.id));
  const owned = Array.isArray(c.owned) ? [...new Set(c.owned.filter((x) => ids.has(x)))] : [];
  const eq = {};
  for (const k of ["trim", "trail", "hammer"]) if (c.eq && typeof c.eq[k] === "string") eq[k] = c.eq[k];
  return { spent: Number.isFinite(c.spent) && c.spent > 0 ? Math.floor(c.spent) : 0, owned, eq };
};
export const wallet = (p) => Math.max(0, (p ? p.gears : 0) - cosClean(p && p.cos).spent);

/* ---------- near-miss nudge ---------- */
export function nearMiss({ score, prevBest, missions, board, me }) {
  const out = [];
  if (prevBest > 0 && score < prevBest && prevBest - score <= Math.max(60, prevBest * 0.2)) out.push({ w: 3, text: `${fmtN(prevBest - score)} to your best` });
  for (const m of missions || []) {
    const d = missionInfo(m), left = d.goal - d.prog;
    if (left > 0 && left <= Math.max(2, d.goal * 0.25)) out.push({ w: 2, text: `${fmtN(left)} ${unit(d.stat, left)} from a mission` });
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
const unit = (stat, n) => ({ smash: n === 1 ? "smash" : "smashes", screws: "screws", gearsRun: "gears", tools: n === 1 ? "tool" : "tools", jumps: "jumps", goldT: "s", score: "points", over: "overdrive", daily: "run" }[stat] || "");

/* ---------- beat-my-run links ---------- */
export function challengeUrl(base, seed, score, name) {
  const u = new URL("./", base); // base: the game's own folder (config.js GAME_URL)
  u.searchParams.set("c", (seed >>> 0).toString(36));
  u.searchParams.set("s", String(Math.floor(score)));
  if (name) u.searchParams.set("n", name);
  return u.href;
}
export function readChallenge(search = location.search) {
  const q = new URLSearchParams(search);
  const c = q.get("c"), s = parseInt(q.get("s") || "", 10), n = q.get("n") || "";
  if (!c || !/^[0-9a-z]{1,7}$/.test(c) || !(s >= 0 && s < 1e8)) return null;
  return { seed: parseInt(c, 36) >>> 0, score: s, name: /^[A-Za-z0-9_]{3,16}$/.test(n) ? n : "" };
}

/* ---------- share card ---------- */
// A 1080x1350 image: score, rank, the robot (a frame of the game canvas), and the Daily Run link.
// Share card (1080 x 1350), in the Servo Sprint identity: graphite, off-white numerals, the wordmark,
// a yellow hazard rule, cyan for the rank line. Uses the bundled Inter Tight (300/400) and Plex Mono.
export async function shareCard({ canvas, score, rank, best, daily, name, link, wordmark }) {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  try { await document.fonts.load('300 200px "Inter Tight"'); await document.fonts.load('400 40px "IBM Plex Mono"'); } catch { /* fallback */ }
  x.fillStyle = "#14161b"; x.fillRect(0, 0, W, H);
  if (canvas) {
    const s = Math.max(W / canvas.width, 760 / canvas.height);
    const w = canvas.width * s, h = canvas.height * s;
    try { x.globalAlpha = 0.9; x.drawImage(canvas, (W - w) / 2, 400 - (h - 760) / 2, w, h); x.globalAlpha = 1; } catch { /* tainted or lost */ }
    const g = x.createLinearGradient(0, 380, 0, 1170);
    g.addColorStop(0, "rgba(20,22,27,1)"); g.addColorStop(0.22, "rgba(20,22,27,0.15)"); g.addColorStop(0.75, "rgba(20,22,27,0.15)"); g.addColorStop(1, "rgba(20,22,27,1)");
    x.fillStyle = g; x.fillRect(0, 380, W, 790);
  }
  const sans = (w, px) => `${w} ${px}px "Inter Tight", system-ui, sans-serif`, mono = (px) => `400 ${px}px "IBM Plex Mono", ui-monospace, monospace`;
  // Wordmark (SVG, currentColor -> off-white), 64 px cap height, top left on the 8 px grid.
  if (wordmark) {
    try {
      const svg = wordmark.replace("currentColor", "#f2f0ea").replace("<svg ", '<svg width="604" height="64" ');
      const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode(); x.drawImage(img, 80, 80, 604, 64);
    } catch { /* skip */ }
  }
  x.textBaseline = "alphabetic"; x.fillStyle = "rgba(242,240,234,.64)";
  x.font = mono(32); x.fillText(daily ? "DAILY RUN" : "SCORE", 80, 232);
  x.fillStyle = "#f2f0ea"; x.font = sans(300, 200); x.fillText(fmtN(score), 68, 408);
  x.font = sans(400, 40); x.fillStyle = "#3ddcff";
  x.fillText([best ? "New personal best" : "", rank ? `#${rank} on the board` : "", name || ""].filter(Boolean).join("  ·  "), 80, 1168);
  x.fillStyle = "#f2f0ea"; x.font = sans(300, 36); x.fillText("Beat it:", 80, 1240);
  x.font = sans(400, 36); x.fillText(link.replace(/^https?:\/\//, ""), 220, 1240);
  // Hazard rule: 45 degree stripes, 16 px bands, pixel-aligned.
  x.save(); x.beginPath(); x.rect(80, 1272, 240, 16); x.clip(); x.fillStyle = "#ffc93c"; x.fillRect(80, 1272, 240, 16); x.fillStyle = "#14161b";
  for (let i = -1; i < 9; i++) { const x0 = 80 + i * 32; x.beginPath(); x.moveTo(x0, 1288); x.lineTo(x0 + 16, 1288); x.lineTo(x0 + 32, 1272); x.lineTo(x0 + 16, 1272); x.closePath(); x.fill(); }
  x.restore();
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return { blob, url: c.toDataURL("image/png") };
}
export async function shareOrDownload({ blob, url }, text, link) {
  const file = blob && typeof File === "function" ? new File([blob], "servo-sprint.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, url: link }); return "shared"; }
    if (navigator.share) { await navigator.share({ text, url: link }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  const a = document.createElement("a");
  a.href = url; a.download = "servo-sprint.png";
  document.body.appendChild(a); a.click(); a.remove();
  return "downloaded";
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
