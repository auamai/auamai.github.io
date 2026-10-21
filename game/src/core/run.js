// Run lifecycle and rules: start, countdown, pause, scoring with its caps, tools, multipliers, power-ups, death.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261021r7";
import * as MT from "../../meta.js?v=20261021r7";
import { START_SPEED, M_PER_U, MORPH_T, DRIVE_T, GRACE_T, DRIFT_CASH, DRIFT_MULT, RATE_CAP, OVER_LOCK, COUNT_BEAT, SCREW_POINTS, DRILL_POINTS, HAMMER_POINTS, MAGNET_T, DRILL_T, HAMMER_T, GOLD_T, OVER_T, MULT_CAP, GOLD_MIN, GOLD_MAX, METER_N, HIT_STOP, PB_GOLD_DELAY, allowedScore, TOOL_NAME, MILESTONES, CAUSE, HEADLINES, BAY, TIPS, REVIVE_T, REVIVE_CLEAR, BUMP_SLOW_T, BUMP_POINTS, SCRAP_POINTS, FLOW_MAX, FLOW_LVL, FLOW_IDLE, FLOW_COOL, FLOW_ADD, FLOW_STYLE, FLOW_PICK, STYLE_POINTS, FLOW_K, STYLE_NAME, WEAVE_T, ZONE_POINTS, ZONE_AGAIN } from "./constants.js?v=20261021r7";
import { fmt, RNG, LOOT, clock } from "./util.js?v=20261021r7";

export class Run {
  freshFlow() {
    return { c: 0, idle: 0, lvl: 1, armed: true, zoneAt: 0, best: 1, near: 0, weave: 0, clear: 0, zones: 0, lastNear: -1e9, lastDir: 0, seen: false };
  }

  freshFx() {
    return { magnet: 0, drill: 0, hammer: 0, gold: 0, goldAge: 0, goldStep: 2, over: 0, meter: 0, smashCredit: 0, swing: 0, stop: 0, hitFlash: 0,
      shield: 0, bump: 0, breakOk: 0, bumper: 0, rush: 0, brk: 0, oc: 0 };
  }

  // Combined multiplier: golden ×2 climbing to ×5, overdrive ×2; capped at ×6 (Roller Mode has no multiplier of its own).
  get mult() {
    const f = this.fx;
    const gold = f.gold > 0 ? Math.min(5, 2 + Math.floor(f.goldAge)) : 1;
    return Math.min(MULT_CAP, gold * (f.over > 0 ? 2 : 1));
  }

  collect(it) {
    it.taken = true;
    const f = this.fx, k = it.kind;
    if (k === "screw") { this.screwsRun++; this.addScore(SCREW_POINTS * this.mult, it); this.learned("screw"); this.flowAdd("screw"); return; }
    this.buzz(20);
    this.toolsRun++;
    if (k === "wrench") f.magnet = MAGNET_T;
    else if (k === "drill") { f.drill = DRILL_T; f.smashCredit = 1; }
    else if (k === "hammer") { f.hammer = HAMMER_T; f.smashCredit = 1; }
    this.lastToolKind = k;
    // The golden torque wrench (r6 to r6b: this branch sat behind `else` and never ran, so the wrench
    // gave no multiplier and the next one never spawned).
    if (k === "gold") {
      f.gold = GOLD_T; f.goldAge = 0; f.goldStep = 2; this.goldOut = false; f.breakOk = 1;
      if (this.pbGoldAt != null && this.runTime >= this.pbGoldAt) this.pbGoldAt = null;
      this.nextGold = this.runTime + GOLD_MIN + LOOT() * (GOLD_MAX - GOLD_MIN);
    }
    this.pop(k === "gold" ? "×2" : TOOL_NAME[k], it, true);
    if (this.tipNow === k) this.hideTip();
    this.learned(k);
    this.flowAdd("tool");
    this.fillMeter(2);
  }

  fillMeter(n) {
    const f = this.fx;
    if (f.over > 0) return;
    f.meter = Math.min(METER_N, f.meter + n);
    if (f.meter >= METER_N) this.overdrive();
  }

