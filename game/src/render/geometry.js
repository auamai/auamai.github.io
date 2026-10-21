// Shared geometry for the line (unit box and cylinder, edges, the gear).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const BOX_EDGES = new THREE.EdgesGeometry(BOX);
export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
export const CYL_EDGES = new THREE.EdgesGeometry(CYL, 30);

export function gearGeometry() {
  const s = new THREE.Shape();
  const teeth = 8, rO = 0.42, rI = 0.33, n = teeth * 2;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, r = i % 2 ? rI : rO;
    if (i === 0) s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    else s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.13, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 6 });
  g.center();
  return g;
}

// Bake a list of { geo, mx } (geometry + Matrix4) into one indexed BufferGeometry. Positions always,
// normals when every part has them (meshes; line outlines have none). Build-time only, never per frame.
export function mergeParts(parts) {
  let nv = 0, ni = 0;
  const withN = parts.every((p) => p.geo.attributes.normal);
  for (const { geo } of parts) { const n = geo.attributes.position.count; nv += n; ni += geo.index ? geo.index.count : n; }
  const pos = new Float32Array(nv * 3), nor = withN ? new Float32Array(nv * 3) : null, idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let ov = 0, oi = 0;
  for (const { geo, mx } of parts) {
    const P = geo.attributes.position, N = geo.attributes.normal, n = P.count;
    if (nor) nm.getNormalMatrix(mx);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(mx); v.toArray(pos, (ov + i) * 3);
      if (nor) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); v.toArray(nor, (ov + i) * 3); }
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[oi++] = geo.index.getX(i) + ov;
    else for (let i = 0; i < n; i++) idx[oi++] = ov + i;
    ov += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (nor) out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
