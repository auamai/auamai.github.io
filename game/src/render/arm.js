// Robot arm gantry, rebuilt as a rigid machined assembly (r6b): round brushed-steel tubes with chamfered
// ends, solid graphite joint housings with bolted flanges, safety-yellow painted links with clearcoat.
// Nothing bends: the only motion is rigid rotation at the two joints (pivot, elbow), driven by the game.
// Look parameters live in ARM_LOOK so the lighting pass can tune them in one place.
// Geometry and materials are shared by every arm (pooled by the game), so an extra arm costs draw calls only.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

export const ARM_LOOK = {
  steel: { color: 0xb9bec7, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.25 },
  // Brand yellow; grade.js punch() lifts its chroma before AgX so the lit paint stays safety yellow, not tan.
  paint: { color: 0xffc93c, emissive: 0xe0ab1f, emissiveIntensity: 0.12, metalness: 0.0, roughness: 0.36, clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.0 },
  joint: { color: 0x2a2e36, metalness: 0.65, roughness: 0.38, envMapIntensity: 0.9 },
  bolt: { color: 0x8a8f99, metalness: 0.95, roughness: 0.25, envMapIntensity: 1.2 },
  cap: { color: 0x3ddcff, emissive: 0x1fa9cc, emissiveIntensity: 0.9 },
};