  overdrive() {
    const f = this.fx;
    f.over = OVER_T; f.meter = 0; this.stat.over++;
    f.shield = 1; // the Bumper: overdrive shrugs off one crash
    this.burst.emit("over", this.r.x, 1.2, 0, 22);
    this.elFlash.classList.remove("is-on"); void this.elFlash.offsetWidth; this.elFlash.classList.add("is-on");
    this.buzz(40);
    this.sfx("over");
    if (!this.tips.over) { this.showTip("over", 1.8); this.tips.over = 1; P.setSetting("tips", this.tips); }
    else if (!this.tips.bumper) { this.showTip("bumper", 2); this.tips.bumper = 1; P.setSetting("tips", this.tips); }
    this.sr("Overdrive, times two. Bumper on.");
  }

  // Hammer and drill: break the thing instead of crashing into it.
  smash(o, i) {
    const f = this.fx, drill = o.type === "arm";
    this.burst.emit(o.type === "bot" ? "bot" : drill ? "arm" : "crate", o.x, drill ? 1.4 : 0.6, o.z, drill ? 10 : 14);
    o.g.visible = false; this.pools[o.type].push(o.g); this.obstacles.splice(i, 1);
    this.smashRun++;
    this.addScore((drill ? DRILL_POINTS : HAMMER_POINTS) * this.mult, { x: o.x, y: 1.2, z: o.z });
    f.stop = this.reduceMotion ? 0 : HIT_STOP;
    this.shake = this.reduceMotion ? 0 : Math.max(this.shake, 0.12);
    f.swing = 0.32;
    this.buzz(18);
    this.sfx(drill ? "drill" : o.type === "bot" ? "hammer" : "crate", o.x);
    // Clean Break (golden + hammer or drill): the first smash keeps the multiplier and drops a screw's worth.
    if (f.gold > 0 && f.breakOk) { f.breakOk = 0; this.addScore(SCRAP_POINTS * this.mult); this.pop("Clean break", { x: o.x, y: 2.1, z: o.z }, true); this.sfx("screw", o.x); }
    else this.hitGold();
    this.flowAdd("smash");
    if (f.smashCredit > 0) { f.smashCredit = 0; this.fillMeter(1); }
  }

  // The Bumper: a crash during overdrive knocks the obstacle away instead, once. Time eases to half for a
  // beat so the next lane can be read, the golden multiplier holds, and flow drops by half.
  bump(o, i) {
    const f = this.fx;
    f.shield = 0; f.bump = BUMP_SLOW_T;
    this.burst.emit(o.type === "bot" ? "bot" : o.type === "arm" ? "arm" : "crate", o.x, 1, o.z, 16);
    o.g.visible = false; this.pools[o.type].push(o.g); this.obstacles.splice(i, 1);
    this.r.landRoll = Math.max(this.r.landRoll, 0.35);
    this.addScore(BUMP_POINTS * this.mult);
    this.pop("Bumper", { x: o.x, y: 1.9, z: o.z }, true);
    this.flow.c *= 0.5; this.flow.idle = 0;
    this.shake = this.reduceMotion ? 0 : Math.max(this.shake, 0.18);
    this.buzz(35);
    this.sfx(o.type === "crate" || o.type === "stack" ? "crash_wood" : "crash_steel", o.x);
    this.sr("Bumper.");
    if (this.stat) this.stat.bumps = (this.stat.bumps || 0) + 1;
  }

  /* ---------- flow and style ---------- */
  // Charge the flow meter. Level 1-5 (one per FLOW_LVL of charge); reaching 5 is "In the zone".
  flowAdd(k) {
    const w = this.flow;
    if (!w) return;
    w.c = Math.min(FLOW_STYLE.has(k) ? FLOW_MAX : Math.max(w.c, FLOW_PICK), w.c + FLOW_ADD[k]); w.idle = 0;
    const lvl = Math.min(5, 1 + Math.floor(w.c / FLOW_LVL));
    if (lvl > w.best) w.best = lvl;
    w.lvl = lvl;
    if (lvl >= 5 && w.armed) this.zone();
  }

