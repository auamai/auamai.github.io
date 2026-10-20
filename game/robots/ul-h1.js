// Uamai Labs UL-H1: the runner. Pearl shells over a navy frame, a rounded
// helmet with a wraparound visor and a periwinkle light strip, visible joint
// rings at every hinge, and a UL mark on the chest plate and the back pack.
import { THREE, bake, UL, taper, lathe, ring, ball, ulMark, mesh, group, damp } from "./kit.js";

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
  const pack = mesh(keep(new THREE.CapsuleGeometry(0.12, 0.2, 6, 16)), M.graphite, 0, 0.38, 0.13);
  pack.scale.set(1.25, 1, 0.55);
  torso.add(pack);
  const strip = mesh(keep(new THREE.CapsuleGeometry(0.012, 0.2, 3, 8)), M.light, 0, 0.36, 0.198, false);
  torso.add(strip);
  for (const s of [-1, 1]) torso.add(mesh(keep(new THREE.CapsuleGeometry(0.008, 0.12, 3, 6)), M.lightDeep, 0.075 * s, 0.32, 0.19, false));
  const back = mesh(markGeo, M.light, 0, 0.5, 0.193, false);
  back.scale.setScalar(0.06);
  torso.add(back);

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
    return { sh, upper, elbow };
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

  const J = { hips, torso, head, armL, armR, legL, legR };
  let phase = 0;

  // s: { mode: menu|run|air|slide|idle, t, speed, vy, dt }
  function update(s, dt) {
    const k = Math.min(1, dt * 12), kk = Math.min(1, dt * 18);
    const { armL: aL, armR: aR, legL: lL, legR: lR } = J;
    const set = (o, key, v, kx = k) => damp(o, key, v, kx);
    if (s.mode === "menu" || s.mode === "idle") {
      set(hips.position, "y", 0.98 + Math.sin(s.t * 2.2) * 0.012, Math.min(1, dt * 6));
      set(torso.rotation, "x", 0); set(torso.rotation, "y", Math.sin(s.t * 0.7) * 0.08);
      set(head.rotation, "y", Math.sin(s.t * 0.9) * 0.3); set(head.rotation, "x", 0);
      for (const l of [lL, lR]) { set(l.hip.rotation, "x", 0); set(l.knee.rotation, "x", 0); set(l.ankle.rotation, "x", 0); }
      set(aL.upper.rotation, "x", 0); set(aL.sh.rotation, "z", -0.12); set(aL.elbow.rotation, "x", 0.2);
      if (s.mode === "menu") {
        set(aR.sh.rotation, "z", 2.55 + Math.sin(s.t * 5) * 0.3, Math.min(1, dt * 8));
        set(aR.upper.rotation, "x", 0); set(aR.elbow.rotation, "x", 0.5);
      } else { set(aR.sh.rotation, "z", 0.12); set(aR.upper.rotation, "x", 0); set(aR.elbow.rotation, "x", 0.2); }
      return;
    }
    set(aL.sh.rotation, "z", -0.08); set(aR.sh.rotation, "z", 0.08);
    set(head.rotation, "y", 0);

    if (s.mode === "run") {
      phase += dt * (6.5 + s.speed * 0.27);
      const sp = Math.sin(phase), cp = Math.cos(phase);
      const sw = 0.85;
      set(lL.hip.rotation, "x", sp * sw, kk); set(lR.hip.rotation, "x", -sp * sw, kk);
      // Knee folds most while that leg swings forward, a little at contact.
      set(lL.knee.rotation, "x", -(0.18 + 1.25 * Math.pow(Math.max(0, cp), 1.4)), kk);
      set(lR.knee.rotation, "x", -(0.18 + 1.25 * Math.pow(Math.max(0, -cp), 1.4)), kk);
      set(lL.ankle.rotation, "x", 0.25 * Math.max(0, -sp), kk); set(lR.ankle.rotation, "x", 0.25 * Math.max(0, sp), kk);
      set(aL.upper.rotation, "x", -sp * 0.8, kk); set(aR.upper.rotation, "x", sp * 0.8, kk);
      set(aL.elbow.rotation, "x", 1.15 + sp * 0.25, kk); set(aR.elbow.rotation, "x", 1.15 - sp * 0.25, kk);
      set(hips.position, "y", 0.955 + 0.045 * Math.cos(2 * phase), kk);
      set(hips.rotation, "y", -sp * 0.1, kk);
      set(torso.rotation, "y", sp * 0.16, kk);
      set(torso.rotation, "x", -0.2, k);
      set(torso.rotation, "z", 0, k);
      set(head.rotation, "x", 0.12, k);
    } else if (s.mode === "air") {
      const up = s.vy > 0;
      set(lL.hip.rotation, "x", up ? 1.15 : 0.55); set(lR.hip.rotation, "x", up ? 0.25 : -0.15);
      set(lL.knee.rotation, "x", up ? -1.45 : -0.6); set(lR.knee.rotation, "x", up ? -0.85 : -0.35);
      set(lL.ankle.rotation, "x", 0.2); set(lR.ankle.rotation, "x", 0.2);
      set(aL.upper.rotation, "x", up ? -0.7 : -0.3); set(aR.upper.rotation, "x", up ? 1.7 : 0.9);
      set(aL.sh.rotation, "z", -0.45); set(aR.sh.rotation, "z", 0.3);
      set(aL.elbow.rotation, "x", 0.6); set(aR.elbow.rotation, "x", 0.9);
      set(hips.position, "y", 0.98); set(hips.rotation, "y", 0);
      set(torso.rotation, "x", up ? -0.12 : 0.02); set(torso.rotation, "y", 0);
      set(head.rotation, "x", up ? -0.05 : 0.15);
    } else if (s.mode === "slide") {
      // Power slide: leaning back, legs out front, one hand trailing.
      set(hips.position, "y", 0.36, kk); set(hips.rotation, "y", 0);
      set(torso.rotation, "x", 0.85, kk); set(torso.rotation, "y", 0.15);
      set(head.rotation, "x", -0.6);
      set(lL.hip.rotation, "x", 1.5, kk); set(lR.hip.rotation, "x", 1.15, kk);
      set(lL.knee.rotation, "x", -0.15, kk); set(lR.knee.rotation, "x", -0.75, kk);
      set(lL.ankle.rotation, "x", -0.3); set(lR.ankle.rotation, "x", 0);
      set(aL.upper.rotation, "x", -0.55); set(aR.upper.rotation, "x", 1.0);
      set(aL.sh.rotation, "z", -0.5); set(aR.sh.rotation, "z", 0.35);
      set(aL.elbow.rotation, "x", 0.25); set(aR.elbow.rotation, "x", 0.9);
    }
  }

  geos.push(...bake(root));
  return {
    info, root, joints: J, update,
    dispose() { for (const g of geos) g.dispose(); },
  };
}
