// Factory Zones and turns (r7 levels). Installed onto Game.prototype by game.js (methods use `this`).
//
// The sim never leaves its straight, track-relative frame (lane x, distance z): turns and climbs are a
// render-time bend of the whole world in the vertex shader, x += bend.x * d², y += bend.y * d², where d is
// the distance ahead of the robot. So collisions, rails, ramps, pickups and anti-cheat are untouched by
// turns, and the bend is a pure function of (seed, distance): the same corners for everyone on a seed.
// Zones are distance bands with their own obstacle mix (worldgen.js reads zoneRow) and their own light.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { M_PER_U, SPAWN_Z, TIPS } from "../core/constants.js?v=20261021r8";

export const COURSE_V = 3;      // course version: 1 = classic straight hall (old links), 2 = zones + turns, 3 = + set pieces and tricks (hazards.js, tricks.js)
export const ZONE_LEN = 1100;   // units per zone (935 m: ~60 s early in a run, ~30 s at top speed)
export const SLOT = 220;        // one turn per slot, five per zone: entry straight, teach, test, test, twist
const SLOTS = ZONE_LEN / SLOT;
const Z0 = 3;                   // the bend starts this far ahead of the robot, so it is never moved
const LOOK = 34;                // the bend on screen is the one this far ahead (you see a corner coming)

// Palette-only looks: every colour is a mix of graphite #14161B with off-white, yellow or cyan.
const P = { g: 0x14161b, w: 0xf2f0ea, y: 0xffc93c, c: 0x3ddcff };
const mixc = (a, b, t) => new THREE.Color(P[a]).lerp(new THREE.Color(P[b]), t);
// sig: the obstacle a zone teaches; types: its mix; bot: rover-row factor; pair: extra two-obstacle chance;
// gap: row spacing factor; turn: bend coefficient k (radius 1/(2k) units), turn length w (slot fraction),
// climb coefficient; look: fog/background, glow tint (hall light strips), key/rim/ambient intensities.
export const ZONES = [
  { name: "Bakery Line", sub: "tight lines, low crates", sig: "crate", types: ["crate", "crate", "gap", "arm", "stack"], bot: 0.8, pair: 0, gap: 0.95,
    turn: { k: 0.0034, w: 0.4, climb: 0 }, look: { fog: mixc("g", "w", 0.05), glow: mixc("w", "y", 0.12), hemi: 0.95, sun: 3.0, back: 1.5 } },
  { name: "Auto Plant", sub: "slide the welders", sig: "arm", types: ["arm", "arm", "crate", "stack", "gap"], bot: 1, pair: 0.05, gap: 1.05,
    turn: { k: 0.0018, w: 0.72, climb: 0 }, look: { fog: mixc("g", "y", 0.04), glow: mixc("w", "y", 0.3), hemi: 0.85, sun: 3.0, back: 2.0 } },
  { name: "Chip Fab", sub: "precise lane switches", sig: "stack", types: ["stack", "stack", "crate", "arm"], bot: 0.5, pair: 0.1, gap: 1.0,
    turn: { k: 0.0024, w: 0.5, climb: 0 }, look: { fog: mixc("g", "c", 0.08), glow: mixc("w", "c", 0.35), hemi: 1.1, sun: 3.2, back: 1.4 } },
  { name: "Night Port", sub: "forklifts on the move", sig: "bot", types: ["crate", "stack", "gap", "crate"], bot: 1.9, pair: 0, gap: 1.0,
    turn: { k: 0.002, w: 0.6, climb: 0.0011 }, look: { fog: mixc("g", "g", 0).multiplyScalar(0.75), glow: mixc("w", "c", 0.55), hemi: 0.6, sun: 2.6, back: 2.2 } },
  { name: "Rocket Factory", sub: "up the gantry", sig: "gap", types: ["gap", "arm", "stack", "crate", "gap"], bot: 1.2, pair: 0.12, gap: 0.95,
    turn: { k: 0.0026, w: 0.55, climb: 0.0016 }, look: { fog: mixc("g", "c", 0.04), glow: mixc("w", "w", 0), hemi: 0.9, sun: 3.0, back: 2.5 } },
];
for (const [i, Z] of ZONES.entries()) {
  TIPS["zone" + i] = { icon: "star", all: [Z.name, Z.sub] };
  // Row type lists, built once: [mix, mix before stacks unlock, teach, teach before stacks unlock].
  // Stacks (can't be jumped) still wait for diff 0.15; rovers come in their own rows, so a rover zone teaches crates.
  const early = (a) => a.filter((t) => t !== "stack").length ? a.filter((t) => t !== "stack") : ["crate"];
  const sig = Z.sig === "bot" ? ["crate"] : [Z.sig];
  Z.mix = [Z.types, early(Z.types), sig, early(sig)];
}