  // A style move: points times the flow level, its own pop, a tick and a buzz.
  style(k, at) {
    const w = this.flow;
    w[k]++;
    const add = this.addScore(STYLE_POINTS[k] * FLOW_K[w.lvl - 1]);
    if (add >= 1) this.pop(`${STYLE_NAME[k]} +${Math.round(add)}`, at, w.lvl >= 3 || k === "weave");
    this.sfx(k === "clear" ? "screw" : "tool", at.x);
    this.buzz(k === "weave" ? 14 : 6);
    this.flowAdd(k);
    if (!w.seen) { w.seen = true; if (!this.tips.flow && !this.tipNow) { this.showTip("flow", 2); this.tips.flow = 1; P.setSetting("tips", this.tips); } }
  }

  zone() {
    const w = this.flow;
    w.armed = false; w.zones++; w.zoneAt = this.runTime;
    const add = this.addScore(ZONE_POINTS);
    this.pop(`${w.zones > 1 && w.lvl >= 5 && w.held ? "Still in the zone" : "In the zone"} +${Math.round(add)}`, { x: this.r.x, y: 2.4, z: 0 }, true);
    this.burst.emit("confetti", this.r.x, 1.8, -0.5, 18);
    this.sfx("mult", 0, 5);
    this.buzz(30);
    this.sr("In the zone.");
  }

  updateFlow(dt) {
    const w = this.flow;
    w.idle += dt;
    if (w.idle > FLOW_IDLE && w.c > 0) {
      w.c = Math.max(0, w.c - FLOW_COOL * dt);
      w.lvl = Math.min(5, 1 + Math.floor(w.c / FLOW_LVL));
    }
    if (w.lvl < 3) { w.armed = true; w.held = false; }
    else if (!w.armed && this.runTime - w.zoneAt >= ZONE_AGAIN) { w.armed = true; w.held = true; if (w.lvl >= 5) this.zone(); }
  }

  // Any contact (a smash, or passing through while invulnerable) ends the golden multiplier.
  hitGold() {
    const f = this.fx;
    if (this.driftS && this.driftS.level > 0) this.cashDrift();
    if (f.gold > 0) { f.gold = 0; f.goldAge = 0; this.pop("×1", { x: this.r.x, y: 1.6, z: 0 }, true); }
  }

  updateFx(dt) {
    const f = this.fx;
    // Overclock (overdrive + a tool): tool timers hold while overdrive runs.
    const oc = f.over > 0;
    for (const k of ["magnet", "drill", "hammer", "over"]) if (f[k] > 0 && !(oc && k !== "over")) f[k] = Math.max(0, f[k] - dt);
    if (f.over <= 0) f.shield = 0;
    if (f.bump > 0) f.bump = Math.max(0, f.bump - dt);
    if (f.gold <= 0) f.breakOk = 0;
    // Combo chips (read by the HUD): each shows the time the pair has left.
    const tool = Math.max(f.magnet, f.drill, f.hammer);
    f.bumper = f.shield > 0 ? f.over : 0;
    f.rush = f.gold > 0 && f.magnet > 0 ? Math.min(f.gold, f.magnet) : 0;
    f.brk = f.breakOk && (f.drill > 0 || f.hammer > 0) ? Math.min(f.gold, Math.max(f.drill, f.hammer)) : 0;
    f.oc = oc && tool > 0 ? f.over : 0;
    this.updateFlow(dt);
    if (f.gold > 0) {
      f.gold = Math.max(0, f.gold - dt); f.goldAge += dt; this.stat.goldT += dt;
      // Each step up the golden ladder (×3, ×4, ×5) and the clean finish are called out: a pop over the
      // runner plus a tick (sound) or a buzz, so the multiplier you're protecting is felt, not just read.
      const step = Math.min(5, 2 + Math.floor(f.goldAge));
      if (f.gold <= 0) { this.pop("×1", { x: this.r.x, y: 1.6, z: 0 }); this.buzz(8); this.sr("Golden multiplier over."); }
      else if (step > (f.goldStep || 2)) { this.pop(`×${step}`, { x: this.r.x, y: 1.9, z: 0 }, true); this.buzz(6); } // the rising "mult" chime (loop.js) is the sound
      f.goldStep = step;
    }
    if (f.swing > 0) f.swing = Math.max(0, f.swing - dt);
    if (!f.drill && !f.hammer) f.smashCredit = 0;
    const d = this.driftS;
    if (d && d.level > 0 && this.runTime - d.last > DRIFT_CASH) this.cashDrift();
    if (this.r.landRoll > 0) this.r.landRoll = Math.max(0, this.r.landRoll - dt);
    if (this.reviveT > 0) this.reviveT = Math.max(0, this.reviveT - dt);
  }

