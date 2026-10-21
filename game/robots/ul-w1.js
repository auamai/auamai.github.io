// Uamai Labs UL-W1: a two-wheel self-balancing roller. A smooth teardrop pod
// rides between two big wheels; the visor and light strip match the H1.
import { THREE, bake, taper, lathe, latheBand, radiusAt, ring, ball, ulMark, mesh, group, damp } from "./kit.js?v=20261021r7";

export const info = { id: "ul-w1", name: "UL-W1", lab: "Uamai Labs", kind: "wheeled" };

const WHEEL_R = 0.37;

export function create({ M }) {
  const root = new THREE.Group();
  const geos = [];
  const keep = (g) => (geos.push(g), g);

  const axle = group(0, WHEEL_R, 0);
  root.add(axle);
  axle.add((() => { const a = mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.86, 16)), M.frame); a.rotation.z = Math.PI / 2; return a; })());

  // Wheels: soft tyre, pearl hub with a periwinkle ring and three spokes.
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = group(0.43 * s, 0, 0);
    axle.add(w);
    const tyre = mesh(keep(new THREE.TorusGeometry(WHEEL_R - 0.09, 0.09, 14, 36)), M.tire);
    tyre.rotation.y = Math.PI / 2;
    w.add(tyre);
    const hub = mesh(keep(new THREE.CylinderGeometry(0.235, 0.235, 0.12, 32)), M.pearl);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);
    const cap = mesh(keep(new THREE.SphereGeometry(0.09, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.graphite, 0.06 * s, 0, 0);
    cap.rotation.z = -Math.PI / 2 * s;
    w.add(cap);
    const lr = mesh(keep(ring(0.17, 0.013, 32)), M.light, 0.065 * s, 0, 0, false);
    lr.rotation.y = Math.PI / 2;
    w.add(lr);
    for (let i = 0; i < 3; i++) {
      const sp = mesh(keep(new THREE.CapsuleGeometry(0.02, 0.15, 3, 8)), M.slate, 0.065 * s, 0, 0, false);
      const a = (i / 3) * Math.PI * 2;
      sp.position.y = Math.cos(a) * 0.11; sp.position.z = Math.sin(a) * 0.11;
      sp.rotation.x = -a;
      w.add(sp);
    }
    wheels.push(w);
  }

  // Pod pivots on the axle so it can balance and lean.
  const pod = group(0, 0, 0);
  axle.add(pod);
  const POD = [[0, -0.24], [0.16, -0.23], [0.25, -0.15], [0.3, 0.02], [0.31, 0.2], [0.29, 0.38], [0.24, 0.53], [0.15, 0.63], [0, 0.66]];
  const shell = mesh(keep(lathe(POD, 34)), M.pearl);
  shell.scale.z = 0.86;
  pod.add(shell);
  const skirt = mesh(keep(lathe([[0, -0.27], [0.2, -0.26], [0.28, -0.18], [0.315, -0.04], [0, -0.03]], 34)), M.graphite);
  skirt.scale.z = 0.88;
  pod.add(skirt);
  const seam = mesh(keep(ring(0.305, 0.006, 44)), M.pearlShade, 0, 0.12, 0, false);
  seam.rotation.x = Math.PI / 2; seam.scale.y = 0.86;
  pod.add(seam);
  // Visor across the front of the dome.
  const visor = mesh(keep(latheBand(POD, 0.34, 0.55, 1.025, 2.3)), M.visor, 0, 0, 0, false);
  visor.scale.z = 0.86;
  pod.add(visor);
  const lw = group(0, 0.445, 0);
  lw.scale.set(1, 1, 0.86);
  const bar = mesh(keep(new THREE.TorusGeometry(radiusAt(POD, 0.445) * 1.035, 0.008, 6, 30, 1.6)), M.light, 0, 0, 0, false);
  bar.rotation.set(Math.PI / 2, 0, -Math.PI / 2 - 0.8);
  lw.add(bar);
  pod.add(lw);
  // Back: UL mark and a tail light strip toward the camera.
  const mark = mesh(keep(ulMark()), M.light, 0, 0.3, 0.262, false);
  mark.scale.setScalar(0.085);
  pod.add(mark);
  const tail = mesh(keep(new THREE.CapsuleGeometry(0.014, 0.26, 3, 10)), M.light, 0, 0.08, 0.275, false);
  tail.rotation.z = Math.PI / 2;
  pod.add(tail);
  // Fenders over the wheels.
  for (const s of [-1, 1]) {
    const f = mesh(keep(new THREE.TorusGeometry(WHEEL_R + 0.03, 0.035, 8, 24, Math.PI * 0.75)), M.graphite, 0.43 * s, 0, 0);
    f.rotation.set(0, Math.PI / 2, Math.PI * 0.125);
    axle.add(f);
    // Small arm stubs, tucked in at the shoulders of the pod.
    const stub = mesh(keep(taper(0.05, 0.04, 0.16, 14)), M.slate, 0.29 * s, 0.38, -0.02);
    stub.rotation.set(0.9, 0, 0.35 * s);
    pod.add(stub);
  }
  // A short antenna with a light at the tip.
  pod.add(mesh(keep(new THREE.CylinderGeometry(0.012, 0.015, 0.16, 8)), M.frame, 0.09, 0.71, 0.04, false));
  pod.add(mesh(keep(ball(0.025, 12, 8)), M.light, 0.09, 0.8, 0.04, false));

  let spin = 0;
  function update(s, dt) {
    const k = Math.min(1, dt * 10);
    spin -= (s.speed * dt) / WHEEL_R;
    for (const w of wheels) w.rotation.x = spin;
    if (s.mode === "menu" || s.mode === "idle") {
      damp(pod.rotation, "x", Math.sin(s.t * 2) * 0.05, k);
      damp(axle.position, "y", WHEEL_R, k);
      return;
    }
    // Balancing wobble, lean into the lane change, tuck back for a slide.
    const wob = Math.sin(s.t * 9) * 0.025;
    const target = s.mode === "slide" ? 0.95 : s.mode === "air" ? (s.vy > 0 ? -0.28 : 0.12) : -0.12 + wob;
    damp(pod.rotation, "x", target, k);
    damp(pod.position, "y", s.mode === "slide" ? -0.06 : 0, k);
    damp(root.rotation, "z", -(s.lean || 0) * 0.08, k);
  }

  geos.push(...bake(root));
  return { info, root, update, dispose() { for (const g of geos) g.dispose(); } };
}
