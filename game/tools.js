// Factory run: tool pickups (screws, wrench, drill, hammer, golden torque wrench), the props the
// runner holds, and a small pooled particle burst for smashes, overdrive and new-best confetti.
// Low-poly, gear palette only: navy, periwinkle, pearl and steel. No orange.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

export const TOOL_COL = { navy: 0x262d4d, ink: 0x10162f, steel: 0xc9cfde, pearl: 0xf4f6fb, peri: 0x8fa2f0, deep: 0x5a6dcd, glow: 0xa9bcff };

const phong = (color, o = {}) => new THREE.MeshPhongMaterial({ color, specular: 0xffffff, shininess: 70, flatShading: true, ...o });

export function toolMaterials() {
  return {
    steel: phong(TOOL_COL.steel, { emissive: 0x5a6488, emissiveIntensity: 0.25 }),
    navy: phong(TOOL_COL.navy, { shininess: 30, emissive: 0x10162f, emissiveIntensity: 0.4 }),
    peri: phong(TOOL_COL.peri, { emissive: 0x4f63c4, emissiveIntensity: 0.35 }),
    gold: phong(TOOL_COL.pearl, { emissive: 0xc3cdff, emissiveIntensity: 0.55, shininess: 120 }),
    halo: new THREE.MeshBasicMaterial({ color: TOOL_COL.glow, transparent: true, opacity: 0.24, depthWrite: false }),
    goldHalo: new THREE.MeshBasicMaterial({ color: 0xc3cdff, transparent: true, opacity: 0.38, depthWrite: false }),
    ring: new THREE.MeshBasicMaterial({ color: TOOL_COL.glow, transparent: true, opacity: 0.5, depthWrite: false }),
    shard: new THREE.MeshLambertMaterial({ color: 0xa4aaba, flatShading: true }),
    shardDark: new THREE.MeshLambertMaterial({ color: 0x3a4262, flatShading: true }),
    confetti: new THREE.MeshLambertMaterial({ color: TOOL_COL.peri, emissive: 0x6f80d8, emissiveIntensity: 0.4, flatShading: true }),
    confettiPearl: new THREE.MeshLambertMaterial({ color: TOOL_COL.pearl, emissive: 0xc3cdff, emissiveIntensity: 0.3, flatShading: true }),
  };
}

// Shared geometries, built once.
export function toolGeometries() {
  const G = {
    hex: new THREE.CylinderGeometry(0.16, 0.16, 0.08, 6),
    shaft: new THREE.CylinderGeometry(0.055, 0.03, 0.34, 6),
    thread: new THREE.TorusGeometry(0.06, 0.012, 4, 8),
    bar: new THREE.BoxGeometry(1, 1, 1),
    jaw: new THREE.TorusGeometry(0.14, 0.05, 5, 10, Math.PI * 1.45),
    eye: new THREE.TorusGeometry(0.1, 0.04, 5, 12),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    cone: new THREE.ConeGeometry(0.06, 0.3, 6),
    halo: new THREE.SphereGeometry(0.62, 14, 10),
    floor: new THREE.RingGeometry(0.45, 0.6, 28),
    shard: new THREE.TetrahedronGeometry(0.16),
    cube: new THREE.BoxGeometry(0.18, 0.18, 0.18),
  };
  G.floor.rotateX(-Math.PI / 2);
  return G;
}

