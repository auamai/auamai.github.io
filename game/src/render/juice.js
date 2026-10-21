// Game feel (r8 juice) and the Foreman. Everything here is presentation: it READS the run (robot, gears,
// obstacles, state) once per drawn frame and never writes anything the 120 Hz sim reads, so golden replays and
// the Daily Run are unchanged. Installed onto Game.prototype by game.js; loop.js calls juiceHold / juicePre /
// juicePost around renderer.render. No allocation per frame: every vector, array and string is made once.
//
// Draw calls: +2 while the Foreman follows (drone, floor pool), +3 in a lane check or crash (beam), +1 while sparks
// are live, so at most +4; 0 when he is away
// and no sparks are live (everything hides). Palette: #14161B, #F2F0EA, #FFC93C, #3DDCFF only.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { BEND } from "../world/track.js?v=20261021r8";

const INK = 0xf2f0ea, GOLD = 0xffc93c, CYAN = 0x3ddcff, GRAPH = 0x14161b;
const LIGHT = 0xfad779; // the searchlight: #FFC93C tinted 35% toward #F2F0EA, so dim light on grey never reads orange
const NP = 64;               // pooled sparks (one Points draw)
const HOLD = 0.085;          // crash hit-stop: the impact frame holds this long (render only)
// The Foreman's lines. Dry, short, in the floor's own words (the LINE 3 and NO RUNNING signs, the tagline).
const BARK = { close: "Line 3. Pick it up.", stumble: "Saw that.", back: "Fine. Carry on.", check: "Lane check.", run: "No running.", caught: "Back to the line." };
// Scripted encounters (run seconds): he overtakes and puts his light on the next real hazard, then drops back.
const MEET = [24, 68, 125], MEET_T = 2.4;