  // Passing the old best mid-run: a 3D "New best", gear confetti, a chime, and a golden wrench soon after.
  passBest() {
    this.pbPassed = true;
    this.burst.emit("confetti", this.r.x, 1.6, -0.5, 26);
    this.buzz(35);
    this.sfx("pb");
    this.showTip("pb", 1.8, true);
    this.sr("New personal best.");
    if (this.pbGoldAt == null && !this.tutorial) this.pbGoldAt = this.runTime + PB_GOLD_DELAY;
  }

  // Reaching a milestone badge for the first time: say so in the run, not only on the game-over screen.
  // UI only (tip, chime, buzz): nothing here touches the sim, so replays and the Daily Run are unchanged.
  passMilestone() {
    const m = this.msNext;
    if (this.tipNow && !this.tips[this.tipNow] && this.tipNow !== "pb") return; // a teaching tip is up: wait for it
    if (this.tipNow === "pb" && this.tipLeft > 0.8) return;                    // let "New best" land first
    this.msNext = MILESTONES.find((x) => x.at > m.at && this.score < x.at) || null;
    TIPS.ms = { icon: "star", all: [fmt(m.at), `${m.name} trim unlocked`] };
    this.buzz(25);
    this.sfx("tool");
    this.showTip("ms", 2, true);
    this.sr(`${fmt(m.at)} points. ${m.name} trim unlocked in the Garage.`);
  }

  /* ---------- run lifecycle ---------- */
  // Keys and taps on the game-over screen wait a beat, so a last frantic swipe can't restart by accident.
  // Run modes: "free" (a fresh seed), "daily" (today's shared course), "challenge" (a friend's seed).
  tryStart(mode = this.mode || "free") {
    if (this.view === "over" && performance.now() - (this.overAt || 0) < OVER_LOCK) return;
    if (this.view === "menu" && !this.profile) return;
    this.startRun(mode);
  }