const part = (geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

// One model per kind. `spin` is the part that turns; pickups also get a halo and a floor ring.
export function buildTool(kind, M, G, { pickup = true } = {}) {
  const g = new THREE.Group(), spin = new THREE.Group();
  g.add(spin);
  if (kind === "screw") {
    spin.add(part(G.hex, M.steel, 0, 0.17, 0));
    spin.add(part(G.shaft, M.steel, 0, -0.04, 0));
    for (let i = 0; i < 3; i++) { const t = part(G.thread, M.navy, 0, 0.06 - i * 0.09, 0); t.rotation.x = Math.PI / 2; spin.add(t); }
    spin.rotation.z = 0.5;
    spin.scale.setScalar(1.25);
  } else if (kind === "wrench" || kind === "gold") {
    const gold = kind === "gold";
    const body = gold ? M.gold : M.steel;
    spin.add(part(G.bar, gold ? M.gold : M.navy, 0, 0, 0, 0.11, gold ? 0.72 : 0.6, 0.06));
    const jaw = part(G.jaw, body, 0, gold ? 0.44 : 0.38, 0);
    jaw.rotation.z = -Math.PI * 0.22;
    spin.add(jaw);
    if (gold) {
      // Torque wrench: a ratchet head and a scale collar on the handle.
      spin.add(part(G.cyl, M.peri, 0, 0.44, 0, 0.16, 0.08, 0.16).rotateX(Math.PI / 2));
      spin.add(part(G.cyl, M.peri, 0, -0.12, 0, 0.09, 0.16, 0.09));
      spin.add(part(G.bar, M.navy, 0, -0.34, 0, 0.13, 0.16, 0.09));
    } else {
      spin.add(part(G.eye, body, 0, -0.36, 0));
    }
    spin.rotation.z = 0.6;
  } else if (kind === "drill") {
    spin.add(part(G.bar, M.navy, 0, 0.1, 0, 0.42, 0.18, 0.16));        // body
    spin.add(part(G.bar, M.navy, 0.06, -0.12, 0, 0.13, 0.32, 0.13));   // grip
    spin.add(part(G.bar, M.peri, 0.06, -0.3, 0, 0.17, 0.08, 0.17));    // battery
    const chuck = part(G.cyl, M.steel, -0.26, 0.1, 0, 0.11, 0.1, 0.11); chuck.rotation.z = Math.PI / 2; spin.add(chuck);
    const bit = part(G.cone, M.steel, -0.44, 0.1, 0); bit.rotation.z = Math.PI / 2; spin.add(bit);
    spin.scale.setScalar(1.1);
  } else if (kind === "hammer") {
    spin.add(part(G.cyl, M.navy, 0, -0.08, 0, 0.07, 0.62, 0.07));      // handle
    spin.add(part(G.cyl, M.peri, 0, -0.32, 0, 0.085, 0.16, 0.085));    // grip
    spin.add(part(G.bar, M.steel, 0, 0.26, 0, 0.44, 0.16, 0.16));       // head
    spin.add(part(G.bar, M.steel, 0.25, 0.26, 0, 0.08, 0.2, 0.2));      // face
    spin.rotation.z = 0.35;
  }
  if (pickup) {
    const halo = part(G.halo, kind === "gold" ? M.goldHalo : M.halo, 0, 0, 0, kind === "screw" ? 0.55 : 1, kind === "screw" ? 0.55 : 1, kind === "screw" ? 0.55 : 1);
    g.add(halo);
    if (kind !== "screw") { const fr = part(G.floor, M.ring); g.add(fr); g.userData.floor = fr; }
    g.userData.halo = halo;
  }
  g.userData.spin = spin;
  return g;
}

/* ---------- particles: debris, sparks and confetti ---------- */
export class Burst {
  constructor(scene, M, G, gearGeo, size = 48) {
    this.list = [];
    this.free = [];
    this.geos = { shard: G.shard, cube: G.cube, gear: gearGeo };
    for (let i = 0; i < size; i++) {
      const m = new THREE.Mesh(G.cube, M.shard);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.free.push(m);
    }
    this.M = M;
  }

  // kind: "crate" | "bot" | "arm" | "confetti" | "over"
  emit(kind, x, y, z, n = 10) {
    const M = this.M;
    for (let i = 0; i < n && this.free.length; i++) {
      const m = this.free.pop();
      const conf = kind === "confetti" || kind === "over", spark = kind === "spark";
      m.geometry = conf ? this.geos.gear : i % 2 ? this.geos.shard : this.geos.cube;
      m.material = conf ? (i % 3 ? M.confetti : M.confettiPearl) : kind === "bot" || kind === "arm" ? (i % 2 ? M.shardDark : M.shard) : M.shard;
      const s = spark ? 0.22 + Math.random() * 0.15 : conf ? 0.32 + Math.random() * 0.2 : 0.7 + Math.random() * 0.8;
      if (spark) m.material = M.confettiPearl;
      m.scale.setScalar(s);
      m.position.set(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.6);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.visible = true;
      const a = Math.random() * Math.PI * 2, sp = conf ? 3 + Math.random() * 3 : 2.5 + Math.random() * 4;
      this.list.push({
        m, s, life: spark ? 0.25 + Math.random() * 0.15 : conf ? 1.1 + Math.random() * 0.4 : 0.7 + Math.random() * 0.3, t: 0,
        vx: Math.cos(a) * sp, vy: (conf ? 4 : 2.5) + Math.random() * 3, vz: Math.sin(a) * sp * 0.6 - (conf ? 0 : 2),
        wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, conf,
      });
    }
  }

  // v: belt speed, so debris rides past the runner with the floor.
  // Light rigid bodies: real gravity (9.81 m/s² = 11.54 u/s²), a bounce with restitution, Coulomb-ish
  // friction and spin damping on the floor, then they settle on the belt and ride it away.
  // Confetti gets air drag instead (it's paper-light).
  update(dt, v) {
    const G = 11.54, E = 0.35, MU = 0.45;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i], m = p.m;
      p.t += dt;
      if (p.conf) { p.vy -= G * 0.35 * dt; const k = 1 - Math.min(1, dt * 1.6); p.vx *= k; p.vz *= k; }
      else p.vy -= G * dt;
      m.position.x += p.vx * dt;
      m.position.y += p.vy * dt;
      const floor = 0.05 * p.s;
      if (m.position.y < floor) {
        m.position.y = floor;
        if (p.vy < 0) p.vy = -p.vy * E;
        if (Math.abs(p.vy) < 0.4) p.vy = 0;
        const f = Math.max(0, 1 - (MU * G * dt) / Math.max(0.01, Math.hypot(p.vx, p.vz)));
        p.vx *= f; p.vz *= f; p.wx *= 0.9; p.wy *= 0.9;
      }
      m.position.z += (p.vz + v * (p.conf ? 0.15 : 1)) * dt;
      m.rotation.x += p.wx * dt; m.rotation.y += p.wy * dt;
      const k = 1 - Math.max(0, (p.t - p.life * 0.6) / (p.life * 0.4));
      p.m.scale.setScalar(Math.max(0.01, p.s * k));
      if (p.t >= p.life) { p.m.visible = false; this.free.push(p.m); this.list.splice(i, 1); }
    }
  }

  clear() { for (const p of this.list) { p.m.visible = false; this.free.push(p.m); } this.list.length = 0; }
}
