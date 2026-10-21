// Tricks (course v3): ramp flips and spins, grind lines, scored small and self-contained.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
//
// Off a Roller Mode ramp, swipe up (jump) for a front flip or down (slide) for a 360 spin; one more can be
// queued while one turns. Land with the robot square for the bonus (sum × (1 + 0.5 per extra trick));
// land mid-rotation and it's "Sloppy": no bonus, no crash (the landing roll is invulnerable anyway).
// Rails pay a grind bonus by length, no balance meter; hop from one rail onto another within 0.7 s and the
// line keeps going with ×1.5, ×2 ... Every point goes through addScore, so the score caps hold unchanged.
// Classic (v1) and v2 courses never call any of this, so their replays are untouched.
import { M_PER_U } from "../core/constants.js?v=20261021r10";

const TRICK_T = 0.5, FLIP_PTS = 120, SPIN_PTS = 90, GRIND_PTS = 3, LINK_T = 0.7;

export class Tricks {
  resetTricks() {
    const k = this.tk ||= {};
    k.on = null; k.t = 0; k.q = null; k.n = 0; k.pts = 0; k.names = ""; k.air = false;
    k.gl = 0; k.links = 0; k.rail = null; k.off = -1;
    k.rx = 0; k.ry = 0;
  }

  // Physics.act hook: true when the press became a trick (only in the air off a ramp, v3).
  trickAct(move) {
    if (this.courseV < 3 || !this.r.launch || this.state !== "play" || (move !== "jump" && move !== "slide")) return false;
    const k = this.tk;
    if (!k.on) { k.on = move === "jump" ? "flip" : "spin"; k.t = 0; this.sfx("jump", this.r.x); this.buzz(8); }
    else if (!k.q) k.q = move === "jump" ? "flip" : "spin";
    return true;
  }

  // After the robot is posed: advance tricks and grinds, cash them in. dt is sim time.
  updateTricks(dt, v) {
    const k = this.tk, r = this.r, R = this.robot;
    if (!k || this.courseV < 3) return;
    if (this.state !== "play") { if (k.on || k.gl) this.resetTricks(); return; }
    // Ramp tricks.
    if (r.launch) {
      k.air = true;
      if (k.on) {
        k.t += dt;
        const u = Math.min(1, k.t / TRICK_T), e = u * u * (3 - 2 * u), a = e * Math.PI * 2;
        if (k.on === "flip") k.rx = -a; else k.ry = a;
        if (u >= 1) {
          k.n++; k.pts += k.on === "flip" ? FLIP_PTS : SPIN_PTS; k.names += (k.names ? " + " : "") + (k.on === "flip" ? "Flip" : "Spin");
          k.rx = 0; k.ry = 0; k.on = k.q; k.q = null; k.t = 0;
          this.sfx("tool", r.x);
        }
      }
    } else if (k.air) {
      k.air = false;
      if (k.on) { this.pop("Sloppy", { x: r.x, y: 1.8, z: 0 }); this.buzz(6); }
      else if (k.n > 0) {
        const bonus = Math.round(k.pts * (1 + 0.5 * (k.n - 1)));
        this.addScore(bonus);
        this.pop(`${k.names} +${bonus}`, { x: r.x, y: 2.2, z: 0 }, true);
        this.sfx("power", r.x); this.buzz(25);
        if (this.stat) this.stat.tricks = (this.stat.tricks || 0) + k.n;
      }
      k.on = null; k.q = null; k.t = 0; k.n = 0; k.pts = 0; k.names = ""; k.rx = 0; k.ry = 0;
    }
    if (k.rx || k.ry || k.on) { R.root.rotation.x = k.rx; R.root.rotation.y = k.ry; }
    // Grind lines.
    if (r.rail) {
      if (k.rail && r.rail !== k.rail && k.off >= 0 && this.runTime - k.off <= LINK_T) { k.links++; this.sfx("screw", r.x, k.links); }
      k.rail = r.rail; k.off = -1; k.gl += v * dt;
    } else if (k.gl > 0) {
      if (k.off < 0) k.off = this.runTime;
      else if (this.runTime - k.off > LINK_T) this.cashGrind();
    }
  }

  cashGrind() {
    const k = this.tk, m = Math.round(k.gl * M_PER_U), bonus = Math.round(m * GRIND_PTS * (1 + 0.5 * k.links));
    if (bonus > 0) {
      this.addScore(bonus);
      this.pop(k.links ? `Grind line ×${1 + 0.5 * k.links} +${bonus}` : `Grind ${m} m +${bonus}`, { x: this.r.x, y: 2.2, z: 0 }, k.links > 0);
      this.sfx("power", this.r.x); this.buzz(15);
    }
    k.gl = 0; k.links = 0; k.rail = null; k.off = -1;
  }
}