  startRun(mode = this.mode || "free") {
    if (!this.profile) return this.showMenu();
    this.mode = mode === "challenge" && !this.challenge ? "free" : mode;
    this.day = MT.vanDay();
    this.seed = this.mode === "daily" ? MT.dailySeed(this.day) : this.mode === "challenge" ? this.challenge.seed : (Math.random() * 4294967296) >>> 0;
    RNG.course = MT.rng(this.seed);
    RNG.loot = MT.rng(this.seed ^ 0x9e3779b9);
    this.stat = { smash: 0, goldT: 0, screws: 0, gearsRun: 0, tools: 0, over: 0, daily: this.mode === "daily" ? 1 : 0, jumps: 0, score: 0 };
    const fromMenu = this.view === "menu";
    this.clearWorld();
    this.hideTip();
    Object.assign(this.r, { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false, jumpBuf: 0, rail: null, hopRail: null, launch: false, landRoll: 0, laneFrom: 1, laneAt: -1e9, actAt: -1e9 });
    const R = this.robot;
    R.root.rotation.set(0, 0, 0);
    R.root.position.set(0, 0, 0);
    this.resetPower();
    this.lastToken = null;
    this.rate.b.fill(0); this.rate.i = -1;
    this.speed = START_SPEED;
    this.runTime = 0;
    this.score = 0;
    this.gearsRun = 0;
    this.screwsRun = 0; this.toolsRun = 0; this.smashRun = 0;
    this.fx = this.freshFx();
    this.flow = this.freshFlow();
    this.driftS = { level: 0, pool: 0, last: null };
    this.runDist = 0; this.bestMult = 1;
    this.lastTool = null; this.lastKind = {};
    this.nextGold = GOLD_MIN + LOOT() * (GOLD_MAX - GOLD_MIN);
    this.pbGoldAt = null;
    this.pbFrom = this.profile.best;
    this.pbPassed = false;
    this.msNext = MILESTONES.find((m) => m.at > this.pbFrom) || null; // the next Garage badge this player hasn't reached
    this.rawScore = 0;
    this.toNext = 10;
    this.slowT = 0;
    // First run (until lanes, jump and slide are learned): a gentler start and roomier rows.
    this.tutorial = !(this.tips.lanes && this.tips.jump && this.tips.slide);
    this.deathT = 0;
    // Spare Servo (r7): armed in the Garage, one per run, never in the Daily Run (equal for all).
    this.reviveT = 0;
    this.servoUsed = false;
    this.servoReady = this.mode !== "daily" && !!this.settings.servoArm && MT.servoCount(this.profile) > 0;
    this.elServo.hidden = !this.servoReady;
    this.elFlow.hidden = true; this.elFlow.classList.remove("is-zone");
    this.fps.frames = 0; this.fps.acc = 0; this.fps.slow = 0; // a slow window left over from the last run must not count toward this one
    this.shown = { score: -1, gears: -1, mult: -1, meter: -1, chips: "", pb: -1, flowQ: -1, flowL: -1, flowOn: false, marks: "" };
    this.elPb.hidden = !(this.pbFrom > 0);
    this.elPb.classList.remove("is-past");
    this.elPbLabel.textContent = `PB ${fmt(this.pbFrom)}`;
    this.elBest.textContent = fmt(this.profile.best);
    this.state = "play";
    this.view = "play";
    this.deathKind = null;
    this.hidePanel();
    this.hud.hidden = false;
    this.btnPause.hidden = false;
    this.btnPause.setAttribute("aria-label", "Pause");
    this.pad.hidden = !this.settings.pad;
    this.elPower.classList.remove("is-ending");
    this.root.classList.add("is-playing");
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    // From the menu: 3-2-1-GO. A quick retry from game over: just the GO beat.
    if (fromMenu) this.startCount(["3", "2", "1", "GO"]);
    else this.startCount(["GO"]);
  }

  /* ---------- wheel power-up ---------- */
  resetPower() {
    this.pw = { phase: "none", t: 0 };
    const R = this.robot;
    R.form = "runner";
    R.runner.root.visible = true; R.runner.root.scale.setScalar(1); R.runner.root.rotation.set(0, 0, 0);
    R.roller.root.visible = false; R.roller.root.scale.setScalar(1);
    R.flash.visible = false;
    this.elPower.hidden = true;
    this.shownRing = -1;
  }

  startDrive() {
    this.pw = { phase: "in", t: 0 };
    this.elPower.hidden = false;
    this.elPower.classList.remove("is-ending");
    this.shownRing = -1;
    this.buzz(25);
    this.sfx("power");
    this.fillMeter(2);
    if (this.stat) this.stat.tools++;
    if (this.tipNow === "wheel") this.hideTip();
    this.learned("wheel");
    if (!this.tips.rolling && this.state === "play") {
      this.showTip("rolling", 2.4);
      this.tips.rolling = 1;
      P.setSetting("tips", this.tips);
    }
  }

