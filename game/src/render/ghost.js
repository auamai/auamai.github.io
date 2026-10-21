// Ghost racing (r7 ghost): a translucent copy of your best run on the same course (Daily Run, challenge seeds).
// Presentation only: it READS the sim (robot x/y, pose, run distance, score) ten times a second and never
// writes to it, never touches the course or loot RNG and never uses Math.random, so golden replays and the
// Daily Run are unchanged. Installed onto Game.prototype by game.js (methods use `this`, the Game).
//
// Track format (v1): 10 samples/s, 6 bytes each: x (int8, 1/25 u), y (uint8, 1/20 u), flags (bit0 slide,
// bit1 roller, bit2 airborne off a ramp), distance step (uint8, 1/20 u, carried so it never drifts) and
// score step (uint16 LE, whole points, carried). 300 s at most (18 KB raw, 24 KB base64).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { M_PER_U, visY } from "../core/constants.js?v=20261021r8";
import { fmt } from "../core/util.js?v=20261021r8";
import { mergeParts } from "./geometry.js?v=20261021r8";
import * as P from "../../profile.js?v=20261021r8";
import { BEND } from "../world/track.js?v=20261021r8";

const GKEY = "au_factory_ghost_v1";  // new key: { v: 1, list: [{ k: seed, cv: course version, m: mode, s: score, b: base64, at }] }
// A ghost belongs to one course: seed AND course version (1 classic straight hall, 2 zones + turns; absent = 1),
// so a classic challenge link never races a v2 ghost and the other way round.
const sameCourse = (e, seed, cv) => e.k === seed && (e.cv || 1) === (cv || 1);
const HZ = 10, MAX_N = 300 * HZ, SB = 6, KEEP = 4, GAP_HYST = 25;
const GHOST_COL = [0x3d / 255, 0xdc / 255, 0xff / 255]; // #3DDCFF

export function encodeTrack(u8, n) {
  let s = "";
  for (let i = 0; i < n * SB; i += 0x2000) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(n * SB, i + 0x2000)));
  return btoa(s);
}

// Decode and validate a stored or downloaded track into playback arrays (once per run start).
export function decodeTrack(b64) {
  if (typeof b64 !== "string" || b64.length > Math.ceil(MAX_N * SB / 3) * 4 + 4) return null;
  let bin;
  try { bin = atob(b64); } catch { return null; }
  if (bin.length % SB || bin.length < SB * HZ) return null;
  const n = bin.length / SB, x = new Float32Array(n), y = new Float32Array(n), f = new Uint8Array(n), d = new Float32Array(n), s = new Float32Array(n);
  let dq = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    const o = i * SB, xb = bin.charCodeAt(o);
    x[i] = (xb > 127 ? xb - 256 : xb) / 25;
    y[i] = bin.charCodeAt(o + 1) / 20;
    f[i] = bin.charCodeAt(o + 2) & 7;
    dq += bin.charCodeAt(o + 3); d[i] = dq / 20;
    sq += bin.charCodeAt(o + 4) | (bin.charCodeAt(o + 5) << 8); s[i] = sq;
  }
  return { n, x, y, f, d, s };
}

function readStore() {
  try { const j = JSON.parse(localStorage.getItem(GKEY) || "null"); return j && j.v === 1 && Array.isArray(j.list) ? j : { v: 1, list: [] }; } catch { return { v: 1, list: [] }; }
}

// The ghost follows the drawn track: the same world-space bend as every world material (track.js, ssBend), so it
// rides round corners and over climbs with the hall. The depth pass (a MeshBasicMaterial) gets the bend from
// track.js's material patch; this colour pass applies the identical formula itself (ShaderMaterials are skipped there).
const VERT = `uniform vec3 ssBend; varying vec3 vN; varying vec3 vV;
void main() { vec4 w = modelMatrix * vec4(position, 1.0);
  { float d_ = max(0.0, -w.z - ssBend.z); w.xy += ssBend.xy * (d_ * d_); }
  vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const FRAG = `uniform vec3 uCol; uniform float uA; varying vec3 vN; varying vec3 vV;
