// Frame loop and the fixed 120 Hz simulation step: every run advances only through update(1/120).
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import { LANES, DESPAWN_Z, START_SPEED, MAX_SPEED, ACCEL, GRAVITY, JUMP_V, PHYS_HZ, LANE_W, LANE_W_ROLL, SLIDE_T, GEAR_POINTS, DIST_POINTS, PERIOD, ROLL_SPEED, RAIL_H, LAND_ROLL, DRIFT_MULT, SLOW_T, SLOW_K, TUT_SPEED, TUT_EASE, visY, REVIVE_T, BUMP_SLOW_T, BUMP_SLOW_K, NEAR_T, CLEAR_T, WEAVE_T } from "./constants.js?v=20261021r7";
import { report } from "../net/errors.js?v=20261021r7";

export class Loop {
  /* ---------- frame ---------- */
  loop(now) {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.loop);
    // Phones on the menu or game-over screen: the slow belt behind the panel draws at ~30 fps, which
    // halves GPU work (battery, heat) where nobody is steering. Runs, countdowns and pauses are untouched.
    if (this.coarse && (this.state === "menu" || this.state === "over") && now - this.last < 30) return;
    // Background-tab / resume guard: one frame never advances more than 50 ms (the fixed-step
    // accumulator below is capped at 100 ms too), so a long stall can't teleport the runner.
    const raw = (now - this.last) / 1000;
    const dt = Number.isFinite(raw) ? Math.min(0.05, Math.max(0, raw)) : 0;
    if (Number.isFinite(now)) this.last = now;
    // Error boundary: a throw in one frame is reported once and the loop keeps going; three bad
    // frames in a row pause the run with a calm message instead of freezing on a dead canvas.
    try {
      if (this.padOn) this.pollPad();
      this.step(dt);
      if (this.ctxLost) return;
      // A paused frame doesn't change: draw it once, then let the GPU rest.
      if (this.state === "pause" && this.drawn) return;
      this.renderer.render(this.scene, this.camera);
      this.ui.render();
      this.drawn = this.state === "pause";
      this.measure(dt);
      this.badFrames = 0;
    } catch (err) {
      report("frame", err, { state: this.state });
      if ((this.badFrames = (this.badFrames | 0) + 1) >= 3 && (this.state === "play" || this.state === "count")) {
        this.badFrames = 0;
        try { this.pause(); this.toast("Something went wrong. Resume to keep going."); } catch { /* ignore */ }
      }
    }
  }

  // One real-time frame: countdown and hint animation on real time, the run itself on game time.
  step(dt) {
    this.realT = (this.realT || 0) + dt;
    if (this.state !== "pause") this.tickCount(dt);
    // Fixed 120 Hz sub-steps (frame time carried over), so physics and scoring don't depend on frame rate.
    const H = 1 / PHYS_HZ;
    this.acc = Math.min(0.1, (this.acc || 0) + dt);
    let n = 0;
    while (this.acc >= H - 1e-7 && n < 12) { this.update(H); this.acc -= H; n++; }
    if (this.state !== "pause") this.ui.update(dt);
  }

  // Slow-mo factor for this frame: eases to SLOW_K, holds, eases back.
  timeScale(dt) {
    if (this.state !== "play") return 1;
    // Bumper pop: half speed, eased back out over BUMP_SLOW_T (fx.bump counts down in game time, so replays match).
    const fb = this.fx && this.fx.bump > 0 ? this.fx.bump / BUMP_SLOW_T : 0;
    const kb = 1 - (1 - BUMP_SLOW_K) * fb * fb * (3 - 2 * fb);
    if (!(this.slowT > 0)) return kb;
    this.slowT = Math.max(0, this.slowT - dt);
    const u = 1 - this.slowT / SLOW_T; // 0 -> 1 across the slow-mo
    const k = u < 0.12 ? u / 0.12 : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    const e = k * k * (3 - 2 * k);
    return (1 - (1 - SLOW_K) * e) * kb;
  }

  update(dt) {
    const st = this.state;
    if (st === "pause") return;
    if (st === "count") {
      if (!this.countOn) this.state = "play"; // old harness path: no countdown running
      else { this.animateRobot(0, 0, false); return; }
    }
    // Hit-stop: on a smash the world holds for a few real milliseconds.
    if (st === "play" && this.fx.stop > 0) { this.fx.stop -= dt; dt = 0; }
    dt *= this.timeScale(dt);
    this.t += dt;
    const r = this.r, R = this.robot, fx = this.fx;

    let v = 0;
    if (st === "play") {
      this.runTime += dt;
      const base = Math.min(MAX_SPEED, START_SPEED + ACCEL * this.runTime);
      // First run: start slower and ease onto the normal curve.
      if (this.tutorial) { const u = Math.min(1, this.runTime / TUT_EASE), e = u * u * (3 - 2 * u); this.speed = TUT_SPEED + (base - TUT_SPEED) * e; }
      else this.speed = base;
      v = this.speed * (this.driving ? ROLL_SPEED : 1);
      if (this.r.launch && this.r.launchVx) v = this.r.launchVx; // horizontal speed in the air: v cos(angle)
    } else if (st === "dying") {
      this.deathT += dt;
      v = this.deathSpeed * Math.max(0, 1 - this.deathT * 3);
      if (this.deathT > 0.95) this.endRun();
    } else if (st === "menu") {
      v = 4;
    }

    this.dist += v * dt;
    if (st === "play") { this.runDist = (this.runDist || 0) + v * dt; const mm = this.mult * (this.driftS && this.driftS.level ? DRIFT_MULT[this.driftS.level] : 1); if (mm > (this.bestMult || 1)) this.bestMult = mm; }
    this.scenery.position.z = this.dist % PERIOD;
    this.factory.update(dt, v, this.t);
    this.ceiling.update(dt, v, this.t);
    if (st === "play") { this.updatePower(dt); this.updateFx(dt); }
    const mult = this.mult;
    if (st === "play") this.addScore(v * dt * DIST_POINTS * mult);

    this.updateRails(dt, v);
    // Robot physics
    if (st === "play") {
      // Rolling switches lanes faster.
      // Lane change: a critically damped spring on the body (x'' = w²(target - x) - 2w x').
      const w = this.driving ? LANE_W_ROLL : LANE_W;
      const ax = w * w * (LANES[r.lane] - r.x) - 2 * w * (r.vx || 0);
      r.vx = (r.vx || 0) + ax * dt; r.x += r.vx * dt; r.ax = ax;
      if (r.coyote > 0) r.coyote -= dt;
      if (r.landT > 0) r.landT -= dt;
      if (!r.ground && !r.rail) {
        r.vy += GRAVITY * dt;
        r.y += r.vy * dt;
        // A hop off a rail lands back on it while it still runs under you.
        if (r.hopRail && r.vy < 0 && r.y <= RAIL_H && r.lane === r.hopRail.lane && r.hopRail.zNear > 0 && r.hopRail.zNear - r.hopRail.len < 0) {
          r.y = RAIL_H; r.vy = 0; r.rail = r.hopRail; r.hopRail = null; r.ground = true;
          if (r.jumpBuf > 0 && this.driving) this.hop();
        }
        if (r.y <= 0) {
          // Landing: absorb and camera shake scale with the impact speed.
          r.impact = -r.vy; r.landT = 0.22;
          if (!this.reduceMotion && r.impact > 7) this.shake = Math.max(this.shake, Math.min(0.25, (r.impact - 7) * 0.03));
          if (r.impact > 3 && !r.launch) this.sfx("land", r.x); // sound only: no sim state
          if (r.launch) { r.launch = false; r.landRoll = LAND_ROLL; this.addScore(50, { x: r.x, y: 1, z: 0 }); this.sfx("slide", r.x); }
          r.hopRail = null;
          r.y = 0; r.vy = 0; r.ground = true;
          if (r.jumpBuf > 0 && this.driving) this.hop();
          else if (r.jumpBuf > 0) { r.jumpBuf = 0; r.queueSlide = false; r.vy = JUMP_V; r.ground = false; r.slideT = 0; }
          else if (r.queueSlide) { r.slideT = SLIDE_T; r.queueSlide = false; }
        }
      }
      if (r.jumpBuf > 0) r.jumpBuf = Math.max(0, r.jumpBuf - dt);
      if (r.slideT > 0) r.slideT -= dt;
    }
    const sliding = r.slideT > 0 && r.y < 0.3;

    // Obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      const zPrev = o.z;
      o.z += v * dt;
      if (o.type === "bot" && st !== "menu") this.updateBot(o, st === "play" ? dt : 0, v);
      o.g.position.z = o.z;
      if (o.parts.pivot) {
        o.parts.pivot.rotation.z = Math.sin(this.t * 2.4 + o.phase) * 0.5;
        o.parts.elbow.rotation.z = Math.sin(this.t * 2.4 + o.phase + 1.2) * 0.45;
      }
      if (st === "play" && !o.passed && Math.abs(r.x - o.x) < 0.95) {
        const h = o.h + 0.25;
        if (zPrev - h <= 0 && o.z + h >= 0) {
          const ty = o.type;
          // The roller passes under the arms' laser; a stack stands 2.2 tall.
          const crash = (ty === "crate" && r.y < 1.05) || (ty === "stack" && r.y < 2.1) || (ty === "bot" && r.y < 0.95) || (ty === "arm" && !sliding && !this.driving);
          const fall = ty === "gap" && r.y < 0.06 && Math.abs(o.z) < o.h - 0.35;
          if (crash && fx.hammer > 0 && (ty === "crate" || ty === "stack" || ty === "bot")) { this.smash(o, i); continue; }
          if (crash && fx.drill > 0 && ty === "arm") { this.smash(o, i); continue; }
          if (crash && fx.shield > 0 && fx.over > 0 && !this.invulnerable) { this.bump(o, i); continue; }
          if (crash || fall) {
            if (this.invulnerable) { if (!o.touched) { o.touched = true; this.hitGold(); } }
            else { this.die(fall ? "fall" : "crash", ty); if (this.reviveT === REVIVE_T) break; } // a Spare Servo just cleared the list
          }
        }
      }
      // Style: the moment an obstacle reaches you (its middle crosses z = 0) without touching you.
      if (st === "play" && this.state === "play" && !o.styled && zPrev < 0 && o.z >= 0) {
        o.styled = true;
        const rt = this.runTime;
        if (!o.touched && !this.invulnerable) {
          if (Math.abs(r.x - o.x) < 0.95) {
            if (rt - r.actAt < CLEAR_T && (r.y > 0.3 || sliding) && !(this.driving && o.type === "arm")) this.style("clear", { x: o.x, y: 1.6, z: 0 });
          } else if (o.type !== "gap" && rt - r.laneAt < NEAR_T && Math.abs(LANES[r.laneFrom] - o.x) < 0.5) {
            const w = this.flow, dir = Math.sign(r.lane - r.laneFrom);
            this.style("near", { x: r.x, y: 1.7, z: 0 });
            if (rt - w.lastNear < WEAVE_T && dir && dir !== w.lastDir) { this.style("weave", { x: r.x, y: 2.3, z: 0 }); w.lastNear = -1e9; w.lastDir = 0; }
            else { w.lastNear = rt; w.lastDir = dir; }
          }
        }
      }
      if (o.z - o.h > 0.5) o.passed = true;
      if (o.z > DESPAWN_Z) { o.g.visible = false; this.pools[o.type].push(o.g); this.obstacles.splice(i, 1); }
    }

    // Gears
    const top = r.y + (sliding ? 0.8 : this.driving ? 1.25 : 1.9);
    for (let i = this.gears.length - 1; i >= 0; i--) {
      const g = this.gears[i];
      const zPrev = g.z;
      g.z += v * dt;
      if (g.taken) {
        g.t += dt;
        g.m.position.y += dt * 7;
        g.m.scale.setScalar(Math.max(0.01, 1 - g.t * 4));
        if (g.t > 0.25) { g.m.visible = false; this.pools.gear.push(g.m); this.gears.splice(i, 1); continue; }
      } else {
        g.m.rotation.y = this.t * 3 + g.x;
        if (st === "play" && this.magnetize(g, zPrev, dt)) {
          if (this.pulled(g)) { g.taken = true; this.gearsRun++; this.addScore(GEAR_POINTS * mult, g); this.sfx("gear", g.x); this.flowAdd("gear"); }
          g.m.position.x = g.x; g.m.position.y = visY(g.y);
        } else if (st === "play" && Math.abs(r.x - g.x) < 0.9 && zPrev - 0.6 <= 0 && g.z + 0.6 >= 0 && g.y + 0.4 > r.y && g.y - 0.4 < top) {
          g.taken = true;
          this.gearsRun++;
          this.addScore(GEAR_POINTS * mult, g);
          this.sfx("gear", g.x);
          this.flowAdd("gear");
        }
      }
      g.m.position.z = g.z;
      if (g.z > DESPAWN_Z) { g.m.visible = false; this.pools.gear.push(g.m); this.gears.splice(i, 1); }
    }

    // Tool pickups and screws
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i], g = it.g, sp = g.userData.spin;
      const zPrev = it.z;
      it.z += v * dt;
      if (it.taken) {
        it.t += dt;
        g.position.y += dt * 6;
        g.scale.setScalar(Math.max(0.01, 1 - it.t * 4));
        if (it.t > 0.25) { g.visible = false; this.pools[it.kind].push(g); this.items.splice(i, 1); continue; }
      } else {
        sp.rotation.y = this.t * (it.kind === "gold" ? 3.4 : 2.4) + it.x;
        const bob = it.kind === "screw" ? 0 : Math.sin(this.t * 3 + it.x) * 0.08;
        if (g.userData.halo) g.userData.halo.scale.setScalar((it.kind === "screw" ? 0.55 : 1) * (1 + Math.sin(this.t * 6) * 0.07));
        if (g.userData.floor) g.userData.floor.position.y = -it.y - bob + 0.02;
        if (st === "play" && it.kind === "screw" && this.magnetize(it, zPrev, dt)) {
          if (this.pulled(it)) { this.collect(it); this.sfx("screw", it.x); }
        } else {
          g.position.y = it.y + bob;
          if (st === "play" && Math.abs(r.x - it.x) < 0.9 && zPrev - 0.65 <= 0 && it.z + 0.65 >= 0 && it.y + 0.45 > r.y && it.y - 0.45 < top) {
            this.collect(it);
            this.sfx({ screw: "screw", wrench: "magnet", drill: "drill" }[it.kind] || "tool", it.x);
          }
        }
        if (!it.mag) g.position.x = it.x;
        else { g.position.x = it.x; g.position.y = it.y; }
      }
      g.position.z = it.z;
      if (it.z > DESPAWN_Z) { if (it.kind === "gold") this.goldOut = false; g.visible = false; this.pools[it.kind].push(g); this.items.splice(i, 1); }
    }
    this.burst.update(dt, v);
    this.updateTrail(dt, v);

    // Wheel token
    const tk = this.token;
    if (tk) {
      const T = this.tokenMesh;
      const zPrev = tk.z;
      tk.z += v * dt;
      T.g.position.z = tk.z;
      T.wheel.rotation.y = this.t * 2.4;
      T.g.position.y = tk.y + Math.sin(this.t * 3) * 0.08;
      T.floorRing.position.y = -T.g.position.y + 0.02;
      T.halo.scale.setScalar(1 + Math.sin(this.t * 6) * 0.07);
      if (tk.taken) {
        tk.t += dt;
        T.g.scale.setScalar(Math.max(0.01, 1 - tk.t * 4));
        if (tk.t > 0.25) { T.g.visible = false; this.token = null; }
      } else if (st === "play" && Math.abs(r.x - tk.x) < 0.95 && zPrev - 0.7 <= 0 && tk.z + 0.7 >= 0 && tk.y + 0.5 > r.y && tk.y - 0.5 < top) {
        tk.taken = true;
        this.startDrive();
      } else if (tk.z > DESPAWN_Z) { T.g.visible = false; this.token = null; }
    }

    if (st === "play") {
      this.toNext -= v * dt;
      if (this.toNext <= 0) this.spawnRow();
      this.updateTips(dt);
    }

    this.animateRobot(dt, v, sliding);
    this.updateCamera(dt);

    if (this.audio && this.audio.started) {
      this.audio.setEnergy(st === "play" && (fx.over > 0 || fx.gold > 0));
      this.ambT = (this.ambT || 0) - dt;
      if (this.ambT <= 0) { this.ambT = 0.2; this.audio.ambient(this.factory.slots); }
    }
    if (st === "play") {
      if (!this.pbPassed && this.pbFrom > 0 && this.score > this.pbFrom) this.passBest();
      if (this.msNext && this.score >= this.msNext.at) this.passMilestone();
      this.updateHud(mult, v);
      // Multiplier climbing (x2 -> x3 -> ... while golden): a short rising chime per step. Not on the first
      // step (the pickup has its own sound) or the Overdrive onset ("over" plays). Audio only, never the sim.
      const odOn = fx.over > 0;
      if (mult > (this.multHeard || 1) && (this.multHeard || 1) >= 2 && !(odOn && !this.odHeard)) this.sfx("mult", 0, mult);
      this.multHeard = mult; this.odHeard = odOn;
    }
  }

  measure(dt) {
    if (this.state !== "play" || this.runTime < 2 || this.quality >= 3 || window.__frLockQuality) return;
    const f = this.fps;
    f.frames++; f.acc += dt;
    if (f.acc >= 2) {
      // Step down only on a real, sustained drop: two slow windows in a row.
      f.slow = f.frames / f.acc < 40 ? (f.slow || 0) + 1 : 0;
      if (f.slow >= 2) { this.quality++; f.slow = 0; this.applyQuality(); }
      f.frames = 0; f.acc = 0;
    }
  }
}
