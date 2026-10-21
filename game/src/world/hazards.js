// Set pieces (course v3): one machine per Factory Zone, taught, tested and twisted inside the zone.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
//
//   Bakery Line    oven door   a shutter that drops shut 1.2-0.6 s before you reach it (yellow lamp), or stays open (cyan)
//   Auto Plant     stamping press   a ram on a 1.5 s rhythm: yellow lamp 0.6 s before it slams; slide under a rising ram
//   Chip Fab       wafer conveyor   cyan chevrons shove you one lane over (jump it to stay put)
//   Night Port     gantry crane     a container hangs over a marked bay and drops 1.0 s before you arrive: jump it or go round
//   Rocket Factory engine test fire  a wall engine fires across one or two lanes on a 2 s rhythm, 0.7 s of glow first
//
// Every hazard is pure sim state (lane, z, a phase from the COURSE stream, the run clock), so replays and the
// Daily Run stay deterministic; classic (v1) and v2 courses never call any of this. Drawing: every part of every
// set piece is one box instance in one of two InstancedMeshes (lit body, unlit glow), so the whole feature costs
// at most 3 draw calls (body, glow, body shadow) whatever is on screen, 0 when none is, and no per-frame allocation.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { LANES, SPAWN_Z, DESPAWN_Z, REVIVE_CLEAR } from "../core/constants.js?v=20261021r11";
import { COURSE, pick, shuffle } from "../core/util.js?v=20261021r11";
import { BOX } from "../render/geometry.js?v=20261021r11";
import { ZONES } from "./track.js?v=20261021r11";

// The zone's set piece, by zone order (track.js ZONES).
export const SET = ["door", "press", "belt", "crane", "fire"];
ZONES.forEach((Z, i) => { Z.set = SET[i]; });

const PRESS_P = 1.5, FIRE_P = 2.0, FIRE_P2 = 1.7, BELT_L = 8, NEAR = 0.25, NEAR_PTS = 40;
const SIDES = [-1, 1];
const N_BODY = 96, N_GLOW = 160;
// Palette only: graphite, off-white, yellow, cyan, and two graphite/off-white steels.
const C = { g: new THREE.Color(0x14161b), w: new THREE.Color(0xf2f0ea), y: new THREE.Color(0xffc93c), c: new THREE.Color(0x3ddcff) };
C.s = C.g.clone().lerp(C.w, 0.45); C.d = C.g.clone().lerp(C.w, 0.2);
const smooth = (a) => { a = Math.max(0, Math.min(1, a)); return a * a * (3 - 2 * a); };

// Press ram bottom height over its cycle: idle up, warn (lifts a little), slam, hold, rise.
function ramY(u) {
  if (u < 0.3) return 2.6;
  if (u < 0.9) return 2.6 + 0.2 * smooth((u - 0.3) / 0.6);
  if (u < 1.0) { const s = (u - 0.9) / 0.1; return 2.8 - 2.6 * s * s; }
  if (u < 1.2) return 0.2;
  return 0.2 + 2.4 * smooth((u - 1.2) / 0.3);
}