const SPARK_VERT = `uniform vec3 ssBend; uniform float uScale; attribute float aLife; attribute float aSize; attribute vec3 aCol;
varying float vA; varying vec3 vC;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  { float d_ = max(0.0, -w.z - ssBend.z); w.xy += ssBend.xy * (d_ * d_); }
  vec4 mv = viewMatrix * w;
  vA = aLife; vC = aCol;
  gl_PointSize = aLife > 0.0 ? aSize * (0.45 + 0.55 * aLife) * uScale / max(0.5, -mv.z) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
// A machined diamond, solid core and a crisp edge (no soft glow that would grey out on the light floor).
const SPARK_FRAG = `varying float vA; varying vec3 vC;
void main() {
  vec2 p = abs(gl_PointCoord - 0.5);
  float d = p.x + p.y;
  if (d > 0.5 || vA <= 0.0) discard;
  gl_FragColor = vec4(vC, min(1.0, vA * 1.6) * (d > 0.38 ? 0.65 : 1.0));
}`;

// Small helpers used only while building (never per frame).
function box(w, h, d, x, y, z, col) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z);
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "color"]) {
    const a = new Float32Array(n * 3); let o = 0;
    for (const g of list) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, 3));
  }
  list.forEach((g) => g.dispose());
  return out;
}
// Cone along +z from r0 at z=0 to 1 at z=1, plus a lamp disc at the apex; vertex colours fade to black
// (additive blending, so black is "no light").
function beamGeo() {
  const S = 20, pos = [], col = [], c = new THREE.Color(LIGHT);
  const ring = (i) => [Math.cos((i / S) * Math.PI * 2), Math.sin((i / S) * Math.PI * 2)];
  for (let i = 0; i < S; i++) {
    const [a, b] = ring(i), [e, f] = ring(i + 1), r0 = 0.16;
    const near = 0.035, far = 0.0;
    pos.push(a * r0, b * r0, 0, a, b, 1, e, f, 1, a * r0, b * r0, 0, e, f, 1, e * r0, f * r0, 0);
    for (const k of [near, far, far, near, far, near]) col.push(c.r * k, c.g * k, c.b * k);
    pos.push(0, 0, 0.001, a * r0 * 0.9, b * r0 * 0.9, 0.001, e * r0 * 0.9, f * r0 * 0.9, 0.001); // the lamp
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// Floor pool: a bright rim (the searchlight's edge) and a faint fill, flat on the floor.
function poolGeo() {
  const S = 28, pos = [], col = [], c = new THREE.Color(LIGHT);
  for (let i = 0; i < S; i++) {
    const a0 = (i / S) * Math.PI * 2, a1 = ((i + 1) / S) * Math.PI * 2;
    const p = (r, a) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    const quad = (r0, r1, k0, k1) => {
      pos.push(...p(r0, a0), ...p(r1, a1), ...p(r1, a0), ...p(r0, a0), ...p(r0, a1), ...p(r1, a1));
      for (const k of [k0, k1, k1, k0, k0, k1]) col.push(c.r * k, c.g * k, c.b * k);
    };
    quad(0, 0.86, 0.05, 0.04); quad(0.86, 0.94, 0.04, 0.18); quad(0.94, 1, 0.18, 0.0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class Juice {
  /* ---------- build (once, on the first drawn frame) ---------- */
  juiceBuild() {
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false, toneMapped: false };
    const M = {
      drone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }),
      beam: new THREE.MeshBasicMaterial({ ...add, side: THREE.DoubleSide, forceSinglePass: true }), // one pass, not back+front
      pool: new THREE.MeshBasicMaterial({ ...add, polygonOffset: true, polygonOffsetFactor: -2 }),
    };
    // The Foreman's drone: a graphite pod, two rotor booms, ink trim and lamp housing, a cyan eye slit.
    const parts = [
      box(0.9, 0.34, 0.62, 0, 0, 0, GRAPH), box(0.62, 0.08, 0.66, 0, 0.21, 0, 0x3a3f4b),
      box(2.1, 0.07, 0.12, 0, 0.12, 0, 0x262a33), box(0.12, 0.07, 1.5, 0, 0.12, 0, 0x262a33),
      box(0.5, 0.025, 0.5, 1.05, 0.17, 0, INK), box(0.5, 0.025, 0.5, -1.05, 0.17, 0, INK),
      box(0.5, 0.025, 0.5, 0, 0.17, 0.75, INK), box(0.5, 0.025, 0.5, 0, 0.17, -0.75, INK),
      box(0.34, 0.16, 0.2, 0, -0.22, -0.18, INK), box(0.56, 0.05, 0.02, 0, 0.03, -0.32, CYAN),
    ];
    const drone = new THREE.Mesh(merge(parts), M.drone);
    drone.scale.setScalar(0.6);
    const beam = new THREE.Mesh(beamGeo(), M.beam);
    const pool = new THREE.Mesh(poolGeo(), M.pool);
    for (const m of [drone, beam, pool]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 2; }

    // Sparks: one pooled Points (position, life, size, colour), its own bend (ShaderMaterial is not auto-patched).
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(NP * 3), L = new Float32Array(NP), Z = new Float32Array(NP), C = new Float32Array(NP * 3);
    g.setAttribute("position", new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aLife", new THREE.BufferAttribute(L, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(Z, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aCol", new THREE.BufferAttribute(C, 3).setUsage(THREE.DynamicDrawUsage));
    M.spark = new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false,
      uniforms: { ssBend: BEND, uScale: { value: 400 } } });
    const sparks = new THREE.Points(g, M.spark);
    sparks.frustumCulled = false; sparks.visible = false; sparks.renderOrder = 3;

    this.scene.add(drone, beam, pool, sparks);
    if (this.bendVisit) for (const m of [drone, beam, pool]) this.bendVisit(m);
    // Warm the programs now (on the title screen) so his first appearance mid-run costs no shader compile.
    for (const m of [drone, beam, pool, sparks]) m.visible = true;
    try { this.renderer.compile(this.scene, this.camera); } catch { /* compile is only a warm-up */ }
    for (const m of [drone, beam, pool, sparks]) m.visible = false;

    // The bark line: one pooled DOM element, mono, under the HUD. aria-hidden (the sr line carries it).
    const el = document.createElement("div");
    el.className = "fr__fm"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = "<b>Foreman</b><span></span>";
    this.root.appendChild(el);

    this.jx = {
      M, drone, beam, pool, sparks, P, L, Z, C, V: new Float32Array(NP * 3), next: 0, live: 0,
      el, elT: el.lastChild, barkT: 0, barkGap: 0, barks: 0,
      // feel state
      hold: 0, ky: 0, kv: 0, kp: 0, kpv: 0, fov: 0, sq: 0, sqv: 0,
      prev: { st: "", ground: true, launch: false, landT: 0, gears: 0, screws: 0, tools: 0, revive: 0, dist: 0, shown: false },
      // Foreman state: pressure 0 (far behind) .. 1 (right on you), his drawn position, the meet in progress
      p: 0.15, pos: new THREE.Vector3(0, 6, 9), aim: new THREE.Vector3(), aimTo: new THREE.Vector3(),
      tmp: new THREE.Vector3(), meet: -1, meetT: 0, meetX: 0, met: 0, closeSaid: false, on: 0, baseFov: 58,
    };
  }

  /* ---------- per drawn frame ---------- */
  // Crash hit-stop: hold the impact frame (no render) for ~85 ms. The sim keeps its own time.
  juiceHold(dt) {
    const J = this.jx;
    if (!J || J.hold <= 0) return false;
    J.hold -= dt;
    return true;
  }

  juicePre(dt) {
    if (!this.jx) {
      if (this.state === "menu" && (this.realT || 0) < 1.2) return; // build after the title has drawn: first frame stays as fast
      this.juiceBuild();
    }
    const J = this.jx, pv = J.prev, r = this.r, st = this.state, still = this.reduceMotion;
    if (st === "pause") return; // the frozen pause frame keeps everything where it was
    const playing = st === "play" || st === "dying";
    const fdist = this.dist - pv.dist; pv.dist = this.dist;
    const v = dt > 0 ? Math.max(0, fdist / dt) : 0;

    if (st === "play" && pv.st !== "play" && pv.st !== "pause") this.juiceReset();
    // ---- events, read from the run's state transitions ----
    if (st === "play") {
      if (pv.ground && !r.ground && r.vy > 0 && !r.rail) { this.kick(-0.05, 0.004); this.squash(0.07); }
      if (!pv.launch && r.launch) { J.fov = Math.max(J.fov, 5); this.kick(-0.08, 0.01); this.squash(0.1); }
      if (r.landT > pv.landT + 0.01) {
        const imp = r.impact || 0;
        const k = Math.min(1, Math.max(0, (imp - 4) / 12));
        this.kick(-0.06 - 0.16 * k, -0.012 * k); this.squash(-0.06 - 0.12 * k);
        if (imp > 10) this.buzz(8);
      }
      if (pv.launch && !r.launch) { this.kick(-0.22, -0.02); this.squash(-0.18); this.buzz(14); }
      // pickups: sparks where the robot caught them
      const y = r.y + (r.slideT > 0 ? 0.7 : 1.3);
      if (this.gearsRun > pv.gears) { this.sparks(r.x, y, -0.2, 9, GOLD); this.fmPush(-0.025); }
      const s = this.stat;
      if (s && s.screws > pv.screws) { this.sparks(r.x, y, -0.2, 6, CYAN); this.fmPush(-0.03); }
      if (s && s.tools > pv.tools) { this.sparks(r.x, y + 0.2, -0.2, 14, INK); this.fmPush(-0.08); }
    }
    if (st === "dying" && pv.st === "play") {
      if (!still) { J.hold = HOLD; J.fov = -4; }
      this.fmCaught();
    }
    if ((this.reviveT || 0) > pv.revive + 0.01) { this.fmPush(0.45); this.bark("stumble"); }
    pv.st = st; pv.ground = r.ground; pv.launch = !!r.launch; pv.landT = r.landT || 0; pv.gears = this.gearsRun || 0;
    pv.screws = this.stat ? this.stat.screws : 0; pv.tools = this.stat ? this.stat.tools : 0; pv.revive = this.reviveT || 0;

    // ---- springs (render time; a frozen pause frame never runs this) ----
    const h = Math.min(dt, 1 / 30);
    J.kv += (-260 * J.ky - 20 * J.kv) * h; J.ky += J.kv * h;
    J.kpv += (-260 * J.kp - 20 * J.kpv) * h; J.kp += J.kpv * h;
    J.sqv += (-420 * J.sq - 26 * J.sqv) * h; J.sq += J.sqv * h;
    J.fov *= Math.max(0, 1 - h * 7);

    if (J.barkEnd && (this.realT || 0) > J.barkEnd) { J.barkEnd = 0; J.el.classList.remove("is-on"); }
    this.sparkStep(h, v);
    if (playing) this.fmStep(h, v); else this.fmHide();

    // ---- apply (undone in juicePost, so nothing here leaks into the camera or robot the sim side eases) ----
    const c = this.camera, R = this.robot;
    J.on = 0;
    if (!still && playing) {
      J.on = 1;
      c.position.y += J.ky;
      c.rotateX(J.kp);
      if (Math.abs(J.fov) > 0.05) { J.baseFov = c.fov; c.fov = J.baseFov + J.fov; c.updateProjectionMatrix(); J.on = 2; }
      const s = Math.max(-0.2, Math.min(0.14, J.sq));
      R.root.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5); // squash (s<0) widens, stretch (s>0) narrows: volume holds
    }
    if (J.M.spark.uniforms.uScale.value !== this.renderer.domElement.height * 0.5) J.M.spark.uniforms.uScale.value = this.renderer.domElement.height * 0.5;
  }

  juicePost() {
    const J = this.jx;
    if (!J || !J.on) return;
    const c = this.camera;
    c.rotateX(-J.kp);
    c.position.y -= J.ky;
    if (J.on === 2) { c.fov = J.baseFov; c.updateProjectionMatrix(); }
    this.robot.root.scale.set(1, 1, 1);
    J.on = 0;
  }

  juiceReset() {
    const J = this.jx;
    J.p = 0.15; J.meet = -1; J.met = 0; J.closeSaid = false; J.barks = 0; J.barkGap = 0;
    J.pos.set(this.r.x, 6, 9); J.hold = 0; J.ky = J.kv = J.kp = J.kpv = J.sq = J.sqv = J.fov = 0;
    J.el.classList.remove("is-on"); J.barkEnd = 0;
  }

  kick(dy, dpitch) { const J = this.jx; if (this.reduceMotion) return; J.kv += dy * 22; J.kpv += dpitch * 22; }
  squash(a) { const J = this.jx; if (this.reduceMotion) return; J.sqv += a * 26; }

  /* ---------- sparks (pooled Points) ---------- */
  sparks(x, y, z, n, col) {
    const J = this.jx, cr = ((col >> 16) & 255) / 255, cg = ((col >> 8) & 255) / 255, cb = (col & 255) / 255; // sRGB as is: the spark shader writes its colour straight out
    n = Math.round(n * (this.coarse ? 0.7 : 1));
    for (let k = 0; k < n; k++) {
      const i = J.next; J.next = (J.next + 1) % NP;
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4, sp = 2.2 + Math.random() * 2.2;
      J.P[i * 3] = x; J.P[i * 3 + 1] = y; J.P[i * 3 + 2] = z;
      J.V[i * 3] = Math.cos(a) * sp; J.V[i * 3 + 1] = 1.5 + Math.sin(a) * sp * 0.8 + Math.random(); J.V[i * 3 + 2] = -0.6 + Math.random() * 1.2;
      J.L[i] = 1; J.Z[i] = (this.coarse ? 0.15 : 0.12) * (0.8 + Math.random() * 0.5);
      J.C[i * 3] = cr; J.C[i * 3 + 1] = cg; J.C[i * 3 + 2] = cb;
    }
    J.live = NP;
    J.sparks.geometry.attributes.aCol.needsUpdate = true;
    J.sparks.geometry.attributes.aSize.needsUpdate = true;
  }

  sparkStep(dt, v) {
    const J = this.jx;
    if (!J.live) return;
    let any = 0;
    for (let i = 0; i < NP; i++) {
      if (J.L[i] <= 0) continue;
      J.L[i] = Math.max(0, J.L[i] - dt * 2.4);
      J.V[i * 3 + 1] -= 14 * dt;
      J.P[i * 3] += J.V[i * 3] * dt; J.P[i * 3 + 1] = Math.max(0.05, J.P[i * 3 + 1] + J.V[i * 3 + 1] * dt);
      J.P[i * 3 + 2] += (J.V[i * 3 + 2] + v) * dt;
      if (J.L[i] > 0) any++;
    }
    J.live = any;
    J.sparks.visible = any > 0;
    const g = J.sparks.geometry.attributes;
    g.position.needsUpdate = true; g.aLife.needsUpdate = true;
  }

  /* ---------- the Foreman ---------- */
  fmPush(d) { const J = this.jx; J.p = Math.min(1, Math.max(0, J.p + d)); }

  fmCaught() {
    const J = this.jx;
    J.meet = -1; J.p = 1;
    this.bark("caught", true);
  }

  fmHide() {
    const J = this.jx;
    if (J.drone.visible) { J.drone.visible = J.beam.visible = J.pool.visible = false; }
    if (J.barkEnd && this.state !== "dying") { J.barkEnd = 0; J.el.classList.remove("is-on"); }
  }

  // Pressure: he gains slowly all run, and on every gear you let go by; clean clears and pickups push him back.
  fmStep(dt, v) {
    const J = this.jx, r = this.r, st = this.state;
    if (st === "play") {
      J.p = Math.min(1, J.p + dt * 0.012);
      const step = v * dt;
      for (let i = 0; i < this.gears.length; i++) {
        const g = this.gears[i];
        if (!g.taken && g.z > 1 && g.z - step <= 1) J.p = Math.min(1, J.p + 0.035);
      }
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i], e = o.z - o.h;
        if (e > 0.5 && e - step <= 0.5 && Math.abs(r.x - o.x) < 0.95) J.p = Math.max(0, J.p - 0.07); // you cleared it in its lane
      }
      if (J.p > 0.62 && !J.closeSaid) { J.closeSaid = true; this.bark(J.barks ? "run" : "close"); }
      if (J.p < 0.25 && J.closeSaid) { J.closeSaid = false; this.bark("back"); }
      // scripted meets
      const T = this.runTime || 0, at = MEET[J.met];
      if (J.meet < 0 && at !== undefined && T >= at + (this.tutorial ? 16 : 0)) {
        J.met++;
        let best = null;
        for (let i = 0; i < this.obstacles.length; i++) { const o = this.obstacles[i]; if (o.z < -12 && o.z > -46 && (!best || o.z > best.z)) best = o; }
        if (best) { J.meet = 0; J.meetT = 0; J.meetX = best.x; J.meetO = best; this.bark("check"); }
      }
    }
    const still = this.reduceMotion;
    // Target position: behind and above the robot (z +2.6 close .. +8 far, which is out of frame).
    const pos = J.tmp;
    let ax = r.x, ay = 0, az = -0.9, rad = 1.05; // the pool sits just ahead of the feet: he lights your lane
    if (st === "dying") {
      pos.set(r.x + 0.6, 4.4, 1.0); ax = r.x; az = -0.4;
    } else if (J.meet >= 0) {
      J.meetT += dt;
      const o = J.meetO, oz = o && o.z < 2 ? o.z : -20;
      pos.set(J.meetX + 0.2, 3.6, Math.min(-2, oz + 4));
      ax = J.meetX; az = oz; rad = 1.25;
      if (J.meetT > MEET_T || !o || o.z > -1) { J.meet = -1; this.fmPush(-0.1); }
    } else {
      // Over your shoulder, clear of the HUD: the upper-left corner on wide screens (score is centred, buttons
      // right), high and centred on phones (score left, buttons right). Closest he gets: about 3.6 u from the camera.
      const p = J.p, port = this.camera.aspect < 0.75;
      pos.set(r.x * 0.45 + (port ? 0 : -1.9), (port ? 6.1 : 5.4) - p * 0.3, 8.6 - p * 4.0);
    }
    // Dropping back from ahead (after a meet), he climbs over the camera instead of flying through it.
    if (pos.z > J.pos.z + 1) pos.y = Math.min(7.2, pos.y + (pos.z - J.pos.z) * 0.45);
    const k = Math.min(1, dt * (st === "dying" ? 5 : J.meet >= 0 ? 3.2 : 2.2) * (still ? 0.6 : 1));
    J.pos.lerp(pos, k);
    J.aimTo.set(ax, ay, az);
    J.aim.lerp(J.aimTo, Math.min(1, dt * 6));

    const D = J.drone, near = J.pos.z < 6.4 || J.meet >= 0 || st === "dying";
    // Following, he shows as the drone and a pool of light on your lane; the beam itself only comes on for a lane
    // check and the crash (a long shaft across the hall in every frame would hide hazards behind it).
    D.visible = J.pool.visible = near;
    J.beam.visible = near && (J.meet >= 0 || st === "dying");
    if (!near) return;
    const t = this.realT || 0;
    D.position.set(J.pos.x, J.pos.y + (still ? 0 : Math.sin(t * 2.3) * 0.08), J.pos.z);
    D.rotation.set(still ? 0 : Math.sin(t * 1.7) * 0.05, Math.atan2(J.pos.x - J.aim.x, J.pos.z - J.aim.z) * 0.5, -(J.pos.x - J.aim.x) * 0.06);
    // the beam: from the lamp to the floor pool
    const B = J.beam;
    B.position.set(D.position.x, D.position.y - 0.28, D.position.z - 0.18);
    const dist = B.position.distanceTo(J.aim);
    B.lookAt(J.aim);
    B.scale.set(rad, rad, dist);
    const pulse = J.meet >= 0 && !still ? 0.92 + 0.08 * Math.sin(t * 9) : 1; // ~1.4 Hz pulse on a meet, never a blink
    J.pool.position.set(J.aim.x, 0.04, J.aim.z);
    J.pool.scale.set(rad * pulse, 1, rad * pulse);
  }

  bark(kind, force = false) {
    const J = this.jx, now = this.realT || 0;
    if (J.barks >= 7 || (!force && now < J.barkGap && kind !== "check")) return; // a lane check always speaks
    J.barks++; J.barkGap = now + 6;
    J.elT.textContent = BARK[kind];
    J.el.classList.remove("is-on"); void J.el.offsetWidth; J.el.classList.add("is-on");
    J.barkEnd = now + (kind === "caught" ? 1.6 : 2.2); // on the run's real clock, so a pause holds it
    this.sr(`Foreman: ${BARK[kind]}`);
    if (kind === "check" || kind === "stumble") this.buzz(8);
  }

  juiceDispose() {
    const J = this.jx;
    if (!J) return;
    for (const m of [J.drone, J.beam, J.pool, J.sparks]) m.geometry.dispose();
    for (const m of Object.values(J.M)) m.dispose();
  }
}
