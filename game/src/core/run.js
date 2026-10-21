// Run lifecycle and rules: start, countdown, pause, scoring with its caps, tools, multipliers, power-ups, death.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261020r6b";
import * as MT from "../../meta.js?v=20261020r6b";
import { START_SPEED, M_PER_U, MORPH_T, DRIVE_T, GRACE_T, DRIFT_CASH, DRIFT_MULT, RATE_CAP, OVER_LOCK, COUNT_BEAT, SCREW_POINTS, DRILL_POINTS, HAMMER_POINTS, MAGNET_T, DRILL_T, HAMMER_T, GOLD_T, OVER_T, MULT_CAP, GOLD_MIN, GOLD_MAX, METER_N, HIT_STOP, PB_GOLD_DELAY, allowedScore, TOOL_NAME, MILESTONES, CAUSE, HEADLINES, BAY } from "./constants.js?v=20261020r6b";
import { fmt, RNG, LOOT, clock } from "./util.js?v=20261020r6b";

export class Run {
  freshFx() {
    return { magnet: 0, drill: 0, hammer: 0, gold: 0, goldAge: 0, over: 0, meter: 0, smashCredit: 0, swing: 0, stop: 0, hitFlash: 0 };
  }

  // Combined multiplier: rolling ×1.5, golden ×2 climbing to ×5, overdrive ×2; capped at ×6.
  get mult() {
    const f = this.fx;
    const gold = f.gold > 0 ? Math.min(5, 2 + Math.floor(f.goldAge)) : 1;
    return Math.min(MULT_CAP, gold * (f.over > 0 ? 2 : 1));
  }

  collect(it) {
    it.taken = true;
    const f = this.fx, k = it.kind;
    if (k === "screw") { this.screwsRun++; this.addScore(SCREW_POINTS * this.mult, it); this.learned("screw"); return; }
    this.buzz(20);
    this.toolsRun++;
    if (k === "wrench") f.magnet = MAGNET_T;
    else if (k === "drill") { f.drill = DRILL_T; f.smashCredit = 1; }
    else if (k === "hammer") { f.hammer = HAMMER_T; f.smashCredit = 1; }
    if (k !== "screw") this.lastToolKind = k;
    else if (k === "gold") {
      f.gold = GOLD_T; f.goldAge = 0; this.goldOut = false;
      if (this.pbGoldAt != null && this.runTime >= this.pbGoldAt) this.pbGoldAt = null;
      this.nextGold = this.runTime + GOLD_MIN + LOOT() * (GOLD_MAX - GOLD_MIN);
    }
    this.pop(k === "gold" ? "×2" : TOOL_NAME[k], it, true);
    if (this.tipNow === k) this.hideTip();
    this.learned(k);
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
    this.burst.emit("over", this.r.x, 1.2, 0, 22);
    this.elFlash.classList.remove("is-on"); void this.elFlash.offsetWidth; this.elFlash.classList.add("is-on");
    this.buzz(40);
    this.sfx("over");
    if (!this.tips.over) { this.showTip("over", 1.8); this.tips.over = 1; P.setSetting("tips", this.tips); }
    this.sr("Overdrive, times two.");
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
    this.hitGold();
    if (f.smashCredit > 0) { f.smashCredit = 0; this.fillMeter(1); }
  }

  // Any contact (a smash, or passing through while invulnerable) ends the golden multiplier.
  hitGold() {
    const f = this.fx;
    if (this.driftS && this.driftS.level > 0) this.cashDrift();
    if (f.gold > 0) { f.gold = 0; f.goldAge = 0; this.pop("×1", { x: this.r.x, y: 1.6, z: 0 }, true); }
  }

  updateFx(dt) {
    const f = this.fx;
    for (const k of ["magnet", "drill", "hammer", "over"]) if (f[k] > 0) f[k] = Math.max(0, f[k] - dt);
    if (f.gold > 0) { f.gold = Math.max(0, f.gold - dt); f.goldAge += dt; this.stat.goldT += dt; }
    if (f.swing > 0) f.swing = Math.max(0, f.swing - dt);
    if (!f.drill && !f.hammer) f.smashCredit = 0;
    const d = this.driftS;
    if (d && d.level > 0 && this.runTime - d.last > DRIFT_CASH) this.cashDrift();
    if (this.r.landRoll > 0) this.r.landRoll = Math.max(0, this.r.landRoll - dt);
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
    Object.assign(this.r, { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false, jumpBuf: 0, rail: null, hopRail: null, launch: false, landRoll: 0 });
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
    this.driftS = { level: 0, pool: 0, last: null };
    this.runDist = 0; this.bestMult = 1;
    this.lastTool = null; this.lastKind = {};
    this.nextGold = GOLD_MIN + LOOT() * (GOLD_MAX - GOLD_MIN);
    this.pbGoldAt = null;
    this.pbFrom = this.profile.best;
    this.pbPassed = false;
    this.rawScore = 0;
    this.toNext = 10;
    this.slowT = 0;
    // First run (until lanes, jump and slide are learned): a gentler start and roomier rows.
    this.tutorial = !(this.tips.lanes && this.tips.jump && this.tips.slide);
    this.deathT = 0;
    this.fps.frames = 0; this.fps.acc = 0;
    this.shown = { score: -1, gears: -1, mult: -1, meter: -1, chips: "", pb: -1 };
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

  get invulnerable() { const p = this.pw.phase; return p === "in" || p === "out" || p === "grace" || this.r.launch || this.r.landRoll > 0; }

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
    if (this.state === "count" && this.countT >= this.countHold) this.state = "play";
    if (this.countT >= this.countHold + 0.5) this.stopCount();
  }

  updateCount() { /* kept for the old test harness: the countdown now ticks in loop() */ }

  die(kind, type) {
    if (this.state !== "play") return;
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
    let headline = pool[(Math.random() * pool.length) | 0].replace("{v}", mps).replace("{bay}", bay);
    headline = headline[0].toUpperCase() + headline.slice(1);
    const prevRank = this.settings.rank || null;
    this.lastRun = { mode: this.mode, seed: this.seed, headline, prevRank, dist: Math.round((this.runDist || 0) * M_PER_U), bestMult: this.bestMult || 1, missionsDone: ms.done, reward, challenge: this.mode === "challenge" ? this.challenge : null,
      score, gears: this.gearsRun, time: this.runTime, best, prevBest, delta: score - prevBest, streak, badge: newBadge,
      screws: this.screwsRun, tools: this.toolsRun, smashes: this.smashRun, rank: null, post, cause: CAUSE[this.deathType] || "Run over" };
    this.showOver();
    this.sr(`Run over. ${fmt(score)} points.${this.lastRun.best ? " New best." : ""}`);
    this.publish();
    this.submitRun(score, durationMs);
  }
}