  // in -> drive -> out -> grace -> none. Morphs and grace are invulnerable.
  updatePower(dt) {
    const pw = this.pw;
    if (pw.phase === "none") return;
    pw.t += dt;
    if (pw.phase === "in" && pw.t >= MORPH_T) pw.phase = "drive";
    if (pw.phase === "drive" && pw.t >= DRIVE_T - MORPH_T) { pw.phase = "out"; pw.outAt = pw.t; }
    if (pw.phase === "out" && pw.t >= DRIVE_T) { this.cashDrift(); pw.phase = "grace"; pw.graceAt = pw.t; this.elPower.hidden = true; }
    if (pw.phase === "grace" && pw.t >= DRIVE_T + GRACE_T) this.resetPower();
    if (pw.phase === "in" || pw.phase === "drive" || pw.phase === "out") {
      const left = Math.max(0, 1 - pw.t / DRIVE_T);
      const q = Math.round(left * 200);
      if (q !== this.shownRing) { this.shownRing = q; this.elRing.style.strokeDashoffset = ((1 - left) * 119.38).toFixed(2); }
      this.elPower.classList.toggle("is-ending", pw.t > DRIVE_T - 1.6);
      const dl = this.driftS ? this.driftS.level : 0, lab = dl ? `Drift ×${DRIFT_MULT[dl]}` : this.r.rail ? "Grinding" : this.r.launch ? "Airborne" : "Roller Mode";
      if (lab !== this.shownPw) { this.shownPw = lab; this.elPower.querySelector(".fr__power-label").textContent = lab; this.elPower.classList.toggle("is-combo", dl > 0); }
    }
  }

  get driving() { return this.pw.phase === "in" || this.pw.phase === "drive" || this.pw.phase === "out"; }

  get invulnerable() { const p = this.pw.phase; return p === "in" || p === "out" || p === "grace" || this.r.launch || this.r.landRoll > 0 || this.reviveT > 0; }