// One shared uniform for every patched material: (bend x, bend y, start depth).
export const BEND = { value: new THREE.Vector3(0, 0, Z0) };

const mix32 = (a) => {
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d); a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  return (a ^ (a >>> 16)) >>> 0;
};
const env = (s) => { const a = Math.min(1, s / 0.3), b = Math.min(1, (1 - s) / 0.3); return a * a * (3 - 2 * a) * b * b * (3 - 2 * b); };

export const zoneAt = (start, d) => (start + Math.floor(Math.max(0, d) / ZONE_LEN)) % ZONES.length;

// The bend coefficients at distance d along the course (pure: seed, start zone, d). Writes into out.
// Slot 0 of a zone is straight (its obstacles are taught on a straight), slot 1 a gentle turn,
// slots 2-3 full turns, slot 4 the twist: an S-bend that flips direction mid-corner.
export function bendAt(seed, start, d, out) {
  out.x = 0; out.y = 0;
  if (!(d > 0)) return out;
  const k = Math.floor(d / SLOT), iz = k % SLOTS;
  if (iz === 0) return out;
  const T = ZONES[(start + Math.floor(k / SLOTS)) % ZONES.length].turn;
  const h = mix32((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
  const u0 = 0.08 + (1 - T.w - 0.12) * ((h & 255) / 255), s = (d - k * SLOT) / SLOT - u0;
  const dir = h & 256 ? 1 : -1;
  if (s > 0 && s < T.w) {
    const q = s / T.w;
    out.x = iz === SLOTS - 1 ? dir * T.k * Math.sin(q * Math.PI * 2) : dir * T.k * (iz === 1 ? 0.55 : 1) * env(q);
    if (T.climb && (h >>> 9) & 3) out.y = T.climb * ((h >>> 11) & 3 ? 1 : -0.6) * Math.sin(q * Math.PI) ** 2;
  }
  return out;
}

/* ---------- geometry: long straight pieces get rings along z so the bend can curve them ---------- */
const STEP = 12; // chord sag at the tightest bend: k L² / 4 = 0.12 units
// Slices every triangle by z-planes STEP apart (a convex clip per slab, fan-triangulated), so the count grows
// linearly with length. Every attribute is interpolated; normals are renormalised.
const lerpV = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
function clip(poly, zi, z, keepAbove) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = keepAbove ? a[zi] >= z : a[zi] <= z, ib = keepAbove ? b[zi] >= z : b[zi] <= z;
    if (ia) out.push(a);
    if (ia !== ib) out.push(lerpV(a, b, (z - a[zi]) / (b[zi] - a[zi])));
  }
  return out;
}
function tessellate(src, sz) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const names = Object.keys(g.attributes), sizes = names.map((n) => g.attributes[n].itemSize), arrs = names.map((n) => g.attributes[n].array);
  const offs = []; let w = 0; for (const s of sizes) { offs.push(w); w += s; }
  const P = g.attributes.position.array, zi = offs[names.indexOf("position")] + 2, ni = names.indexOf("normal"), lim = STEP / Math.max(1e-6, Math.abs(sz));
  const out = names.map(() => []), n = g.attributes.position.count;
  const copy = (i) => { for (let a = 0; a < names.length; a++) for (let c = 0, A = arrs[a], k = sizes[a]; c < k; c++) out[a].push(A[i * k + c]); };
  const vert = (i) => { const v = []; for (let a = 0; a < names.length; a++) for (let c = 0; c < sizes[a]; c++) v.push(arrs[a][i * sizes[a] + c]); return v; };
  const emit = (v) => { for (let a = 0; a < names.length; a++) for (let c = 0; c < sizes[a]; c++) out[a].push(v[offs[a] + c]); };
  for (let i = 0; i < n; i += 3) {
    const za = P[i * 3 + 2], zb = P[i * 3 + 5], zc = P[i * 3 + 8], z0 = Math.min(za, zb, zc), z1 = Math.max(za, zb, zc);
    if (z1 - z0 <= lim * 1.5) { copy(i); copy(i + 1); copy(i + 2); continue; } // short: copied as is, no allocation
    const tri = [vert(i), vert(i + 1), vert(i + 2)];
    for (let lo = z0; lo < z1 - 1e-6; lo += lim) {
      const poly = clip(clip(tri, zi, lo, true), zi, Math.min(z1, lo + lim), false);
      for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); }
    }
  }
  const res = new THREE.BufferGeometry();
  names.forEach((nm, a) => {
    const arr = new Float32Array(out[a]);
    if (a === ni) for (let o = 0; o < arr.length; o += 3) { const l = Math.hypot(arr[o], arr[o + 1], arr[o + 2]) || 1; arr[o] /= l; arr[o + 1] /= l; arr[o + 2] /= l; }
    res.setAttribute(nm, new THREE.BufferAttribute(arr, sizes[a], g.attributes[nm].normalized));
  });
  g.dispose();
  return res;
}
function tessLines(src, sz) {
  const p = src.attributes.position.array, idx = src.index ? src.index.array : null, out = [], lim = STEP / Math.max(1e-6, Math.abs(sz));
  const N = idx ? idx.length : p.length / 3;
  for (let i = 0; i < N; i += 2) {
    const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3;
    const k = Math.max(1, Math.ceil(Math.abs(p[b + 2] - p[a + 2]) / lim));
    for (let j = 0; j < k; j++) for (const u of [j / k, (j + 1) / k]) out.push(p[a] + (p[b] - p[a]) * u, p[a + 1] + (p[b + 1] - p[a + 1]) * u, p[a + 2] + (p[b + 2] - p[a + 2]) * u);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return g;
}

const SHADER = `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
	mvPosition = modelMatrix * mvPosition;
	{ float d_ = max( 0.0, -mvPosition.z - ssBend.z ); mvPosition.xy += ssBend.xy * ( d_ * d_ ); }
	mvPosition = viewMatrix * mvPosition;
	gl_Position = projectionMatrix * mvPosition;`;

function bendMaterial(m) {
  if (!m || !m.isMaterial || m.userData.ssBend || m.isShaderMaterial) return;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey(); // the key as it is now, so variants never collide
  m.onBeforeCompile = function (sh, r) {
    prev?.call(this, sh, r);
    if (!sh.vertexShader.includes("#include <project_vertex>")) return;
    sh.uniforms.ssBend = BEND;
    sh.vertexShader = "uniform vec3 ssBend;\n" + sh.vertexShader.replace("#include <project_vertex>", SHADER);
  };
  m.customProgramCacheKey = () => key + "|ssBend";
  m.userData.ssBend = 1;
  m.needsUpdate = true;
}

export class Track {
  // Once, at the end of buildScene: patch every world material, tessellate long straight pieces.
  initBend() {
    const t0 = performance.now(), geoCache = new Map();
    this.bendVisit = (o) => {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) bendMaterial(m);
      if ((o.isMesh || o.isLineSegments) && o.geometry && !o.isInstancedMesh && !o.userData.ssTess) {
        o.userData.ssTess = 1;
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const sz = Math.abs(o.scale.z), len = (g.boundingBox.max.z - g.boundingBox.min.z) * sz;
        const rot = Math.abs(o.rotation.x) > 0.1; // planes laid flat: their length runs along local y
        const ext = rot ? (g.boundingBox.max.y - g.boundingBox.min.y) * Math.abs(o.scale.y) : len;
        if (ext > 30) {
          const ck = g.uuid + "|" + sz + "|" + rot;
          let t = geoCache.get(ck);
          if (!t) {
            if (rot) { t = g.clone(); t.rotateX(o.rotation.x); t = o.isLineSegments ? tessLines(t, 1) : tessellate(t, 1); t.rotateX(-o.rotation.x); }
            else t = o.isLineSegments ? tessLines(g, sz) : tessellate(g, sz);
            geoCache.set(ck, t);
          }
          o.geometry = t;
        }
      }
    };
    for (const bank of [this.M, this.TM, this.kit?.M, this.factory?.M, this.ceiling?.M, this.armKit?.M]) if (bank) for (const m of Object.values(bank)) bendMaterial(m);
    this.scene.traverse(this.bendVisit);
    this.bendMs = performance.now() - t0; // build cost of the patch + tessellation (debug/perf probes read it)
    this.bendN = this.scene.children.length;
    this.bendCur = { x: 0, y: 0 }; this.bendNow = { x: 0, y: 0 }; this.bendOut = { x: 0, y: 0 };
    this.lean = 0; this.camYaw = 0; this.camPitch = 0;
    this.zoneLook = -1; this.zoneK = 1;
    const prev = this.scene.onBeforeRender;
    // Chained before the instance sync: objects the pools add later get patched before they first draw.
    this.scene.onBeforeRender = (...a) => {
      if (this.scene.children.length !== this.bendN) { this.bendN = this.scene.children.length; this.scene.traverse(this.bendVisit); }
      prev.apply(this.scene, a);
    };
    this.lookCol = { fog: new THREE.Color(), glow: new THREE.Color() };
    this.lookFrom = { fog: this.scene.fog.color.clone(), glow: new THREE.Color(1, 1, 1), hemi: 0, sun: 0, back: 0 };
  }

  // Per run (startRun): course version, zone rotation and the first zone.
  initTrack() {
    const c = this.mode === "challenge" ? this.challenge : null;
    // A link replays the course it was made on (v1, v2); v3 and links without a known version get the current course.
    this.courseV = c && (c.v === 1 || c.v === 2) ? c.v : COURSE_V;
    // Daily Run rotates the starting zone by date; free runs and challenges start on the Bakery Line.
    this.zoneStart = this.mode === "daily" ? (this.seed >>> 3) % ZONES.length : 0;
    this.zoneIdx = this.courseV >= 2 ? this.zoneStart : -1;
    this.zoneSeen = this.zoneIdx;
  }

  // Worldgen: the zone and its phase (0-1) for a row spawning now, SPAWN_Z ahead. null on classic courses.
  zoneRow() {
    if (this.courseV < 2) return null;
    const d = this.runDist - SPAWN_Z, Z = ZONES[zoneAt(this.zoneStart, d)];
    this.zoneF = (d % ZONE_LEN) / ZONE_LEN;
    return Z;
  }

  // Render: bend uniform, robot lean, camera yaw/pitch/roll, zone light. Never read by the sim.
  updateTrack(dt) {
    if (!this.bendCur) return;
    const on = this.courseV >= 2 && (this.state === "play" || this.state === "dying" || this.state === "pause" || this.state === "count");
    const d = this.runDist || 0, k = Math.min(1, dt * 3);
    if (on) { bendAt(this.seed, this.zoneStart, d + LOOK, this.bendOut); } else { this.bendOut.x = 0; this.bendOut.y = 0; }
    // Eased so a restart or the menu never snaps the hall.
    this.bendCur.x += (this.bendOut.x - this.bendCur.x) * (on ? 1 : k);
    this.bendCur.y += (this.bendOut.y - this.bendCur.y) * (on ? 1 : k);
    BEND.value.set(this.bendCur.x, this.bendCur.y, Z0);
    if (on) bendAt(this.seed, this.zoneStart, d, this.bendNow); else { this.bendNow.x = 0; this.bendNow.y = 0; }
    // Centripetal lean, real scale: tan θ = v² / (r g), r = 1 / (2 k) units; capped at 22°.
    const vm = (this.state === "play" ? this.speed : 0) * M_PER_U, c = 2 * Math.abs(this.bendNow.x) / M_PER_U;
    const want = on ? -Math.sign(this.bendNow.x) * Math.min(0.384, Math.atan((vm * vm * c) / 9.81)) : 0;
    this.lean += (want - this.lean) * Math.min(1, dt * 6);
    if (this.state === "play") this.robot.root.rotation.z = this.lean;
    // Camera looks into the corner; capped by the screen's half-width so the robot stays framed on phones.
    const half = Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    const L = LOOK - Z0, yaw = -Math.atan((this.bendCur.x * L * L) / (LOOK + 8)), pit = Math.atan((this.bendCur.y * L * L) / (LOOK + 8));
    const cap = half * 0.32;
    this.camYaw += (Math.max(-cap, Math.min(cap, yaw)) - this.camYaw) * Math.min(1, dt * 4);
    this.camPitch += (Math.max(-0.08, Math.min(0.1, pit * 0.6)) - this.camPitch) * Math.min(1, dt * 4);
    // Zone light: eases over ~1.5 s when the robot crosses into a new zone.
    if (on) {
      const z = zoneAt(this.zoneStart, d);
      if (z !== this.zoneSeen) { this.zoneSeen = z; this.zoneEnter(z); }
    }
    this.applyLook(on ? this.zoneSeen : -1, dt);
  }

  zoneName() { return ZONES[zoneAt(this.zoneStart, this.runDist || 0)].name; }

  zoneEnter(z) {
    if (this.state !== "play") return;
    this.sfx?.("tool");
    if (!this.tutorial && (!this.tipNow || this.tipNow === "pb" || this.tipNow.startsWith("zone"))) this.showTip("zone" + z, 1.8, true);
    this.sr?.(`${ZONES[z].name}.`);
  }

  applyLook(z, dt) {
    const R = this.rig, F = this.lookFrom, C = this.lookCol;
    if (!this.lookBase) this.lookBase = { fog: this.scene.fog.color.clone(), glow: (this.factory?.M.glow.color || new THREE.Color(1, 1, 1)).clone(), hemi: R?.hemi.intensity ?? 0.85, sun: R?.sun.intensity ?? 3, back: R?.back.intensity ?? 1.6 };
    if (z !== this.zoneLook) {
      this.zoneLook = z; this.zoneK = 0;
      F.fog.copy(this.scene.fog.color);
      if (this.factory) F.glow.copy(this.factory.M.glow.color);
      if (R) { F.hemi = R.hemi.intensity; F.sun = R.sun.intensity; F.back = R.back.intensity; }
    }
    if (this.zoneK >= 1) return;
    this.zoneK = Math.min(1, this.zoneK + dt / 1.5);
    const e = this.zoneK * this.zoneK * (3 - 2 * this.zoneK), L = z >= 0 ? ZONES[z].look : this.lookBase;
    C.fog.copy(F.fog).lerp(L.fog, e);
    this.scene.fog.color.copy(C.fog);
    if (this.scene.background?.isColor) this.scene.background.copy(C.fog);
    if (this.factory) this.factory.M.glow.color.copy(C.glow.copy(F.glow).lerp(L.glow, e));
    if (R) {
      R.hemi.intensity = F.hemi + (L.hemi - F.hemi) * e;
      R.sun.intensity = F.sun + (L.sun - F.sun) * e;
      R.back.intensity = F.back + (L.back - F.back) * e;
    }
  }
}
