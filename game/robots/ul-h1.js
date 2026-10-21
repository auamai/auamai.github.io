// Uamai Labs UL-H1: the runner. Pearl shells over a navy frame, a rounded
// helmet with a wraparound visor and a periwinkle light strip, visible joint
// rings at every hinge, and a UL mark on the chest plate and the back pack.
import { THREE, bake, UL, taper, lathe, ring, ball, ulMark, mesh, group, damp } from "./kit.js?v=20261021r10";

export const info = { id: "ul-h1", name: "UL-H1", lab: "Uamai Labs", kind: "humanoid" };

export function create({ M }) {
  const root = new THREE.Group();
  const hips = group(0, 0.98, 0);
  root.add(hips);
  const geos = [];
  const keep = (g) => (geos.push(g), g);

  // Pelvis: a soft rounded block in graphite with a pearl belt.
  const pelvis = mesh(keep(lathe([[0, -0.1], [0.12, -0.09], [0.17, -0.04], [0.18, 0.03], [0.15, 0.08], [0, 0.09]])), M.graphite);
  pelvis.scale.z = 0.72;
  hips.add(pelvis);

  // Waist pivot carries the whole upper body.
  const torso = group(0, 0.07, 0);
  hips.add(torso);
  const waistRing = mesh(keep(ring(0.115, 0.018)), M.frame);
  waistRing.rotation.x = Math.PI / 2;
  waistRing.scale.y = 0.75;
  waistRing.position.y = 0.02;
  torso.add(waistRing);
  const abdomen = mesh(keep(lathe([[0, 0], [0.11, 0.01], [0.12, 0.08], [0.13, 0.16], [0, 0.17]], 20)), M.frame);
  abdomen.scale.z = 0.75;
  torso.add(abdomen);

  // Chest shell: narrow waist, full rounded chest, sloped shoulders.
  const chestProfile = [[0, 0.1], [0.14, 0.11], [0.19, 0.17], [0.235, 0.28], [0.255, 0.39], [0.25, 0.48], [0.215, 0.56], [0.15, 0.615], [0.07, 0.64], [0, 0.645]];
  const chest = mesh(keep(lathe(chestProfile, 32)), M.pearl);
  chest.scale.z = 0.66;
  torso.add(chest);
  // Panel seam around the ribcage.
  const seam = mesh(keep(ring(0.243, 0.006, 40)), M.pearlShade, 0, 0.3, 0, false);
  seam.rotation.x = Math.PI / 2;
  seam.scale.y = 0.67;
  torso.add(seam);

  // Front: a little UL mark on the chest plate.
  const markGeo = keep(ulMark());
  const front = mesh(markGeo, M.mark, 0, 0.43, -0.178, false);
  front.scale.setScalar(0.075);
  front.rotation.y = Math.PI;
  torso.add(front);

  // Back pack (faces the camera): graphite pod, vertical light strip, UL mark.
  // The pack hangs from a pivot at its top so it can lag a little behind the body.
  const packG = group(0, 0.52, 0.13);
  torso.add(packG);
  const packGeo = keep(new THREE.CapsuleGeometry(0.12, 0.2, 6, 16));
  if (M.plate) { const uv = packGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.004, 0.996); } // solid pack colour texel
  const pack = mesh(packGeo, M.plate || M.graphite, 0, 0.38 - 0.52, 0);
  pack.scale.set(1.25, 1, 0.55);
  packG.add(pack);
  const strip = mesh(keep(new THREE.CapsuleGeometry(0.012, 0.2, 3, 8)), M.light, 0, 0.36 - 0.52, 0.068, false);
  packG.add(strip);
  for (const s of [-1, 1]) packG.add(mesh(keep(new THREE.CapsuleGeometry(0.008, 0.12, 3, 6)), M.lightDeep, 0.075 * s, 0.32 - 0.52, 0.06, false));
  const back = mesh(markGeo, M.light, 0, 0.5 - 0.52, 0.063, false);
  back.scale.setScalar(0.06);
  packG.add(back);
  // Chassis plate over the light strip (Garage plate text and pattern; z clears the strip). Faces the run camera.
  if (M.plate) packG.add(mesh(keep(new THREE.PlaneGeometry(0.19, 0.095)), M.plate, 0, -0.2, 0.084));

  // Neck and head.
  const neck = mesh(keep(lathe([[0, 0.6], [0.06, 0.6], [0.05, 0.68], [0.055, 0.73], [0, 0.735]], 16)), M.frame);
  torso.add(neck);
  const neckRing = mesh(keep(ring(0.07, 0.012)), M.slate, 0, 0.655, 0, false);
  neckRing.rotation.x = Math.PI / 2;
  torso.add(neckRing);

  const head = group(0, 0.73, 0);
  torso.add(head);
  const helmet = mesh(keep(ball(0.148, 32, 22)), M.pearl, 0, 0.15, 0.01);
  helmet.scale.set(1, 1.08, 1.12);
  head.add(helmet);
  // Wraparound visor: a band of a slightly larger sphere across the face.
  const visorGeo = keep(new THREE.SphereGeometry(0.151, 36, 12, Math.PI * 1.5 - 1.2, 2.4, Math.PI * 0.36, Math.PI * 0.27));
  const visor = mesh(visorGeo, M.visor, 0, 0.15, 0.005, false);
  visor.scale.set(1.02, 1.1, 1.13);
  head.add(visor);
  // The light strip sits inside the visor glass.
  const lightGeo = keep(new THREE.TorusGeometry(0.1525, 0.0055, 6, 30, 1.8));
  const lightWrap = group(0, 0.165, 0.005);
  lightWrap.scale.set(1.02, 1, 1.13);
  const lightBar = mesh(lightGeo, M.light, 0, 0, 0, false);
  lightBar.rotation.set(Math.PI / 2, 0, -Math.PI / 2 - 0.9); // arc centred on the face (-z)
  lightWrap.add(lightBar);
  head.add(lightWrap);
  // Side "ear" joints and a crown seam.
  for (const s of [-1, 1]) {
    const ear = mesh(keep(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 20)), M.graphite, 0.146 * s, 0.14, 0.02, false);
    ear.rotation.z = Math.PI / 2;
    head.add(ear);
    const er = mesh(keep(ring(0.042, 0.007, 20)), M.light, 0.163 * s, 0.14, 0.02, false);
    er.rotation.y = Math.PI / 2;
    head.add(er);
  }
  const crown = mesh(keep(ring(0.143, 0.0035, 40)), M.pearlShade, 0, 0.15, 0.01, false);
  crown.rotation.y = Math.PI / 2;
  crown.scale.set(1.12, 1.1, 1);
  head.add(crown);

  // Arms.
  const arm = (s) => {
    const sh = group(0.3 * s, 0.5, 0);
    torso.add(sh);
    sh.add(mesh(keep(ball(0.085)), M.graphite));
    const cap = mesh(keep(new THREE.SphereGeometry(0.115, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), M.pearl, 0, 0.01, 0);
    cap.scale.set(1, 0.9, 0.9);
    sh.add(cap);
    const upper = group(0, -0.04, 0);
    sh.add(upper);
    upper.add(mesh(keep(taper(0.07, 0.056, 0.28)), M.pearl));
    const elbow = group(0, -0.29, 0);
    upper.add(elbow);
    const er = mesh(keep(ring(0.056, 0.012, 20)), M.slate, 0, 0, 0, false);
    er.rotation.y = Math.PI / 2;
    elbow.add(er);
    elbow.add(mesh(keep(ball(0.05)), M.frame));
    elbow.add(mesh(keep(taper(0.056, 0.042, 0.26)), M.pearlShade));
    const wr = mesh(keep(ring(0.042, 0.009, 18)), M.slate, 0, -0.26, 0, false);
    wr.rotation.x = Math.PI / 2;
    elbow.add(wr);
    const hand = mesh(keep(new THREE.CapsuleGeometry(0.04, 0.06, 4, 12)), M.graphite, 0, -0.33, 0);
    hand.scale.set(0.9, 1, 1.25);
    elbow.add(hand);
    const grip = group(0, -0.34, -0.02);   // held props (hammer, drill) attach here
    elbow.add(grip);
    return { sh, upper, elbow, grip };
  };
  const armL = arm(-1), armR = arm(1);

  // Legs.
  const leg = (s) => {
    const hip = group(0.105 * s, -0.04, 0);
    hips.add(hip);
    hip.add(mesh(keep(ball(0.085)), M.frame));
    hip.add(mesh(keep(taper(0.095, 0.068, 0.43)), M.pearl));
    const tseam = mesh(keep(ring(0.088, 0.004, 28)), M.pearlShade, 0, -0.17, 0, false);
    tseam.rotation.x = Math.PI / 2;
    hip.add(tseam);
    const knee = group(0, -0.44, 0);
    hip.add(knee);
    const kr = mesh(keep(ring(0.066, 0.014, 22)), M.slate, 0, 0, 0, false);
    kr.rotation.y = Math.PI / 2;
    knee.add(kr);
    knee.add(mesh(keep(ball(0.06)), M.frame));
    const kcap = mesh(keep(ball(0.045, 16, 10)), M.pearlShade, 0, 0.0, -0.045);
    kcap.scale.set(1, 1.15, 0.55);
    knee.add(kcap);
    knee.add(mesh(keep(taper(0.07, 0.048, 0.41)), M.graphite));
    const ankle = group(0, -0.42, 0);
    knee.add(ankle);
    const ar = mesh(keep(ring(0.045, 0.01, 18)), M.slate, 0, 0, 0, false);
    ar.rotation.x = Math.PI / 2;
    ankle.add(ar);
    const foot = mesh(keep(new THREE.CapsuleGeometry(0.055, 0.14, 4, 14)), M.graphite, 0, -0.06, -0.04);
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1.15, 1, 0.65);
    ankle.add(foot);
    const sole = mesh(keep(new THREE.CapsuleGeometry(0.012, 0.15, 3, 8)), M.lightDeep, 0, -0.082, -0.04, false);
    sole.rotation.x = Math.PI / 2;
    ankle.add(sole);
    return { hip, knee, ankle };
  };
  const legL = leg(-1), legR = leg(1);
  // Shadow casters: torso, head and the leg shells only (the contact blob carries the grounding). The arms and
  // the small joint balls / knee caps cost 18 shadow draws for a few pixels of shadow on the lane.
  for (const a of [armL, armR]) a.sh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  for (const l of [legL, legR]) for (const j of [l.hip, l.knee]) for (const o of j.children) if (o.isMesh && (o.material === M.frame || o.material === M.pearlShade)) o.castShadow = false;

  const J = { hips, torso, head, armL, armR, legL, legR, packG };

  /* ---------- locomotion: procedural, blended ----------
     A small blend tree of poses (run, air, slide, idle, hit), crossfaded over ~0.12 s.
     Run: a phase-driven cycle with contact / down / passing / up, feet placed by two-bone IK
     so the stance foot travels back in a straight line on the floor (planted, no skating in the
     robot's frame), stride and cadence growing with speed. Arms counter-swing with elbow bend,
     pelvis yaws and drops, the torso leans more the faster it goes, the head stays level,
     the back pack lags. Additive layers: lane-change bank and hop-step, landing absorb,
     hammer swing and held-tool arm poses. Visual only: hitboxes and timing live in game.js. */
  const L1 = 0.44, L2 = 0.42, FOOT = 0.085;         // thigh, shin, ankle-to-sole
  const HIP_DROP = 0.04;                              // hip joint below the hips group
  const K = ["hy", "hx", "hrx", "hry", "hrz", "trx", "try", "trz", "hdx", "hdy",
    "lh", "lk", "la", "rh", "rk", "ra", "lsx", "lsz", "le", "rsx", "rsz", "re", "pk"];
  const I = Object.fromEntries(K.map((k, i) => [k, i]));
  const N = K.length;
  const POSES = ["run", "air", "slide", "idle", "menu", "hit"];
  const P = Object.fromEntries(POSES.map((k) => [k, new Float32Array(N)]));
  const W = { run: 1, air: 0, slide: 0, idle: 0, menu: 0, hit: 0 };
  const out = new Float32Array(N);
  let phase = 0, wasAir = false, landT = 0, landAmp = 1, packV = 0, lastHy = 0.95, swingU = 1;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  // Two-bone IK in the leg's sagittal plane. fwd: ankle ahead of the hip joint (+ = forward),
  // down: ankle below it. Returns [hip, knee, ankle] rotations (knee bends back, foot flat + pitch).
  function ik(fwd, down, pitch = 0) {
    let d = Math.hypot(fwd, down);
    const dmax = L1 + L2 - 0.002;
    if (d > dmax) { const k = dmax / d; fwd *= k; down *= k; d = dmax; }
    const line = Math.atan2(fwd, down);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const kin = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const hip = line + a, knee = -(Math.PI - kin);
    return [hip, knee, -(hip + knee) + pitch];
  }

  // One leg's ankle target over the cycle. p: 0..1 (0 = contact), D: stance share.
  function foot(p, D, S, H, hy) {
    const hipH = hy - HIP_DROP;
    let fwd, lift, pitch = 0;
    if (p < D) {                                   // stance: straight back along the floor
      const u = p / D;
      fwd = S * (0.55 - u);
      lift = 0;
      pitch = u > 0.7 ? -0.6 * sstep((u - 0.7) / 0.3) : 0.1 * (1 - sstep(u / 0.15)); // heel strike, then toe-off
    } else {                                       // swing: heel recovery high behind, reach, descend
      const u = (p - D) / (1 - D);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      fwd = mix(-0.45 * S, 0.55 * S, e) + Math.sin(u * Math.PI) * 0.08 * S;
      lift = H * Math.sin(Math.pow(u, 0.72) * Math.PI);
      pitch = -0.5 * Math.sin(u * Math.PI) * (1 - u) + 0.15 * sstep((u - 0.75) / 0.25);
    }
    return ik(fwd, hipH - FOOT - lift, pitch);
  }

  function runPose(o, s, dt) {
    const sn = clamp((s.speed - 13) / 25, 0, 1);
    const f = 1.45 + 0.6 * sn;                     // cycles a second
    const D = mix(0.42, 0.34, sn);                 // stance share falls with speed (more flight)
    const S = 0.52 + 0.22 * sn;                    // stance travel
    const H = 0.24 + 0.24 * sn;                    // swing lift
    phase = (phase + dt * f) % 1;
    const pL = phase, pR = (phase + 0.5) % 1;
    // Pelvis: lowest mid-stance ("down"), highest in flight ("up"); landing sinks it more.
    const bob = -Math.cos(4 * Math.PI * (phase - D / 2)) * (0.024 + 0.014 * sn);
    const absorb = landT > 0 ? Math.sin((1 - landT / 0.2) * Math.PI) * 0.075 * landAmp : 0;
    const hy = 0.93 - 0.035 * sn + bob - absorb;
    o[I.hy] = hy;
    const [lh, lk, la] = foot(pL, D, S, H, hy);
    const [rh, rk, ra] = foot(pR, D, S, H, hy);
    o[I.lh] = lh; o[I.lk] = lk; o[I.la] = la; o[I.rh] = rh; o[I.rk] = rk; o[I.ra] = ra;
    // Which leg leads: +1 left forward, -1 right forward.
    const lead = Math.sin(2 * Math.PI * (phase - D * 0.5 + 0.25));
    o[I.hry] = -0.13 * lead;                       // pelvis yaw with the leading leg
    o[I.try] = 0.21 * lead;                        // shoulders counter-rotate
    o[I.hrz] = 0.045 * Math.sin(2 * Math.PI * (phase - D / 2) + Math.PI / 2); // hip drop on the swing side
    o[I.hx] = 0.018 * Math.sin(2 * Math.PI * phase);            // sway over the stance foot
    o[I.trz] = -o[I.hrz] * 0.7;
    o[I.trx] = -(0.14 + 0.18 * sn) - absorb * 1.2;              // lean grows with speed
    // Head steady: undo the torso's pitch and the net yaw.
    o[I.hdx] = -o[I.trx] * 0.75 + 0.06;
    o[I.hdy] = -(o[I.hry] + o[I.try]) * 0.9;
    // Arms: counter-swing, forearm folds more on the forward swing.
    const aL = -lead, aR = lead, amp = 0.62 + 0.3 * sn;
    o[I.lsx] = 0.12 + aL * amp; o[I.rsx] = 0.12 + aR * amp;
    o[I.le] = 1.25 + 0.35 * Math.max(0, aL) - 0.15 * Math.max(0, -aL);
    o[I.re] = 1.25 + 0.35 * Math.max(0, aR) - 0.15 * Math.max(0, -aR);
    o[I.lsz] = -0.1 - 0.04 * Math.abs(aL); o[I.rsz] = 0.1 + 0.04 * Math.abs(aR);
  }

  // Air: takeoff extension -> tuck at the apex -> reach for the floor, by vertical speed.
  const AIR = {
    up:   { lh: 1.15, lk: -1.25, la: 0.25, rh: -0.35, rk: -0.5, ra: 0.4, lsx: -0.6, rsx: 1.3, le: 0.9, re: 1.1, trx: -0.18, hdx: 0.12 },
    apex: { lh: 1.3, lk: -1.75, la: 0.3, rh: 0.75, rk: -1.65, ra: 0.3, lsx: 0.2, rsx: 0.6, le: 1.3, re: 1.2, trx: -0.05, hdx: 0.08 },
    down: { lh: 0.55, lk: -0.45, la: -0.05, rh: 0.15, rk: -0.3, ra: 0, lsx: -0.3, rsx: 0.5, le: 0.8, re: 0.8, trx: 0.05, hdx: 0.02 },
  };
  function airPose(o, s) {
    const v = s.vy;
    let a, b, t;
    if (v > 0) { a = AIR.apex; b = AIR.up; t = sstep(v / 9.6); } else { a = AIR.apex; b = AIR.down; t = sstep(-v / 9); }
    o.fill(0);
    for (const k of Object.keys(a)) o[I[k]] = mix(a[k], b[k], t);
    o[I.hy] = 0.96; o[I.lsz] = -0.45; o[I.rsz] = 0.32;
  }

  function slidePose(o) {
    o.fill(0);
    const v = { hy: 0.36, trx: 0.85, try: 0.15, hdx: -0.6, lh: 1.5, lk: -0.15, la: -0.3, rh: 1.15, rk: -0.75, ra: 0, lsx: -0.55, rsx: 1.0, lsz: -0.5, rsz: 0.35, le: 0.25, re: 0.9 };
    for (const k in v) o[I[k]] = v[k];
  }

  function idlePose(o, s, menu) {
    o.fill(0);
    const br = Math.sin(s.t * 2.2);
    o[I.hy] = 0.98 + br * 0.008;
    o[I.trx] = 0.02 * br; o[I.try] = Math.sin(s.t * 0.7) * 0.08;
    o[I.hdy] = Math.sin(s.t * 0.9) * 0.3; o[I.hdx] = -0.02 * br;
    o[I.lsz] = -0.12; o[I.le] = 0.2; o[I.lh] = 0.02; o[I.rh] = -0.02;
    o[I.lsx] = 0.05 * br;
    if (menu) { o[I.rsz] = 2.55 + Math.sin(s.t * 5) * 0.3; o[I.re] = 0.5; }
    else { o[I.rsz] = 0.12; o[I.re] = 0.2; }
  }

  function hitPose(o, s) {
    o.fill(0);
    const w = Math.sin(s.t * 18) * 0.25;
    const v = { hy: 0.9, trx: -0.55, hdx: 0.35, lh: 0.6, lk: -1.1, la: 0.3, rh: -0.2, rk: -0.9, ra: 0.3, lsx: -2.2 + w, rsx: -1.9 - w, lsz: -0.7, rsz: 0.7, le: 0.5, re: 0.6 };
    for (const k in v) o[I[k]] = v[k];
  }

  // s: { mode: menu|idle|run|air|slide|hit, t, speed, vy, lean, hammer, drill, swing }
  function update(s, dt) {
    const mode = s.mode === "menu" ? "menu" : s.mode;
    // Landing: a short absorb the run pose sinks into.
    // Landing absorb scales with the impact speed (u/s; a normal jump lands at ~6).
    if (wasAir && mode === "run") { landT = 0.2; landAmp = clamp((s.impact || 6.2) / 6.2, 0.4, 1.7); }
    wasAir = mode === "air";
    landT = Math.max(0, landT - dt);
    // Crossfade weights (slide and hit snap in a little faster).
    const tau = mode === "slide" || mode === "hit" ? 0.07 : 0.12;
    const k = 1 - Math.exp(-dt / tau);
    let sum = 0;
    for (const p of POSES) { W[p] += ((p === mode ? 1 : 0) - W[p]) * k; sum += W[p]; }
    if (W.run > 0.001 || mode === "run") runPose(P.run, s, dt);
    if (W.air > 0.001) airPose(P.air, s);
    if (W.slide > 0.001) slidePose(P.slide);
    if (W.idle > 0.001) idlePose(P.idle, s, false);
    if (W.menu > 0.001) idlePose(P.menu, s, true);
    if (W.hit > 0.001) hitPose(P.hit, s);
    out.fill(0);
    for (const p of POSES) { const w = W[p] / sum; if (w < 0.001) continue; const src = P[p]; for (let i = 0; i < N; i++) out[i] += src[i] * w; }

    // Lane change: lean from the lateral acceleration (the lane spring's), and a small hop-step.
    const ln = clamp(s.lean || 0, -2.2, 2.2), bank = Math.sin((Math.abs(ln) / 2.2) * Math.PI);
    if (mode !== "menu" && mode !== "idle") {
      // Lean angle for a = ax: atan(a / g), in game units (g = 11.54 u/s²), softened.
      out[I.hrz] += clamp(-Math.atan((s.ax || 0) / 11.54) * 0.35, -0.3, 0.3);
      out[I.trz] += 0.08 * Math.sign(ln) * bank;
      out[I.hy] += 0.05 * bank * W.run;
      out[I.hdy] += 0.15 * Math.sign(ln) * bank;
    }
    // Tools in the right hand: hammer up and ready (swing on a smash), drill pointed ahead.
    if (s.swing > 0) swingU = 0; else swingU = Math.min(1, swingU + dt / 0.32);
    if (s.hammer || s.drill) {
      const g = 1 - W.slide - W.air * 0.5;
      let rsx = s.drill ? 1.25 : 0.35, re = s.drill ? 0.35 : 2.1;
      if (s.hammer && swingU < 1) { const u = swingU; rsx = u < 0.35 ? mix(0.35, 2.7, sstep(u / 0.35)) : mix(2.7, 0.25, sstep((u - 0.35) / 0.65)); re = u < 0.35 ? mix(2.1, 1.2, sstep(u / 0.35)) : mix(1.2, 0.3, sstep((u - 0.35) / 0.65)); out[I.trx] -= 0.15 * Math.sin(u * Math.PI); }
      out[I.rsx] = mix(out[I.rsx], rsx, g); out[I.re] = mix(out[I.re], re, g);
    }
    // Back pack: a damped spring on the body's vertical motion.
    const hv = (out[I.hy] - lastHy) / Math.max(dt, 1e-3);
    lastHy = out[I.hy];
    packV += (-(J.packG.rotation.x) * 160 - packV * 14 + hv * 3.5) * dt;
    J.packG.rotation.x = clamp(J.packG.rotation.x + packV * dt, -0.25, 0.25);

    // Apply.
    hips.position.y = out[I.hy]; hips.position.x = out[I.hx];
    hips.rotation.set(out[I.hrx], out[I.hry], out[I.hrz]);
    torso.rotation.set(out[I.trx], out[I.try], out[I.trz]);
    head.rotation.set(out[I.hdx], out[I.hdy], 0);
    J.legL.hip.rotation.x = out[I.lh]; J.legL.knee.rotation.x = out[I.lk]; J.legL.ankle.rotation.x = out[I.la];
    J.legR.hip.rotation.x = out[I.rh]; J.legR.knee.rotation.x = out[I.rk]; J.legR.ankle.rotation.x = out[I.ra];
    J.armL.upper.rotation.x = out[I.lsx]; J.armL.sh.rotation.z = out[I.lsz]; J.armL.elbow.rotation.x = out[I.le];
    J.armR.upper.rotation.x = out[I.rsx]; J.armR.sh.rotation.z = out[I.rsz]; J.armR.elbow.rotation.x = out[I.re];
  }

  geos.push(...bake(root));
  return {
    info, root, joints: J, update,
    dispose() { for (const g of geos) g.dispose(); },
  };
}