export class Hazards {
  buildHazards() {
    const body = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N_BODY);
    const glow = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial({ color: 0xffffff }), N_GLOW);
    for (const m of [body, glow]) { m.count = 0; m.frustumCulled = false; m.setColorAt(0, C.w); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
    // Shadows: the machined body casts (one extra shadow draw while a set piece is near); lamps, chevrons and flames
    // are light, not matter, so the glow mesh never casts or receives.
    body.castShadow = true; glow.castShadow = false; glow.receiveShadow = false;
    this.hzMesh = { body, glow, nb: 0, ng: 0 };
    this.hz = []; this.hzPool = [];
  }

  // Worldgen (v3 only): maybe lay this zone's set piece instead of an ordinary row. Returns true if it did.
  setPieceRow(Z, f, z) {
    if (this.courseV < 3 || !Z || this.tutorial || f < 0.25 || this.runTime < 6) return false;
    if (!this.hz) this.buildHazards();
    if ((this.runDist || 0) < (this.hzNext || 0)) return false;
    // Teach (first sighting, alone, roomy), test (with the zone's mix), twist (the hard variant), retire at zone end.
    const stage = f < 0.42 ? 0 : f < 0.75 ? 1 : 2;
    if (COURSE() >= [0.55, 0.3, 0.34][stage]) return false;
    const kind = Z.set, lanes = shuffle([0, 1, 2]);
    let free = [], len = 0;
    if (kind === "door") {
      if (stage < 2) { this.spawnHazard("door", lanes[0], z, 0, 1); free = lanes.slice(1); }
      else { this.spawnHazard("door", lanes[0], z, 0, 1); this.spawnHazard("door", lanes[1], z, 0, 0); free = [lanes[1], lanes[2]]; }
    } else if (kind === "press") {
      const ph = COURSE() * PRESS_P;
      this.spawnHazard("press", lanes[0], z, ph, 0);
      if (stage === 2) this.spawnHazard("press", lanes[1], z, ph + PRESS_P / 2, 0);
      // Gears under the ram: time it for the reward, or take the open lane.
      for (let i = 0; i < 3; i++) this.spawnGear(lanes[0], z + 1.6 - i * 1.6, 1.0);
      free = lanes.slice(stage === 2 ? 2 : 1);
    } else if (kind === "belt") {
      const L = lanes[0] === 1 ? 1 : lanes[0], d = L === 0 ? 1 : L === 2 ? -1 : (COURSE() < 0.5 ? -1 : 1), T = L + d;
      this.spawnHazard("belt", L, z, 0, d);
      let end = T;
      if (stage === 2 && T === 1) { this.spawnHazard("belt", T, z - BELT_L - 6, 0, d); end = T + d; len = BELT_L + 6; }
      if (stage === 1) { this.spawnObstacle("crate", T, z - BELT_L - 12); for (let i = 0; i < 5; i++) { const u = (i - 2) / 2; this.spawnGear(T, z - BELT_L - 12 - u * 2.4, 1.0 + 1.3 * (1 - u * u)); } }
      else for (let i = 0; i < 5; i++) this.spawnGear(end, z - BELT_L - len - 1 - i * 2.4, 1.0);
      free = [0, 1, 2].filter((l) => l !== L && l !== T && l !== end);
    } else if (kind === "crane") {
      this.spawnHazard("crane", lanes[0], z, 0, 1.2);
      if (stage === 2) { this.spawnHazard("crane", lanes[1], z - 10, 0, 1.6); len = 10; }
      free = lanes.slice(stage === 2 ? 2 : 1);
    } else if (kind === "fire") {
      const side = COURSE() < 0.5 ? -1 : 1, n = stage === 0 ? 1 : 2, near = side < 0 ? 0 : 2;
      this.spawnHazard("fire", near, z, COURSE() * FIRE_P, side, n, stage === 2 ? FIRE_P2 : FIRE_P);
      free = [0, 1, 2].filter((l) => Math.abs(l - near) >= n);
    }
    // Test rows add one ordinary obstacle from the zone's mix in a lane the machine leaves open (never the last open lane).
    if (stage === 1 && free.length > 1) { const ln = free.pop(); this.spawnObstacle(pick(Z.types.filter((t) => t !== "stack" && t !== "bot")) || "crate", ln, z); }
    if (free.length) this.fillLane(pick(free), z, true);
    const room = stage === 0 ? 1.35 : 1.15;
    this.toNext = (Math.max(16, this.speed * 0.7) + COURSE() * 8) * room + len;
    this.hzNext = (this.runDist || 0) + this.toNext + 24; // never two set pieces back to back
    this.hzNoBot = (this.runDist || 0) + 70;               // rovers never drive through a machine
    return true;
  }

  spawnHazard(kind, lane, z, ph, a, b = 1, per = 0) {
    const h = this.hzPool.pop() || {};
    h.kind = kind; h.lane = lane; h.x = LANES[lane]; h.z = z; h.ph = ph; h.a = a; h.n = b; h.per = per || (kind === "press" ? PRESS_P : FIRE_P);
    h.done = false; h.inside = false; h.drop = false; h.t = 0; h.u = 0; h.y = kind === "crane" ? 6.4 : 0; h.p = 0;
    this.hz.push(h);
    return h;
  }

  clearHazards(ahead = 0) {
    if (!this.hz) return;
    for (let i = this.hz.length - 1; i >= 0; i--) {
      const h = this.hz[i];
      if (ahead && !(h.z > -ahead && h.z < 2)) continue;
      this.hzPool.push(h); this.hz.splice(i, 1);
    }
    if (!ahead) { this.hzNext = 0; this.hzNoBot = 0; this.drawHazards(0); }
  }


  updateHazards(dt, v, st, sliding) {
    const r = this.r, T = this.runTime, top = sliding ? 0.8 : this.driving ? 1.25 : 1.9;
    for (let i = this.hz.length - 1; i >= 0; i--) {
      const h = this.hz[i], zPrev = h.z;
      h.z += v * dt;
      const tta = -h.z / Math.max(1, v);
      let deadly = false, half = 0.6;
      if (h.kind === "press") {
        h.u = ((T + h.ph) % h.per + h.per) % h.per; h.y = ramY(h.u);
        deadly = h.y < r.y + top - 0.1; half = 0.65;
      } else if (h.kind === "fire") {
        h.u = ((T + h.ph) % h.per + h.per) % h.per;
        deadly = h.u >= 0.7 && h.u < 1.3; half = 0.75;
      } else if (h.kind === "door") {
        h.p = h.a ? smooth((1.2 - tta) / 0.6) : 0;
        deadly = h.p > 0.5; half = 0.3;
      } else if (h.kind === "crane") {
        if (!h.drop && st === "play" && tta <= h.a && h.z < 0) { h.drop = true; h.t = 0; }
        if (h.drop && h.y > 0) { h.t += dt; h.y = Math.max(0, 6.4 - 30 * h.t * h.t); if (h.y === 0) { this.sfx("crate", h.x); if (!this.reduceMotion) this.shake = Math.max(this.shake || 0, 0.06); } }
        deadly = r.y < h.y + 1.05 && r.y + top > h.y; half = 1.2;
      }
      if (st === "play" && !h.done && zPrev - half - 0.25 <= 0 && h.z + half + 0.25 >= 0) {
        const inLane = h.kind === "fire" ? (h.a < 0 ? r.x < LANES[h.n - 1] + 0.95 : r.x > LANES[3 - h.n] - 0.95) : Math.abs(r.x - h.x) < 0.95;
        if (h.kind === "belt") {
          // Shoved one lane over, only with the wheels on the belt.
          if (inLane && r.ground && !r.rail && !r.launch && r.y < 0.05 && Math.abs(r.x - h.x) < 0.6) {
            h.done = true; r.lane = h.lane + h.a; this.sfx("step", r.x); this.buzz(12);
          }
        } else if (inLane && deadly) {
          if (!this.invulnerable) { h.done = true; this.die("crash", h.kind); }
        } else if (inLane) h.inside = true;
      } else if (st === "play" && !h.done && h.z - (h.kind === "belt" ? BELT_L : half) - 0.25 > 0) {
        h.done = true;
        if (h.inside && (h.kind === "press" || h.kind === "fire")) this.nearMiss(h);
      }
      if (h.kind === "belt" && !h.done && st === "play" && h.z > 0.6 && h.z - BELT_L < 0 && Math.abs(r.x - h.x) < 0.6 && r.ground && !r.rail && !r.launch && r.y < 0.05) {
        h.done = true; r.lane = h.lane + h.a; this.sfx("step", r.x); this.buzz(12);
      }
      if (h.z - (h.kind === "belt" ? BELT_L : 0) > DESPAWN_Z) { this.hzPool.push(h); this.hz.splice(i, 1); }
    }
    this.drawHazards(T);
  }

  // Close shave: through a press or past a test fire within 0.25 s of its deadly window. Points, a notch of the
  // Overdrive meter, a pop, a tick and a buzz (risk and reward that feeds the existing flow).
  nearMiss(h) {
    const u = h.u, a = h.kind === "press" ? 0.93 : 0.7, b = h.kind === "press" ? 1.38 : 1.3;
    const toStart = ((a - u) % h.per + h.per) % h.per, sinceEnd = ((u - b) % h.per + h.per) % h.per;
    if (!(toStart < NEAR || sinceEnd < NEAR)) return;
    this.addScore(NEAR_PTS * this.mult);
    this.fillMeter(1);
    this.pop("Close", { x: this.r.x, y: 2.0, z: 0 }, true);
    this.sfx("tool", this.r.x); this.buzz(15);
    if (this.stat) this.stat.close = (this.stat.close || 0) + 1;
  }

  // One box instance: scale + translate, written straight into the instance arrays.
  hb(glow, x, y, z, sx, sy, sz, col) {
    const M = this.hzMesh, m = glow ? M.glow : M.body, i = glow ? M.ng : M.nb;
    if (i >= (glow ? N_GLOW : N_BODY)) return;
    const a = m.instanceMatrix.array, o = i * 16;
    a[o] = sx; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = sz; a[o + 11] = 0; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    const c = m.instanceColor.array, k = i * 3; c[k] = col.r; c[k + 1] = col.g; c[k + 2] = col.b;
    if (glow) M.ng++; else M.nb++;
  }

  drawHazards(T) {
    const M = this.hzMesh;
    if (!M) return;
    M.nb = 0; M.ng = 0;
    const blink = Math.floor((this.t || 0) / 0.2) % 2 === 0; // 2.5 Hz: under the 3-flashes-a-second line
    if (this.hz) for (const h of this.hz) {
      if (h.z < SPAWN_Z - 20) continue;
      const X = h.x, Z = h.z;
      if (h.kind === "door") {
        const tta = -Z / Math.max(1, this.speed);
        for (const s of SIDES) this.hb(0, X + s * 1.0, 1.35, Z, 0.24, 2.7, 0.55, C.d);
        this.hb(0, X, 2.82, Z, 2.3, 0.34, 0.65, C.g);
        this.hb(1, X, 1.3, Z - 0.3, 1.74, 2.4, 0.05, C.y);                    // oven glow behind the frame
        const hh = 2.45 * h.p;
        if (hh > 0.02) { this.hb(0, X, 2.62 - hh / 2, Z + 0.05, 1.78, hh, 0.16, C.w); this.hb(1, X, 2.66 - hh, Z + 0.14, 1.78, 0.09, 0.04, C.y); }
        this.hb(1, X, 3.08, Z + 0.15, 0.56, 0.16, 0.16, h.a ? (tta < 1.8 && !blink ? C.g : C.y) : C.c);
      } else if (h.kind === "press") {
        const y = h.y, warn = h.u >= 0.3 && h.u < 1.2;
        for (const s of SIDES) this.hb(0, X + s * 1.08, 1.8, Z, 0.28, 3.6, 0.7, C.g);
        this.hb(0, X, 3.72, Z, 2.5, 0.42, 0.9, C.g);
        this.hb(0, X, (3.5 + y + 0.55) / 2, Z, 0.32, Math.max(0.05, 3.5 - y - 0.55), 0.32, C.s);
        this.hb(0, X, y + 0.28, Z, 1.82, 0.56, 1.3, C.w);
        this.hb(1, X, y + 0.04, Z + 0.66, 1.82, 0.08, 0.04, C.y);
        this.hb(0, X, 0.04, Z, 1.9, 0.08, 1.5, C.d);
        this.hb(1, X, 4.02, Z + 0.3, 0.56, 0.18, 0.18, warn ? (blink ? C.y : C.g) : C.c);
      } else if (h.kind === "belt") {
        const zc = Z - BELT_L / 2, d = h.a, off = ((this.t || 0) * 1.4) % 0.7;
        this.hb(0, X, 0.05, zc, 1.9, 0.1, BELT_L, C.g);
        for (const s of SIDES) this.hb(0, X + s * 1.0, 0.12, zc, 0.1, 0.2, BELT_L, C.s);
        // Chevrons pointing where it shoves you, scrolling that way.
        for (let row = 0; row < 3; row++) for (let k = 0; k < 2; k++) {
          const cx = X + d * (-0.55 + k * 0.7 + off), cz = Z - 1.4 - row * 2.6;
          if (Math.abs(cx - X) > 0.85) continue;
          this.hb(1, cx, 0.11, cz, 0.16, 0.02, 0.16, C.c);
          this.hb(1, cx - d * 0.2, 0.11, cz - 0.24, 0.16, 0.02, 0.16, C.c);
          this.hb(1, cx - d * 0.2, 0.11, cz + 0.24, 0.16, 0.02, 0.16, C.c);
        }
        this.hb(1, X, 0.13, Z - 0.05, 1.9, 0.03, 0.1, C.c);
      } else if (h.kind === "crane") {
        const y = h.y, armed = h.drop || -Z / Math.max(1, this.speed) < h.a + 0.6;
        this.hb(0, 0, 7.4, Z, 8.6, 0.36, 0.6, C.g);
        this.hb(0, X, 7.05, Z, 0.9, 0.4, 0.9, C.s);
        if (y > 0) this.hb(0, X, (6.85 + y + 1.1) / 2, Z, 0.06, Math.max(0.05, 6.85 - y - 1.1), 0.06, C.g);
        this.hb(0, X, y + 0.55, Z, 1.7, 1.1, 2.4, C.w);
        for (const s of SIDES) this.hb(0, X, y + 0.55, Z + s * 0.8, 1.73, 1.12, 0.1, C.d);
        this.hb(1, X, y + 1.08, Z, 1.73, 0.06, 2.42, C.y);
        if (y > 0.05) {
          const col = armed ? C.y : C.c;
          for (const s of SIDES) { this.hb(1, X + s * 0.95, 0.02, Z, 0.08, 0.02, 2.6, col); this.hb(1, X, 0.02, Z + s * 1.3, 1.98, 0.02, 0.08, col); }
        }
      } else if (h.kind === "fire") {
        const s = h.a, W = s * 3.95, u = h.u ?? 0, n = h.n;
        this.hb(0, W, 1.0, Z, 0.7, 1.5, 1.5, C.g);
        this.hb(0, W - s * 0.45, 1.0, Z, 0.22, 1.05, 1.05, C.s);
        const far = (s < 0 ? LANES[n - 1] + 1.1 : LANES[3 - n] - 1.1), x0 = W - s * 0.56, w = Math.abs(far - x0);
        this.hb(1, (x0 + far) / 2, 0.02, Z + 0.95, w, 0.02, 0.1, C.y);         // the danger line on the floor
        if (u < 0.7) {
          const g = smooth(u / 0.7);
          this.hb(1, x0, 1.0, Z, 0.05, 0.3 + 0.55 * g, 0.3 + 0.55 * g, C.y);    // the nozzle glows up
          if (u > 0.35) this.hb(1, x0 - s * 0.3, 1.0, Z, 0.6, 0.18, 0.18, C.w); // pilot
        } else if (u < 1.3) {
          const fl = 1 + 0.06 * Math.sin((this.t || 0) * 31);
          this.hb(1, (x0 + far) / 2, 1.0, Z, w, 1.4 * fl, 1.2, C.y);
          this.hb(1, (x0 + far) / 2 - s * 0.1, 1.0, Z, w * 0.96, 0.5 * fl, 1.3, C.w); // white-hot core, showing through front and back
        }
      }
    }
    M.body.count = M.nb; M.glow.count = M.ng;
    // Nothing on screen: hide both meshes so they cost no draw call (main or shadow) between set pieces.
    M.body.visible = M.nb > 0; M.glow.visible = M.ng > 0;
    M.body.instanceMatrix.needsUpdate = M.body.instanceColor.needsUpdate = true;
    M.glow.instanceMatrix.needsUpdate = M.glow.instanceColor.needsUpdate = true;
  }

  // Spare Servo: the reboot clears machines just ahead too.
  reviveHazards() { this.clearHazards(REVIVE_CLEAR); }
}
