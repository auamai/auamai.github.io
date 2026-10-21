// Missions, weekly goal, Daily twist, Line grade and the r7.2 storage migration (pure logic, no browser).
//   node test/progress.test.mjs
import * as MT from "../game/meta.js";
let fails = 0; const ok = (c, m, i = "") => { console.log((c ? "PASS " : "FAIL ") + m + (c ? "" : " " + JSON.stringify(i))); if (!c) fails++; };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

// pool + fill
ok(MT.MISSIONS.length >= 16 && new Set(MT.MISSIONS.map((m) => m.kind)).size === 4, "pool has 16+ missions across skill/route/collect/style");
ok(MT.MISSIONS.every((m) => m.reward >= 40 && m.reward <= 90), "mission rewards stay 40-90 gears (Spare Servo 450 stays 2-3 good runs)");
for (let k = 0; k < 200; k++) { const l = MT.missionsFill([]); if (new Set(l.map((m) => MT.missionInfo(m).kind)).size !== 3 || new Set(l.map((m) => m.id)).size !== 3) { ok(false, "fill draws 3 different kinds", l); break; } if (k === 199) ok(true, "fill draws 3 distinct missions of 3 different kinds (200 draws)"); }
const old = [{ id: "jump30", prog: 12 }, { id: "gear60", prog: 41 }, { id: "gone_id", prog: 3 }];
const f = MT.missionsFill(old);
ok(f.length === 3 && f[0].prog === 12 && f[1].prog === 41 && !f.some((m) => m.id === "gone_id"), "old saved missions keep progress; unknown ids are replaced", f);
// apply
let r = MT.missionsApply([{ id: "dist1k", prog: 600 }, { id: "slide15", prog: 14 }, { id: "mult3", prog: 2 }], { dist: 900, slides: 1, mult: 3.2 });
ok(r.done.map((d) => d.id).sort().join() === "mult3,slide15" && r.list.find((m) => m.id === "dist1k").prog === 900 && r.list.length === 3, "one-run goals take the best run, totals add up, finished ones replaced", r);
r = MT.missionsApply(MT.STARTER_LIST(), { jumps: 4, slides: 2, gearsRun: 11 });
ok(r.done.length === 3 && r.done.reduce((a, d) => a + d.reward, 0) === 70 && r.list.every((m) => MT.missionInfo(m).kind !== "start"), "starter missions finish in one ordinary first run (+70) and never come back", r);
ok(MT.missionProg({ id: "dist1k", prog: 640 }) === "640 / 1,000 m" && MT.missionProg({ id: "mult3", prog: 2.46 }) === "×2.4 / ×3" && MT.missionProg({ id: "mult3", prog: 0 }) === "×1 / ×3" && MT.missionProg({ id: "screw50", prog: 70 }) === "50 / 50", "progress reads in numbers");
// reroll
const L = [{ id: "jump30", prog: 5 }, { id: "gear60", prog: 0 }, { id: "dist4k", prog: 0 }];
const a = MT.reroll(L, 0, null, "2026-10-21");
ok(a && a.list.length === 3 && a.list[0].id !== "jump30" && a.list[1].id === "gear60" && a.rr.n === 1, "swap replaces just that mission", a);
ok(MT.reroll(a.list, 1, a.rr, "2026-10-21") === null, "one free swap a day");
ok(MT.reroll(a.list, 1, a.rr, "2026-10-22") !== null && MT.rerollsLeft(a.rr, "2026-10-22") === 1, "swap comes back the next day");
ok(MT.reroll(MT.STARTER_LIST(), 0, null, "2026-10-21") === null, "starter missions can't be swapped");
// weekly
let w = null, pay = 0; for (let i = 0; i < 10; i++) { const x = MT.weekAdd(w, 1, "2026-10-19"); w = x.w; pay += x.pay; }
ok(pay === MT.WEEKLY.reward && w.n === 10 && w.paid, "weekly goal pays once at 8 missions", w);
ok(MT.weekNow(w, "2026-10-26").n === 0 && !MT.weekNow(w, "2026-10-26").paid, "weekly goal resets on Monday");
// twist
const days = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"];
ok(days.every((d) => MT.twistOf(d) === MT.twistOf(d)) && new Set(days.map((d) => MT.twistOf(d).id)).size >= 3, "Daily twist is seeded by the day (same for everyone) and varies", days.map((d) => MT.twistOf(d).id));
const t = MT.twistOf("2026-10-21"), big = { [t.stat]: 1e6, daily: 1 };
let tc = MT.twistCheck(null, big, "2026-10-21");
ok(tc.pay === MT.TWIST_REWARD && tc.done, "twist pays on a Daily Run that meets it");
ok(MT.twistCheck(tc.tw, big, "2026-10-21").pay === 0, "twist pays once a day");
ok(MT.twistCheck(null, { [t.stat]: 1e6, daily: 0 }, "2026-10-21").pay === 0, "twist only counts in the Daily Run");
// grade
ok(MT.gradeOf(0).n === 1 && MT.gradeOf(99).n === 1 && MT.gradeOf(100).n === 2 && MT.gradeOf(1000).n === 5 && MT.gradeOf(4500).n === 10, "grade thresholds 100/300/600/1000.../4500");
const p = { gears: 120, lv: 1 }; const g = MT.gradeClaim(p);
ok(g.length === 1 && g[0].n === 2 && p.gears === 140 && p.lv === 2 && g[0].unlocks[0] === "Rivets pattern", "first grade pays +20 and unlocks Rivets", { g, p });
ok(MT.gradeClaim(p).length === 0, "a grade is never paid twice");
const sum = Array.from({ length: 9 }, (_, i) => MT.gradeReward(i + 2)).reduce((x, y) => x + y, 0);
ok(sum === 540, "grade rewards to grade 10 total 540 gears over ~4,500 earned (about +12%)", sum);
ok(!MT.isUnlocked("paint", 4, 3) && MT.isUnlocked("paint", 4, 4) && MT.isUnlocked("paint", 1, 1), "Gunmetal paint locked until grade 4; base paints always open");
// migration
const vet = { username: "vet", gears: 5200, cos: { spent: 900 } };
ok(MT.migrateProgress(vet) && vet.lv === 10 && vet.pg === 1 && MT.gradeClaim(vet).length === 0, "old save: starts at the grade it earned, no back-pay", vet);
ok(!MT.migrateProgress(vet), "migration runs once");
const fresh = { username: "new", gears: 0 }; MT.migrateProgress(fresh);
ok(fresh.lv === 1, "new save starts at grade 1");
// design codes
ok(MT.designParts("4052AB").paint === 4 && MT.designParts("4052AB").pattern === 5 && MT.designParts("4052AB").accent === 2 && MT.designParts("5000").paint === 0, "design code accepts r7.2 options, rejects out of range");
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
