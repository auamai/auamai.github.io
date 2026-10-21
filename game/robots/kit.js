// Shared parts bin for Uamai Labs robots: smooth shell materials, tapered limb
// shells, joint rings and the UL mark. Procedural geometry only, no assets.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

export { THREE };

// Uamai Labs palette, taken from the site: pearl shells on a navy frame,
// periwinkle light. Cool tones only.
export const UL = {
  pearl: 0xdfe4ef,
  pearlShade: 0xc9cfde,
  navy: 0x1b2142,
  graphite: 0x2c3358,
  slate: 0x4a5482,
  visor: 0x0b1024,
  light: 0xa9bcff,
  lightDeep: 0x7f95f0,
};

/* ---------- environment for reflections ---------- */
// A tiny procedural "room": soft white walls, a few bright ceiling panels and a
// periwinkle strip, prefiltered once with PMREM. Only the robot materials use it.
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 12),
    new THREE.MeshBasicMaterial({ color: 0x8c8f95, side: THREE.BackSide }) // neutral graphite-grey studio (no periwinkle cast on steel),
  );
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9.5, 24), new THREE.MeshBasicMaterial({ color: 0x3a3e46 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  scene.add(floor);
  const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [x, z, w, d] of [[0, 0, 8, 1.2], [-4, -3, 1.2, 6], [4, 3, 1.2, 6], [0, -5, 5, 0.8]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), panel);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, 6, z);
    scene.add(p);
  }
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.5), new THREE.MeshBasicMaterial({ color: UL.light }));
  strip.position.set(0, 0.5, -8);
  scene.add(strip);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.035).texture;
  pm.dispose();
  scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

/* ---------- materials ---------- */
// One shared rim uniform: a soft periwinkle fresnel on every shell, so the
// silhouette separates from the white hall without outlines.
export const rim = { color: { value: new THREE.Color(0xc4d1ff) }, power: { value: 2.4 }, strength: { value: 0.42 } };