void main() {
  float r = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float scan = mod(gl_FragCoord.y, 4.0) < 1.5 ? 0.82 : 1.0;
  gl_FragColor = vec4(uCol * (0.75 + 0.45 * r), uA * (0.16 + 0.7 * r * r) * scan);
}`;

export class Ghost {
  // Bake the runner and the roller (current paint/pose) into one geometry each. Two draw calls while the
  // ghost shows: a depth-only pass so the shell reads as one clean surface, then the rim-lit colour pass.
  // Only one form is visible at a time, so the ghost never costs more than +2.
  buildGhost() {
    const bake = (root) => {
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), parts = [];
      root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !o.geometry.attributes.normal) return;
        for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return; // held props start hidden
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some((m) => m.transparent || m.isLineBasicMaterial)) return;
        parts.push({ geo: o.geometry, mx: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      });
      return parts.length ? mergeParts(parts) : null;
    };
    const R = this.robot;
    const vis = [R.runner.root.visible, R.roller.root.visible];
    R.runner.root.visible = R.roller.root.visible = true;
    const geos = [bake(R.runner.root), bake(R.roller.root)];
    R.runner.root.visible = vis[0]; R.roller.root.visible = vis[1];
    const depth = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });
    const col = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth,
      uniforms: { uCol: { value: new THREE.Vector3(...GHOST_COL) }, uA: { value: 1 }, ssBend: BEND } });
    this.M.ghostDepth = depth; this.M.ghost = col;
    const g = new THREE.Group(), forms = [];
    for (const geo of geos) {
      const f = new THREE.Group();
      if (geo) {
        const a = new THREE.Mesh(geo, depth), b = new THREE.Mesh(geo, col);
        a.renderOrder = 20; b.renderOrder = 21;
        a.frustumCulled = b.frustumCulled = false;
        f.add(a, b);
      }
      f.visible = false;
      g.add(f); forms.push(f);
    }
    g.visible = false;
    this.scene.add(g);
    // Recording buffer: allocated once, reused every run (no per-frame allocation).
    this.gRec = new Uint8Array(MAX_N * SB);
    this.gh = { g, forms, track: null, kind: "", name: "", on: false, n: 0, dq: 0, sq: 0, ahead: null, aheadT: 0, behindT: 0, chaseAt: -99, out: 0, fade: 0, shown: "" };
    if (typeof this.settings.ghost !== "boolean") this.settings.ghost = true; // on by default, a Settings toggle turns it off
  }

  // Which ghost races this course: a challenger's (when a challenge link carried one and you haven't beaten it)
  // else your own best on this seed. Free runs get a fresh seed, so they have no ghost.
  ghostStart() {
    const G = this.gh;
    if (!G) return;
    G.n = 0; G.dq = 0; G.sq = 0; G.ahead = null; G.aheadT = 0; G.behindT = 0; G.chaseAt = -99; G.out = 0; G.fade = 0; G.shown = "";
    G.track = null; G.kind = "";
    // Every run records (a free run's track can ride along when it's shared as a challenge); only Daily and
    // challenge runs keep it on this device, since a free run's course never comes back.
    G.rec = true;
    if ((this.mode === "daily" || this.mode === "challenge") && this.settings.ghost !== false) {
      const mine = readStore().list.find((e) => sameCourse(e, this.seed, this.courseV));
      const ch = this.mode === "challenge" && this.challenge && this.challenge.ghost;
      if (ch && (!mine || mine.s < ch.s)) { G.track = ch.track; G.kind = "rival"; G.name = this.challenge.name || "Rival"; }
      else if (mine) { G.track = decodeTrack(mine.b); G.kind = "pb"; G.name = "PB"; }
    }
    G.on = !!G.track;
    G.g.visible = false;
    this.elGhost.hidden = !G.on;
    if (G.on) { this.elGhostName.textContent = G.kind === "pb" ? "PB ghost" : `${G.name}’s ghost`; this.elGhostGap.textContent = "±0"; this.elGhost.classList.remove("is-ahead", "is-out", "is-chase"); }
  }

  ghostHide() { if (this.gh) { this.gh.g.visible = false; this.gh.on = false; this.elGhost.hidden = true; } }

  // Every sim step, after the robot moved. Records this run and moves the ghost along its track.
  ghostTick(dt, sliding) {
    const G = this.gh, st = this.state;
    if (!G || (st !== "play" && st !== "dying")) return;
    const t = this.runTime, r = this.r;
    // Record (play only, ten samples a second, carried rounding so distance and score never drift).
    if (G.rec && st === "play") {
      const want = Math.min(MAX_N, Math.floor(t * HZ) + 1);
      while (G.n < want) {
        const o = G.n * SB, u = this.gRec;
        u[o] = (Math.max(-127, Math.min(127, Math.round(r.x * 25))) + 256) & 255;
        u[o + 1] = Math.max(0, Math.min(255, Math.round(r.y * 20)));
        u[o + 2] = (sliding ? 1 : 0) | (this.robot.form === "roller" ? 2 : 0) | (r.launch ? 4 : 0);
        const dq = Math.max(0, Math.min(255, Math.round((this.runDist || 0) * 20) - G.dq)); G.dq += dq; u[o + 3] = dq;
        const sq = Math.max(0, Math.min(65535, Math.floor(this.score) - G.sq)); G.sq += sq; u[o + 4] = sq & 255; u[o + 5] = sq >> 8;
        G.n++;
      }
    }
    if (!G.on) return;
    const T = G.track, fi = t * HZ, i = Math.min(T.n - 1, Math.floor(fi)), j = Math.min(T.n - 1, i + 1), a = Math.min(1, fi - i);
    const ended = fi >= T.n - 1;
    const gd = T.d[i] + (T.d[j] - T.d[i]) * a, gx = T.x[i] + (T.x[j] - T.x[i]) * a, gy = T.y[i] + (T.y[j] - T.y[i]) * a;
    const z = (this.runDist || 0) - gd; // ahead of you is -z
    if (ended && !G.out && st === "play") this.ghostDown();
    if (G.out) G.fade = Math.max(0, G.fade - dt / 0.35);
    // Fade where it would cover your robot (same lane, same spot), and far up the line.
    const near = Math.abs(z) < 1.6 && Math.abs(gx - r.x) < 0.9 ? 0.35 : 1, far = z < -40 ? Math.max(0, 1 + (z + 40) / 30) : 1;
    const alpha = (G.out ? G.fade : 1) * near * far;
    const fl = T.f[i];
    G.g.visible = alpha > 0.02 && z < 8 && z > -70;
    if (G.g.visible) {
      this.M.ghost.uniforms.uA.value = alpha;
      G.g.position.set(gx, visY(gy), z);
      const roll = (fl & 2) !== 0;
      G.forms[0].visible = !roll; G.forms[1].visible = roll;
      const sl = (fl & 1) !== 0 && !roll;
      // Slide: squash and lean back; a light bob while running (none with reduce motion).
      G.g.scale.set(1, sl ? 0.52 : 1, 1);
      G.g.rotation.x = sl ? -0.35 : 0;
      if (!sl && !roll && gy < 0.05 && !this.reduceMotion) G.g.position.y += Math.abs(Math.sin(t * 9)) * 0.06;
    }
    if (st !== "play") return;
    // Ahead/behind: the race is the score at the same second of the run (speed is set by time, so
    // distance only differs through Roller Mode and ramps). Once the ghost is down, it's metres past it.
    let label;
    if (G.out) label = `+${fmt(Math.max(0, Math.round(z * M_PER_U)))} m`;
    else {
      const gs = T.s[i] + (T.s[j] - T.s[i]) * a, gap = Math.floor(this.score) - gs;
      if (gap > GAP_HYST && G.ahead !== true) {
        if (G.ahead === false && G.behindT >= 1 && t - G.chaseAt > 6) this.ghostChase();
        G.ahead = true; G.behindT = 0; this.elGhost.classList.add("is-ahead");
      } else if (gap < -GAP_HYST && G.ahead !== false) { G.ahead = false; this.elGhost.classList.remove("is-ahead"); }
      if (G.ahead === false) G.behindT += dt;
      const q = Math.round(gap / 10) * 10;
      label = q > 0 ? `+${fmt(q)}` : q < 0 ? `−${fmt(-q)}` : "±0";
    }
    if (label !== G.shown) { G.shown = label; this.elGhostGap.textContent = label; }
  }

  // Overtake: chip pulse, a pop over the runner, a chime and a short buzz (no slow-mo, nothing in the sim).
  ghostChase() {
    const G = this.gh;
    G.chaseAt = this.runTime;
    this.elGhost.classList.remove("is-chase"); void this.elGhost.offsetWidth; this.elGhost.classList.add("is-chase");
    this.pop("Overtake", { x: this.r.x, y: 2.2, z: 0 }, true);
    this.sfx("tool", this.r.x);
    this.buzz(15);
    this.sr(G.kind === "pb" ? "Ahead of your ghost." : `Ahead of ${G.name}.`);
  }

  // The ghost's run ended here and yours goes on: it fades out and the chip counts metres past it.
  ghostDown() {
    const G = this.gh;
    G.out = 1; G.fade = this.reduceMotion ? 0 : 1;
    this.elGhost.classList.add("is-out", "is-ahead");
    this.elGhostName.textContent = G.kind === "pb" ? "Past your ghost" : `Past ${G.name}`;
    this.pop(G.kind === "pb" ? "Ghost down" : `${G.name} down`, { x: this.r.x, y: 2.2, z: 0 }, true);
    this.sfx("tool", this.r.x);
    this.buzz(20);
    this.sr(G.kind === "pb" ? "You outlasted your ghost." : `You outlasted ${G.name}.`);
  }

  // Run over: keep this run as the course's ghost if it beat the stored one. Returns how it went against
  // the ghost that raced (for the game-over line), or null.
  ghostSave(score) {
    const G = this.gh;
    if (!G) return null;
    const res = G.on ? { kind: G.kind, name: G.name, beat: G.out ? true : score > G.track.s[G.track.n - 1] } : null;
    this.ghostHide();
    this.lastGhost = null;
    if (G.n < HZ * 3 || score <= 0) return res;
    const b = encodeTrack(this.gRec, G.n);
    this.lastGhost = { seed: this.seed, cv: this.courseV || 1, score, b, sent: false, cut: G.n >= MAX_N }; // a cut track wouldn't add up to the score // the share flow can attach it to a challenge
    if (this.mode !== "daily" && this.mode !== "challenge") return res;
    const S = readStore(), cv = this.courseV || 1, old = S.list.find((e) => sameCourse(e, this.seed, cv));
    if (old && old.s >= score) return res;
    const ent = { k: this.seed, cv, m: this.mode, s: score, b, at: Date.now() };
    // One Daily ghost (today's course replaces yesterday's) plus the newest challenge courses.
    S.list = [ent, ...S.list.filter((e) => !sameCourse(e, this.seed, cv) && !(this.mode === "daily" && e.m === "daily"))];
    S.list.sort((p, q) => q.at - p.at); S.list.length = Math.min(S.list.length, KEEP);
    try { localStorage.setItem(GKEY, JSON.stringify(S)); } catch { /* full or private mode: no ghost, play on */ }
    return res;
  }

  // Sharing a run as a challenge uploads its track once (fire and forget; the Worker validates it and keeps the
  // first one per seed and score). Nothing waits on it and a failure changes nothing for the player.
  ghostUpload(r) {
    const L = this.lastGhost;
    if (!L || L.sent || L.cut || !P.online() || L.seed !== r.seed || L.score !== r.score || L.cv !== (r.courseV || 1) || this.settings.ghost === false) return;
    L.sent = true;
    P.postGhost((L.seed >>> 0).toString(36), L.score, L.cv, L.b).catch(() => {});
  }

  // Opening a challenge link: fetch the sharer's ghost in the background. If it lands before the run starts,
  // it races you; otherwise you race your own best on that course (if any).
  ghostFetch() {
    const c = this.challenge;
    if (!c || !(c.score > 0) || !P.online() || this.settings.ghost === false) return;
    P.getGhost((c.seed >>> 0).toString(36), c.score, c.v || 1).then((res) => {
      const track = res && res.ok && res.data && decodeTrack(res.data.b);
      if (track && this.challenge === c && track.s[track.n - 1] <= c.score) c.ghost = { track, s: c.score };
    }).catch(() => {});
  }
}