// Brushed-metal streaks: a tiny tiling roughness map (fine lines along the tube), mipmapped and anisotropic,
// so the specular highlight breaks into a long, slightly streaky glare instead of a plastic dot.
function brushedMap(renderer) {
  const W = 8, H = 128, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d"), img = x.createImageData(W, H);
  let s = 1234567;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let v = 0; v < H; v++) {
    const line = 150 + rnd() * 70; // per-row value: streaks run around/along the tube
    for (let u = 0; u < W; u++) { const i = (v * W + u) * 4, n = line + (rnd() - 0.5) * 10; img.data[i] = img.data[i + 1] = img.data[i + 2] = n; img.data[i + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Tube with chamfered ends (unit: radius 0.5, length 1, axis Y), by lathe.
function tubeGeometry(seg) {
  const c = 0.06, pts = [[0, -0.5], [0.5 - c, -0.5], [0.5, -0.5 + c], [0.5, 0.5 - c], [0.5 - c, 0.5], [0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

export function makeArmKit(renderer, env, lite = false) {
  const seg = lite ? 14 : 24;
  const G = {
    tube: tubeGeometry(seg),
    housing: new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1).rotateX(Math.PI / 2), // axis Z (the joint axis)
    flange: new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1).rotateX(Math.PI / 2),
    disc: new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1),                          // axis Y (base plates)
    bolt: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),                            // hex heads
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  G.boltZ = G.bolt.clone().rotateX(Math.PI / 2);
  const brushed = brushedMap(renderer);
  const Std = lite ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const L = ARM_LOOK;
  const M = {
    steel: new THREE.MeshStandardMaterial({ ...L.steel, roughnessMap: brushed, envMap: env }),
    paint: lite ? new THREE.MeshStandardMaterial({ color: L.paint.color, emissive: L.paint.emissive, emissiveIntensity: L.paint.emissiveIntensity, metalness: 0, roughness: 0.3, envMap: env, envMapIntensity: 0.9 })
      : new Std({ ...L.paint, envMap: env }),
    joint: new THREE.MeshStandardMaterial({ ...L.joint, envMap: env }),
    bolt: new THREE.MeshStandardMaterial({ ...L.bolt, envMap: env }),
    cap: new THREE.MeshStandardMaterial({ color: L.cap.color, emissive: L.cap.emissive, emissiveIntensity: L.cap.emissiveIntensity, roughness: 0.3, metalness: 0 }),
  };
  // The grade pass leaves these alone: they are already in the brand palette and physically based.
  for (const m of Object.values(M)) m.userData = { graded: true };
  M.cap.toneMapped = false;

  const part = (geo, mat, sx, sy, sz, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = false;
    return m;
  };
  // Tube between two points in the XY plane (d = diameter).
  const tube = (mat, d, x0, y0, x1, y1, z = 0) => {
    const len = Math.hypot(x1 - x0, y1 - y0), m = part(G.tube, mat, d, len, d, (x0 + x1) / 2, (y0 + y1) / 2, z);
    m.rotation.z = Math.atan2(-(x1 - x0), y1 - y0);
    return m;
  };
  // Joint housing with a flange and a ring of bolts on the face toward the runner.
  const joint = (parent, d, len, x, y, bolts = 6, flangeMat = M.paint) => {
    parent.add(part(G.housing, M.joint, d, d, len, x, y, 0));
    parent.add(part(G.flange, flangeMat, d * 1.32, d * 1.32, 0.04, x, y, len / 2 + 0.02, false));
    const r = d * 0.5;
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2 + Math.PI / bolts;
      parent.add(part(G.boltZ, M.bolt, 0.045, 0.045, 0.03, x + Math.cos(a) * r, y + Math.sin(a) * r, len / 2 + 0.055, false));
    }
  };

  // Merge every child mesh of a group into one mesh per material (transforms baked), so an arm costs
  // ~11 draw calls instead of ~45 (each bolt was its own mesh). Built once; every pooled arm shares the result.
  const merge = (grp) => {
    grp.updateMatrixWorld(true);
    const by = new Map();
    for (const m of grp.children) if (m.isMesh) { if (!by.has(m.material)) by.set(m.material, []); by.get(m.material).push(m); }
    const out = [];
    for (const [mat, list] of by) {
      let nv = 0, ni = 0;
      for (const m of list) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
      const v = new THREE.Vector3(), nm = new THREE.Matrix3();
      let ov = 0, oi = 0;
      for (const m of list) {
        m.updateMatrix(); nm.getNormalMatrix(m.matrix);
        const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count;
        for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); pos.set([v.x, v.y, v.z], (ov + i) * 3);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (ov + i) * 3);
          if (U) uv.set([U.getX(i), U.getY(i)], (ov + i) * 2);
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.getX(i) + ov; else for (let i = 0; i < n; i++) idx[oi++] = ov + i;
        ov += n;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      out.push({ geo, mat, shadow: list.some((m) => m.castShadow) && mat !== M.bolt && mat !== M.cap });
    }
    return out;
  };
  const instance = (parts, grp) => { for (const p of parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = p.shadow; m.receiveShadow = false; grp.add(m); } };
  let T = null; // merged template: { base, pivot, elbow } part lists

  const kit = {
    M, G,
    // Fills `g` with the gantry and returns the joints the game rotates. Same footprint as before:
    // columns at x = +-1.05 (3.1 high), top beam at y = 3.05, pivot at y = 2.92, elbow 0.84 below it.
    buildRaw(g) {
      for (const s of [-1, 1]) {
        g.add(tube(M.steel, 0.2, 1.05 * s, 0.05, 1.05 * s, 3.05));                    // column
        g.add(part(G.disc, M.joint, 0.46, 0.05, 0.46, 1.05 * s, 0.025, 0));           // base plate
        for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(part(G.bolt, M.bolt, 0.05, 0.03, 0.05, 1.05 * s + bx * 0.15, 0.065, bz * 0.15, false));
        joint(g, 0.3, 0.34, 1.05 * s, 3.05, 4, M.joint);                               // corner block
      }
      g.add(tube(M.steel, 0.22, -0.92, 3.05, 0.92, 3.05));                             // top beam (axis X)
      const pivot = new THREE.Group();
      pivot.position.set(0, 2.92, 0);
      joint(pivot, 0.36, 0.4, 0, 0, 6);
      pivot.add(tube(M.paint, 0.2, 0, -0.12, 0, -0.74));                               // upper link
      const elbow = new THREE.Group();
      elbow.position.y = -0.84;
      joint(elbow, 0.28, 0.32, 0, 0, 6);
      const cap = part(G.disc, M.cap, 0.1, 0.02, 0.1, 0, 0, 0.2, false);               // status light
      cap.rotation.x = Math.PI / 2; elbow.add(cap);
      elbow.add(tube(M.paint, 0.17, 0, -0.1, 0, -0.56));                               // lower link
      elbow.add(part(G.box, M.joint, 0.52, 0.1, 0.26, 0, -0.62, 0));                   // tool plate (machined block)
      for (const s of [-1, 1]) elbow.add(tube(M.steel, 0.07, 0.22 * s, -0.66, 0.22 * s, -0.88)); // gripper fingers
      pivot.add(elbow);
      g.add(pivot);
      return { pivot, elbow };
    },
    build(g) {
      if (!T) {
        const raw = new THREE.Group(), j = kit.buildRaw(raw);
        const pv = new THREE.Group(), el = new THREE.Group();
        for (const c of [...j.elbow.children]) el.add(c);
        j.pivot.remove(j.elbow);
        for (const c of [...j.pivot.children]) pv.add(c);
        raw.remove(j.pivot);
        T = { base: merge(raw), pivot: merge(pv), elbow: merge(el), pPos: j.pivot.position.clone(), ePos: j.elbow.position.clone() };
      }
      instance(T.base, g);
      const pivot = new THREE.Group(); pivot.position.copy(T.pPos); instance(T.pivot, pivot);
      const elbow = new THREE.Group(); elbow.position.copy(T.ePos); instance(T.elbow, elbow);
      pivot.add(elbow); g.add(pivot);
      return { pivot, elbow };
    },
    dispose() {
      for (const x of Object.values(G)) x.dispose(); for (const m of Object.values(M)) m.dispose(); brushed.dispose();
      if (T) for (const p of [...T.base, ...T.pivot, ...T.elbow]) p.geo.dispose();
    },
  };
  return kit;
}