function withRim(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = rim.color;
    sh.uniforms.uRimPower = rim.power;
    sh.uniforms.uRimStrength = rim.strength;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRimColor; uniform float uRimPower; uniform float uRimStrength;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float ulRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
        totalEmissiveRadiance += uRimColor * ulRim * uRimStrength;`);
  };
  mat.customProgramCacheKey = () => "ul-rim";
  return mat;
}

export function makeMaterials(env, lite = false) {
  const shell = (color, rough, cc = 1, extra = {}) => withRim(lite
    ? new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05, envMap: env, envMapIntensity: 0.7, ...extra })
    : new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0.05, clearcoat: cc, clearcoatRoughness: 0.14, envMap: env, envMapIntensity: 0.7, ...extra }));
  return {
    pearl: shell(UL.pearl, 0.32),
    pearlShade: shell(UL.pearlShade, 0.38, 0.7),
    frame: shell(UL.navy, 0.5, 0.4),
    graphite: shell(UL.graphite, 0.36, 0.8),
    slate: shell(UL.slate, 0.42, 0.6),
    visor: shell(UL.visor, 0.08, 1, { metalness: 0.4, envMapIntensity: 1.4 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x161a2e, roughness: 0.75, metalness: 0, envMap: env, envMapIntensity: 0.3 }),
    light: new THREE.MeshBasicMaterial({ color: UL.light }),
    lightDeep: new THREE.MeshBasicMaterial({ color: UL.lightDeep }),
    mark: new THREE.MeshBasicMaterial({ color: 0x8ea2f6 }),
    // Garage chassis plate (r7): the back pack and its plate share this lit graphite shell and one
    // CanvasTexture (the game paints it), so the plate costs no extra draw call.
    plate: Object.assign(shell(0xffffff, 0.36, 0.8), { userData: { keepUv: true } }),
  };
}

/* ---------- geometry ---------- */
// A limb shell: rounded top of radius r0, a smooth taper, rounded bottom r1.
// Hangs from its pivot at y=0 down to y=-len.
export function taper(r0, r1, len, radial = 20) {
  const pts = [];
  const cap = 6;
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r0, -r0 + Math.cos(a) * r0 + r0 * 0.4)); }
  const mid = 6;
  for (let i = 1; i < mid; i++) {
    const t = i / mid, s = t * t * (3 - 2 * t);
    pts.push(new THREE.Vector2(r0 + (r1 - r0) * s + Math.sin(t * Math.PI) * (r0 - r1) * 0.35, -r0 * 0.6 - (len - r0 * 0.6 - r1 * 0.6) * t));
  }
  for (let i = 0; i <= cap; i++) { const a = Math.PI / 2 + (i / cap) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.sin(a) * r1), -len + r1 * 0.4 + Math.cos(a) * r1)); }
  pts[pts.length - 1].x = 0.0001;
  pts.reverse();
  return new THREE.LatheGeometry(pts, radial);
}

// A body from a side profile of [radius, y] pairs, closed at both ends.
// The profile is run through a spline so the silhouette stays smooth, not faceted.
export function lathe(profile, radial = 28, samples = 36) {
  const raw = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const pts = new THREE.SplineCurve(raw).getSpacedPoints(samples).map((p) => new THREE.Vector2(Math.max(0.0001, p.x), p.y));
  pts[0].x = 0.0001; pts[pts.length - 1].x = 0.0001;
  return new THREE.LatheGeometry(pts, radial);
}

// A partial band of a lathe body between y0 and y1, pushed out by `grow`,
// covering phiLen radians centred on the front (-z). Used for visors and
// light strips that have to sit exactly on a curved shell.
export function latheBand(profile, y0, y1, grow = 1.03, phiLen = 2.2, samples = 120) {
  const raw = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const all = new THREE.SplineCurve(raw).getSpacedPoints(samples);
  const pts = all.filter((p) => p.y >= y0 && p.y <= y1).map((p) => new THREE.Vector2(p.x * grow, p.y));
  pts.sort((a, b) => a.y - b.y);
  return new THREE.LatheGeometry(pts, 32, Math.PI - phiLen / 2, phiLen);
}
export function radiusAt(profile, y, samples = 120) {
  const all = new THREE.SplineCurve(profile.map(([r, yy]) => new THREE.Vector2(r, yy))).getSpacedPoints(samples);
  let best = all[0];
  for (const p of all) if (p.x > 0.001 && Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
  return best.x;
}

export const ring = (r, tube, seg = 28) => new THREE.TorusGeometry(r, tube, 10, seg);
export const ball = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);

// "UL" in a clean monoline, extruded with a soft bevel. About 1 unit tall.
export function ulMark() {
  const U = new THREE.Shape();
  const w = 0.62, t = 0.2, h = 1;
  U.moveTo(-w / 2, h / 2);
  U.lineTo(-w / 2 + t, h / 2);
  U.lineTo(-w / 2 + t, -h / 2 + w / 2);
  U.absarc(0, -h / 2 + w / 2, w / 2 - t, Math.PI, 0, false);
  U.lineTo(w / 2 - t, h / 2);
  U.lineTo(w / 2, h / 2);
  U.lineTo(w / 2, -h / 2 + w / 2);
  U.absarc(0, -h / 2 + w / 2, w / 2, 0, Math.PI, true);
  U.lineTo(-w / 2, h / 2);
  const L = new THREE.Shape();
  const lx = w / 2 + 0.16;
  L.moveTo(lx, h / 2);
  L.lineTo(lx + t, h / 2);
  L.lineTo(lx + t, -h / 2 + t);
  L.lineTo(lx + 0.5, -h / 2 + t);
  L.lineTo(lx + 0.5, -h / 2);
  L.lineTo(lx, -h / 2);
  L.lineTo(lx, h / 2);
  const g = new THREE.ExtrudeGeometry([U, L], { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 10 });
  g.center();
  return g;
}

// Fold every group's static child meshes into one mesh per material, so a
// robot costs one draw call per material per moving joint instead of one per
// part. Groups (the joints) are kept and recursed into.
export function bake(root) {
  const merged = [];
  root.traverse((node) => {
    if (node.isMesh) return;
    const bins = new Map();
    for (const c of node.children) {
      if (!c.isMesh || c.children.length || c.isPoints) continue;
      const key = c.material.uuid + (c.castShadow ? "s" : "n");
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(c);
    }
    for (const list of bins.values()) {
      if (list.length < 2) continue;
      const pos = [], nor = [], uvs = [], keepUv = !!list[0].material.userData.keepUv; // textured (Garage plate): keep UVs
      for (const m of list) {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        pos.push(...g.attributes.position.array);
        nor.push(...g.attributes.normal.array);
        if (keepUv) uvs.push(...g.attributes.uv.array);
        g.dispose();
        node.remove(m);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      if (keepUv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeBoundingSphere();
      const out = new THREE.Mesh(geo, list[0].material);
      out.castShadow = list[0].castShadow;
      node.add(out);
      merged.push(geo);
    }
  });
  return merged;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

export function group(x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

export const lerp = (a, b, k) => a + (b - a) * k;
export const damp = (obj, key, target, k) => { obj[key] += (target - obj[key]) * k; };
