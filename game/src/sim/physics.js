// Player movement: lane moves, jump, slide, rails, drift, magnet pull.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import { DESPAWN_Z, JUMP_V, COYOTE, SLIDE_T, RAIL_H, RAMP_DEG, RAMP_H, RAMP_L, HOP_V, DRIFT_CHAIN, DRIFT_MULT, JUMP_BUF, MAGNET_R } from "../core/constants.js?v=20261020r6c";

export class Physics {
  act(move) {
    const r = this.r;
    if (move === "left" || move === "right") {
      const to = move === "left" ? Math.max(0, r.lane - 1) : Math.min(2, r.lane + 1);
      if (to !== r.lane) { r.lane = to; this.buzz(8); if (this.driving && this.state === "play") this.drift(); }
      this.learned("lanes");
    } else if (move === "jump" && this.driving) {
      // The roller only hops (a rail hop lands back on the rail).
      if (r.ground || r.rail || r.coyote > 0) { r.coyote = 0; r.vy = HOP_V; r.ground = false; r.hopRail = r.rail; r.rail = null; this.sfx("jump", r.x); if (this.stat) this.stat.jumps++; }
      this.learned("jump");
    } else if (move === "slide" && this.driving) {
      // No slide in Roller Mode (the wheel already rolls under the arms).
    } else if (move === "jump") {
      if (r.ground) { r.vy = JUMP_V; r.ground = false; r.slideT = 0; r.jumpBuf = 0; this.buzz(10); this.sfx("jump", r.x); if (this.stat) this.stat.jumps++; }
      else { r.jumpBuf = JUMP_BUF; r.queueSlide = false; } // buffered: fires on landing
      this.learned("jump");
    } else if (move === "slide") {
      if (r.ground) { r.slideT = SLIDE_T; this.sfx("slide", r.x); }
      else { r.vy = Math.min(r.vy, -16); r.queueSlide = true; r.jumpBuf = 0; }
      this.learned("slide");
    }
  }

  // Magnet: anything within reach ahead, in any lane, flies to the runner. Returns true while pulled.
  magnetize(g, zPrev, dt) {
    if (!g.mag) {
      if (!(this.fx.magnet > 0) || g.z < -MAGNET_R || g.z > 1.5) return false;
      g.mag = true;
      g.z = zPrev;
    }
    // Attraction ~ 1/d² (softened, capped), plus drag so things arrive instead of orbiting.
    const r = this.r, dx = r.x - g.x, dy = r.y + 1.0 - g.y, dz = -g.z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1;
    const acc = Math.min(420, 3000 / Math.max(d2, 2));
    const drag = 1 - Math.min(1, dt * 2.5);
    g.vx = (g.vx || 0) * drag + (dx / d) * acc * dt;
    g.vy = (g.vy || 0) * drag + (dy / d) * acc * dt;
    g.vz = (g.vz || 0) * drag + (dz / d) * acc * dt;
    const sp = Math.hypot(g.vx, g.vy, g.vz), cap = 45;
    if (sp > cap) { g.vx *= cap / sp; g.vy *= cap / sp; g.vz *= cap / sp; }
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    return true;
  }

  pulled(g) { return Math.abs(g.x - this.r.x) < 0.6 && Math.abs(g.z) < 0.8; }

  // Rails under the roller: snap on when in the lane (steered or hopped onto), drop off the far end.
  updateRails(dt, v) {
    const r = this.r;
    for (let i = this.rails.length - 1; i >= 0; i--) {
      const rl = this.rails[i];
      rl.zNear += v * dt;
      rl.g.position.z = rl.zNear - rl.len / 2;
      const under = rl.zNear - rl.len < 0 && rl.zNear > 0;
      if (this.state === "play" && this.driving && under && r.lane === rl.lane && !r.rail && !r.launch && r.hopRail !== rl && Math.abs(r.x - rl.x) < 0.5 && (r.vy <= 0 || r.y > RAIL_H - 0.2)) {
        r.rail = rl; r.ground = true; r.vy = 0; r.hopRail = null; r.y = Math.max(r.y, RAIL_H - 0.08); // snap
        this.sfx("tool", r.x);
      }
      if (r.rail === rl && (!under || r.lane !== rl.lane)) { r.rail = null; r.ground = false; r.vy = Math.min(r.vy, 0); r.coyote = COYOTE; }
      if (rl.zNear - rl.len > DESPAWN_Z) { rl.g.visible = false; this.pools.rail.push(rl.g); this.rails.splice(i, 1); }
    }
    if (r.rail) {
      r.y += (RAIL_H - r.y) * Math.min(1, dt * 20);
      this.grindT = (this.grindT || 0) - dt;
      if (this.grindT <= 0) { this.grindT = 0.06; this.burst.emit("spark", r.x, RAIL_H, 0.3, 2); }
    }
    for (let i = this.ramps.length - 1; i >= 0; i--) {
      const rp = this.ramps[i], zPrev = rp.z;
      rp.z += v * dt; rp.g.position.z = rp.z;
      // The lip is 3.4 ahead of the ramp's base.
      if (this.state === "play" && !rp.used && r.lane === rp.lane && Math.abs(r.x - rp.x) < 0.8 && r.y < 0.6 && zPrev - RAMP_L <= 0 && rp.z - RAMP_L >= 0) {
        // Off the lip at ground speed along a 35 degree face: vy = v sin, and the world runs at v cos in the air.
        const a = (RAMP_DEG * Math.PI) / 180;
        rp.used = true; r.launch = true; r.ground = false; r.rail = null; r.vy = v * Math.sin(a); r.y = RAMP_H; r.launchVx = v * Math.cos(a); r.launchAt = this.runTime;
        this.sfx("power", r.x); this.buzz(20);
      }
      if (rp.z - RAMP_L > DESPAWN_Z) { rp.g.visible = false; this.pools.ramp.push(rp.g); this.ramps.splice(i, 1); }
    }
  }

  drift() {
    const d = this.driftS, now = this.runTime;
    if (d.last != null && now - d.last <= DRIFT_CHAIN) d.level = Math.min(3, d.level + 1);
    d.last = now;
    if (d.level > 0) { this.sfx("screw", this.r.x); this.burst.emit("spark", this.r.x, 0.2, 0.2, 4); }
  }

  // Cash in the drift combo: the points earned while it ran, times its multiplier minus one.
  cashDrift() {
    const d = this.driftS;
    if (d.level > 0 && d.pool > 0) {
      const bonus = Math.round(d.pool * (DRIFT_MULT[d.level] - 1));
      d.level = 0; d.pool = 0;
      this.cashing = true;
      if (bonus > 0) { this.addScore(bonus); this.pop(`Drift +${bonus}`, { x: this.r.x, y: 2.2, z: 0 }, true); }
      this.cashing = false;
    }
    d.level = 0; d.pool = 0; d.last = null;
  }
}