  // Spare Servo: the fatal hit reboots the robot in place instead. Clears what's close ahead,
  // gives REVIVE_T of invulnerability, and spends the servo right away (closing the tab after
  // a revive can't keep it). No prompt, no pause: the run just keeps going.
  revive(kind, type) {
    this.servoReady = false;
    this.servoUsed = true;
    this.reviveT = REVIVE_T;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.z > -REVIVE_CLEAR && o.z - o.h < 1.5) { o.g.visible = false; this.pools[o.type].push(o.g); this.obstacles.splice(i, 1); }
    }
    const r = this.r;
    if (r.y < 0) { r.y = 0; r.vy = 0; r.ground = true; }
    const cos = MT.cosClean(this.profile.cos);
    cos.sv.u = Math.min(cos.sv.b, cos.sv.u + 1);
    this.profile.cos = cos; P.save(this.profile);
    this.elServo.hidden = true;
    this.shake = this.reduceMotion ? 0 : 0.2;
    this.buzz(40);
    this.sfx(type === "crate" || type === "stack" ? "crash_wood" : "crash_steel", r.x);
    this.sfx("power");
    this.sr("Spare Servo. Rebooted.");
  }

  // Every point goes through here: at most RATE_CAP in any one-second window, and never more
  // than AVG_CAP per second of run plus BURST (the leaderboard Worker checks the same line).
  // `at`: where it was earned, for the floating "+25".
  addScore(pts, at) {
    this.rawScore += pts;
    // 0.1 s buckets; the cap holds over the current one plus the ten before it
    // (1.0 to 1.1 s), so every one-second window stays under it.
    const R = this.rate, n = R.b.length, i = Math.floor(this.runTime * 10);
    if (i !== R.i) { if (i - R.i >= n || i < R.i) R.b.fill(0); else for (let k = R.i + 1; k <= i; k++) R.b[k % n] = 0; R.i = i; }
    let sum = 0;
    for (let k = 0; k < n; k++) sum += R.b[k];
    const room = allowedScore(this.runTime) - this.score;
    const add = Math.max(0, Math.min(pts, RATE_CAP - sum, room));
    R.b[i % n] += add;
    this.score += add;
    if (this.driftS && this.driftS.level > 0 && !this.cashing) this.driftS.pool += add;
    if (at && add >= 1) {
      this.pop(`+${Math.round(add)}`, at, add >= 60);
      this.elScoreBox.classList.remove("is-tick"); void this.elScoreBox.offsetWidth; this.elScoreBox.classList.add("is-tick");
    }
    return add;
  }

  pause() {
    if (this.state !== "play" && this.state !== "count") return;
    this.saveUi = { open: "", msg: "", busy: false, code: "" };
    this.state = "pause";
    this.view = "pause";
    this.audio?.mood("pause");
    this.swipe = null;
    this.drawn = false;
    this.stopCount();
    this.btnPause.setAttribute("aria-label", "Resume");
    this.pad.hidden = true;
    this.root.classList.remove("is-playing");
    this.renderPanel(`
      <h2 class="fr__title">Paused</h2>
      <p class="fr__lede"><b class="fr__num">${fmt(this.score)}</b> <span class="fr__soft">at ${clock(this.runTime)} · ${fmt((this.runDist || 0) * M_PER_U)} m</span></p>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid fr__btn--wide" type="button" data-panel="resume">Resume</button>
        <button class="fr__btn" type="button" data-panel="restart">Restart</button>
        <button class="fr__btn" type="button" data-panel="menu">Quit run</button>
      </div>
      <div data-slot="save">${this.saveHtml("pause")}</div>
      ${this.settingsHtml()}`);
  }

  // Resume after a short 3-2-1 so nobody comes back straight into a crate.
  resume() {
    if (this.state !== "pause") return;
    this.view = "play";
    this.startCount(["3", "2", "1", "GO"]);
    this.btnPause.setAttribute("aria-label", "Pause");
    this.pad.hidden = !this.settings.pad;
    this.root.classList.add("is-playing");
    this.hidePanel();
    this.last = performance.now();
  }

  // The numbers hold the run still; play starts on GO while GO itself plays out.
  startCount(seq) {
    this.countSeq = seq;
    this.countT = 0;
    this.shownCount = "";
    this.countHold = (seq.length - 1) * COUNT_BEAT;
    this.state = this.countHold > 0 ? "count" : "play";
    this.countFlat = !this.use3d;
    this.audio?.mood("run");
    this.audio?.countIn(seq.length, COUNT_BEAT);
    if (this.countFlat) this.ui.stopCount(); else this.ui.startCount(seq);
    this.countOn = true;
    this.sr(seq.length > 1 ? `Starting in ${seq.length - 1}` : "Go");
    this.tickCount(0);
  }

  stopCount() {
    this.countOn = false;
    this.ui?.stopCount();
    this.countEl.classList.remove("is-on");
    this.countEl.dataset.n = "";
  }

  // Runs on real time in every state, so GO finishes even after play resumes.
  tickCount(dt) {
    if (!this.countOn) return;
    this.countT += dt;
    const n = this.countSeq.length, i = Math.min(n - 1, Math.floor(this.countT / COUNT_BEAT));
    const label = this.countSeq[i];
    if (label !== this.shownCount) {
      this.shownCount = label;
      if (this.countFlat) {
        this.countEl.querySelector(".fr__count-num").textContent = label;
        this.countEl.dataset.n = label;
        this.countEl.classList.remove("is-on");
        void this.countEl.offsetWidth; // restart the punch
        this.countEl.classList.add("is-on");
      }
    }
    if (this.state === "count" && this.countT >= this.countHold) { this.state = "play"; this.sr("Go"); }
    if (this.countT >= this.countHold + 0.5) this.stopCount();
  }

  updateCount() { /* kept for the old test harness: the countdown now ticks in loop() */ }

  die(kind, type) {
    if (this.state !== "play") return;
    if (this.servoReady) return this.revive(kind, type);
    this.state = "dying";
    this.deathKind = kind;
    this.deathType = type;
    this.deathT = 0;
    this.deathSpeed = this.speed;
    this.shake = this.reduceMotion ? 0 : 0.35;
    this.btnPause.hidden = true;
    this.pad.hidden = true;
    this.hideTip();
    this.root.classList.remove("is-playing");
    this.pbLine.visible = false;
    this.buzz(60);
    this.sfx(kind === "fall" ? "fall" : type === "crate" || type === "stack" ? "crash_wood" : "crash_steel", this.r.x);
    this.audio?.mood("over");
  }

  endRun() {
    this.state = "over";
    this.hud.hidden = true;
    const score = Math.floor(this.score);
    const prevBest = this.profile.best;
    P.recordRun(this.profile, score, this.gearsRun);
    const durationMs = Math.round(this.runTime * 1000);
    const post = !P.online() ? "local" : durationMs < 3000 || score <= 0 ? "short" : "posting";
    const best = score > prevBest && score > 0;
    // Personal-best streak: consecutive runs that each beat the one before.
    const streak = best && prevBest > 0 ? (this.settings.pbStreak || 0) + 1 : best ? 1 : 0;
    this.settings.pbStreak = streak; P.setSetting("pbStreak", streak);
    const newBadge = MILESTONES.filter((m) => score >= m.at && prevBest < m.at).pop() || null;
    // Missions, Daily Run streak, the shop wallet and the teaser's summary.
    const st = this.stat;
    Object.assign(st, { smash: this.smashRun, screws: this.screwsRun, gearsRun: this.gearsRun, tools: this.toolsRun, score, goldT: Math.floor(st.goldT) });
    const ms = MT.missionsApply(MT.missionsFill(this.settings.missions), st);
    this.settings.missions = ms.list; P.setSetting("missions", ms.list);
    const reward = ms.done.reduce((a, m) => a + m.reward, 0);
    if (reward) { this.profile.gears += reward; P.save(this.profile); }
    if (this.mode === "daily" && this.runTime >= 3) {
      this.settings.streak = MT.bumpStreak(this.settings.streak, this.day); P.setSetting("streak", this.settings.streak);
      const db = this.settings.dailyBest || {};
      if (db.day !== this.day || score > db.score) { this.settings.dailyBest = { day: this.day, score }; P.setSetting("dailyBest", this.settings.dailyBest); }
    }
    // Where and how: the nearest bay and the speed (real scale) for the headline.
    const slot = this.factory.slots.reduce((a, b) => (Math.abs(b.z) < Math.abs(a.z) ? b : a), this.factory.slots[0]);
    const bay = (slot && BAY[slot.type]) || "the line", mps = Math.round((this.deathSpeed || this.speed) * M_PER_U);
    const late = (this.deathType === "stack" && this.fx.hammer <= 0 && this.lastToolKind === "hammer") ? "hammer" : (this.deathType === "arm" && this.lastToolKind === "drill" && this.fx.drill <= 0) ? "drill" : this.deathType;
    const pool = HEADLINES[late] || ["Run over"];
    // Never the same line twice in a row for the same hazard (UI only: Math.random, not the course RNG).
    this.lastLine = this.lastLine || {};
    let li = (Math.random() * pool.length) | 0;
    if (pool.length > 1 && li === this.lastLine[late]) li = (li + 1 + ((Math.random() * (pool.length - 1)) | 0)) % pool.length;
    this.lastLine[late] = li;
    let headline = pool[li].replace("{v}", mps).replace("{bay}", bay);
    headline = headline[0].toUpperCase() + headline.slice(1);
    const prevRank = this.settings.rank || null;
    this.lastRun = { mode: this.mode, seed: this.seed, headline, prevRank, dist: Math.round((this.runDist || 0) * M_PER_U), bestMult: this.bestMult || 1, missionsDone: ms.done, reward, challenge: this.mode === "challenge" ? this.challenge : null,
      score, gears: this.gearsRun, time: this.runTime, best, prevBest, delta: score - prevBest, streak, badge: newBadge,
      screws: this.screwsRun, tools: this.toolsRun, smashes: this.smashRun, revive: !!this.servoUsed, style: { flow: this.flow.best, near: this.flow.near, weave: this.flow.weave, clear: this.flow.clear, zones: this.flow.zones }, wallet0: MT.wallet(this.profile) - this.gearsRun - reward, rank: null, post, cause: CAUSE[this.deathType] || "Run over" };
    this.showOver();
    // Screen readers hear what sighted players read: why the run ended, the score, and whether it was a best.
    this.sr(`${headline}. ${fmt(score)} points.${this.lastRun.best ? (prevBest > 0 ? ` New best, up ${fmt(score - prevBest)}.` : " New best.") : prevBest > 0 ? ` Best ${fmt(prevBest)}.` : ""}`);
    this.publish();
    this.submitRun(score, durationMs);
  }
}
