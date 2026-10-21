// The shop floor around the line. Side zones are built once per type into a
// single vertex-coloured mesh (plus one glow mesh and a soft outline), then
// pooled and recycled along the run, so the whole hall costs a few dozen
// draw calls. Nothing here ever enters the three lanes (|x| < 5.2).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { BEND } from "./src/world/track.js?v=20261021r10";

export const HALF = 16;      // hall half-width (wall plane)
export const ROOF = 9;       // ceiling height
const SEG = 24;              // one zone per 24 units, per side
const NSLOT = 8;             // 8 x 24 = 192 units of hall per side
const IN = 5.6;              // zones start here (the line's rails end at ~5.1)
const FOGX = [IN, HALF + 30], FOGY = [0, ROOF]; // a zone's near face, for the fog test

export const C = {
  white: 0xeef1f7, white2: 0xe2e6ef, steel: 0xc6ccda, steel2: 0xa9b0c3, steel3: 0x8a92aa,
  navy: 0x2f3658, navy2: 0x454e74, ink: 0x1d233f,
  peri: 0xa9bcff, periDeep: 0x6f84e0, rack: 0x5b6fd0,
  floorZone: 0xe3e7f0, mark: 0xc3cbe4, wall: 0xf0f2f8, wainscot: 0xd3d8e4,
  pallet: 0xbcc2d1, carton: 0xd8dce6, carton2: 0xc8cedb, bin: 0x7086e2, bin2: 0x3e4b8e,
  asphalt: 0xd2d6df, lotLine: 0xfbfcff, curb: 0xe6e9f0, tree: 0xaebdca, tree2: 0x9aabbb,
  duct: 0xd9dde7, ductBand: 0xbec4d3, glassDark: 0x2a3150,
  car: [0x2f3658, 0xd7dbe4, 0xf3f5fa, 0x5c6a96, 0x93a6ea, 0x8d94a8],
};

/* ---------- a tiny geometry merger with vertex colours ---------- */
export const BOXG = new THREE.BoxGeometry(1, 1, 1);
export const CYLG = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
export const SPHG = new THREE.SphereGeometry(0.5, 16, 10);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

export class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const nm = new THREE.Matrix3().getNormalMatrix(tmpM);
    const p = g.attributes.position, n = g.attributes.normal;
    tmpC.setHex(color);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(tmpM); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      this.col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    if (g !== geo) g.dispose();
    return this;
  }
  box(c, sx, sy, sz, x, y, z, ry = 0) { return this.add(BOXG, c, x, y, z, sx, sy, sz, 0, ry, 0); }
  // Cylinder along an axis: "y" (default), "x" or "z".
  cyl(c, r, h, x, y, z, axis = "y") {
    const rx = axis === "z" ? Math.PI / 2 : 0, rz = axis === "x" ? Math.PI / 2 : 0;
    return this.add(CYLG, c, x, y, z, r * 2, h, r * 2, rx, 0, rz);
  }
  ball(c, sx, sy, sz, x, y, z) { return this.add(SPHG, c, x, y, z, sx, sy, sz); }
  get empty() { return this.pos.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/* ---------- shared pieces ---------- */
// Wall, column, ceiling beam, duct run and floor marks: in every zone.
function common(b, gl, { wall = true } = {}) {
  if (wall) {
    b.box(C.wall, 0.3, ROOF, SEG, HALF + 0.15, ROOF / 2, 0);
    b.box(C.wainscot, 0.12, 1.3, SEG, HALF - 0.04, 0.65, 0);
  }
  b.box(C.white2, 0.8, ROOF, 0.8, HALF - 0.35, ROOF / 2, -SEG / 2);         // wall column
  b.box(C.white, 0.42, ROOF, 0.42, IN + 0.25, ROOF / 2, -SEG / 2);           // inner column
  gl.box(C.peri, 0.05, 3.4, 0.05, IN + 0.02, 3.2, -SEG / 2);                 // its light strip
  b.box(C.steel, HALF - IN + 0.5, 0.38, 0.4, (HALF + IN) / 2, ROOF - 0.35, -SEG / 2); // roof beam
  b.box(C.steel, IN + 0.25, 0.38, 0.4, (IN + 0.25) / 2, ROOF - 0.35, -SEG / 2); // over the line (mirrored for the other half)
  // Duct run with bands, hangers and two diffusers.
  b.cyl(C.duct, 0.48, SEG, 10.6, 7.55, 0, "z");
  for (let z = -9; z <= 9; z += 6) { b.cyl(C.ductBand, 0.51, 0.14, 10.6, 7.55, z, "z"); b.box(C.steel2, 0.05, ROOF - 8.03, 0.05, 10.6, (ROOF + 8.03) / 2, z); }
  for (const z of [-5, 7]) { b.box(C.ductBand, 0.7, 0.25, 0.7, 10.6, 7.0, z); b.box(C.steel3, 0.5, 0.04, 0.5, 10.6, 6.86, z); }
  // Walkway lines on the floor beside the line, and the zone's own floor tint.
  b.box(C.floorZone, HALF - IN - 0.6, 0.01, SEG - 0.6, (HALF + IN) / 2 + 0.2, 0.004, 0);
  b.box(C.mark, 0.09, 0.012, SEG, IN - 0.25, 0.008, 0);
  b.box(C.mark, 0.09, 0.012, SEG, IN + 1.1, 0.008, 0);
}

// Hanging "rooftop-style" air handler: a cabinet with two fans, ducted into the run.
// Its top stays under the roof trusses (bottom chord at 8.18).
function airHandler(b, gl, z) {
  const d = -0.4;
  b.box(C.white2, 3.6, 1.6, 2.6, 12.9, 7.75 + d, z);
  b.box(C.steel, 3.7, 0.12, 2.7, 12.9, 6.92 + d, z);
  for (const dz of [-0.62, 0.62]) {
    b.cyl(C.ink, 0.5, 0.06, 11.08, 7.75 + d, z + dz, "x");
    b.cyl(C.steel2, 0.52, 0.04, 11.06, 7.75 + d, z + dz, "x");
    b.box(C.steel3, 0.04, 0.9, 0.06, 11.03, 7.75 + d, z + dz);
    b.box(C.steel3, 0.04, 0.06, 0.9, 11.03, 7.75 + d, z + dz);
  }
  for (let i = 0; i < 5; i++) b.box(C.steel, 0.02, 0.05, 2.4, 11.09, 7.15 + d + i * 0.07, z); // louvres
  b.box(C.duct, 0.8, 0.7, 0.8, 11.0, 7.45, z + 1.6);
  const top = 8.55 + d;
  for (const dx of [-1.4, 1.4]) b.box(C.steel2, 0.05, ROOF - top, 0.05, 12.9 + dx, (ROOF + top) / 2, z);
  gl.box(C.peri, 0.03, 0.08, 0.5, 11.07, 8.35 + d, z - 0.9);                 // status pip
}

function cart(b, x, z, load = "parts", ry = 0) {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (dx, dz) => [x + dx * cs + dz * sn, z - dx * sn + dz * cs];
  const put = (fn, dx, dz, ...rest) => { const [px, pz] = at(dx, dz); fn(px, pz, ...rest); };
  put((px, pz) => b.box(C.navy2, 1.5, 0.08, 0.85, px, 0.62, pz, ry), 0, 0);
  put((px, pz) => b.box(C.steel, 1.4, 0.05, 0.75, px, 0.25, pz, ry), 0, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put((px, pz) => b.box(C.steel2, 0.05, 0.55, 0.05, px, 0.4, pz), 0.68 * sx, 0.36 * sz);
    put((px, pz) => b.cyl(C.ink, 0.07, 0.05, px, 0.08, pz, "x"), 0.68 * sx, 0.36 * sz);
  }
  put((px, pz) => b.box(C.steel3, 0.05, 0.5, 0.75, px, 0.9, pz, ry), 0.74, 0);
  if (load === "parts") {
    put((px, pz) => b.cyl(C.steel, 0.22, 0.18, px, 0.75, pz), -0.4, 0);
    put((px, pz) => b.cyl(C.periDeep, 0.13, 0.3, px, 0.8, pz), -0.4, 0);
    put((px, pz) => b.box(C.white, 0.5, 0.3, 0.45, px, 0.81, pz, ry), 0.25, -0.1);
    put((px, pz) => b.cyl(C.steel2, 0.06, 0.6, px, 0.72, pz, "x"), 0.1, 0.25);
  } else {
    put((px, pz) => b.box(C.carton, 0.6, 0.4, 0.5, px, 0.86, pz, ry), -0.3, 0);
    put((px, pz) => b.box(C.carton2, 0.5, 0.32, 0.45, px, 0.82, pz, ry), 0.35, 0.05);
    put((px, pz) => b.box(C.carton, 0.45, 0.3, 0.4, px, 1.21, pz, ry + 0.2), -0.25, 0.02);
  }
}

// A machine on its stand, part built: open frame, some panels, a spindle, cables.
function machineFrame(b, gl, x, z, stage) {
  const w = 2.8, d = 2.2, h = 2.3, y0 = 0.45;
  b.box(C.navy, w + 0.4, 0.35, d + 0.4, x, 0.175, z);                         // stand
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.steel3, 0.14, 0.12, 0.14, x + (w / 2 + 0.1) * sx, 0.06, z + (d / 2 + 0.1) * sz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.steel2, 0.12, h, 0.12, x + (w / 2) * sx, y0 + h / 2, z + (d / 2) * sz);
  for (const yy of [y0 + 0.06, y0 + h]) {
    for (const sz of [-1, 1]) b.box(C.steel2, w, 0.1, 0.1, x, yy, z + (d / 2) * sz);
    for (const sx of [-1, 1]) b.box(C.steel2, 0.1, 0.1, d, x + (w / 2) * sx, yy, z);
  }
  b.box(C.white2, w - 0.1, 0.06, d - 0.1, x, y0 + 0.12, z);                    // bed plate
  b.box(C.white, 0.9, 0.7, 0.8, x - 0.6, y0 + 0.5, z - 0.3);                  // drive block
  b.cyl(C.steel, 0.28, 0.5, x - 0.6, y0 + 1.1, z - 0.3);                      // motor
  b.cyl(C.navy2, 0.12, 1.2, x + 0.6, y0 + 0.75, z + 0.2);                     // spindle column
  b.box(C.steel, 0.5, 0.25, 0.5, x + 0.6, y0 + 1.45, z + 0.2);
  if (stage > 0) {
    b.box(C.white, 0.05, h - 0.2, d - 0.15, x + w / 2 + 0.03, y0 + h / 2, z); // one side panel on
    gl.box(C.peri, 0.02, 0.06, 0.8, x + w / 2 + 0.06, y0 + h - 0.35, z);     // its light bar
    b.box(C.ink, 0.04, 0.45, 0.6, x + w / 2 + 0.06, y0 + 1.2, z - 0.55);     // HMI screen frame
    gl.box(C.periDeep, 0.02, 0.36, 0.5, x + w / 2 + 0.09, y0 + 1.2, z - 0.55);
  }
  if (stage > 1) b.box(C.white, w - 0.15, 0.05, d - 0.15, x, y0 + h + 0.06, z); // roof panel
  for (let i = 0; i < 3; i++) b.cyl(i ? C.navy : C.periDeep, 0.03, 1.2, x - 0.2 + i * 0.08, y0 + 1.0, z + d / 2 - 0.1, "x"); // cable loom
}

/* ---------- zone templates (right side; the left side is a mirror) ---------- */
const ZONES = {
  assembly(b, gl) {
    common(b, gl);
    airHandler(b, gl, 4);
    machineFrame(b, gl, 9.3, -6.5, 1);
    machineFrame(b, gl, 9.6, 5.5, 2);
    // A gantry hoist over the build bay.
    for (const z of [-10, 9]) for (const x of [7.4, 14.6]) b.box(C.periDeep, 0.25, 6, 0.25, x, 3, z);
    for (const x of [7.4, 14.6]) b.box(C.periDeep, 0.3, 0.4, 19.3, x, 6.2, -0.5);
    b.box(C.rack, 7.4, 0.35, 0.3, 11, 6.0, -1.5);
    b.box(C.ink, 0.5, 0.4, 0.4, 10, 5.7, -1.5);
    b.box(C.steel3, 0.03, 2.2, 0.03, 10, 4.5, -1.5);
    b.box(C.navy2, 0.25, 0.25, 0.1, 10, 3.35, -1.5);
    cart(b, 7.6, 0.2, "parts", 0.15);
    cart(b, 13.2, -0.8, "boxes", -0.3);
    // Work bench with a tool board on the wall.
    b.box(C.white2, 1.0, 0.08, 4, 15.1, 0.95, -0.5);
    for (const z of [-2.3, 1.3]) b.box(C.steel2, 0.9, 0.9, 0.08, 15.1, 0.47, z);
    b.box(C.white, 0.06, 1.6, 4, HALF - 0.05, 2.1, -0.5);
    for (let i = 0; i < 7; i++) b.box(i % 2 ? C.navy2 : C.steel3, 0.05, 0.3 + (i % 3) * 0.15, 0.08, HALF - 0.1, 2.2, -2.2 + i * 0.55);
  },
  inventory(b, gl) {
    common(b, gl);
    airHandler(b, gl, -6);
    // Pallet racking along the wall: blue uprights, white beams, three levels.
    const rx = 14.1, depth = 1.4, bayW = 2.7, levels = [0, 1.9, 3.8, 5.6];
    for (let i = 0; i <= 8; i++) {
      const z = -10.8 + i * bayW;
      for (const dx of [-depth / 2, depth / 2]) b.box(C.rack, 0.1, 6.0, 0.1, rx + dx, 3.0, z);
      for (let k = 0; k < 6; k++) b.box(C.rack, 0.04, 0.04, depth, rx, 0.5 + k, z);
      if (i < 8) for (const ly of levels.slice(1)) for (const dx of [-depth / 2, depth / 2]) b.box(C.white, 0.08, 0.14, bayW, rx + dx, ly, z + bayW / 2);
      if (i < 8) for (let L = 0; L < 4; L++) {
        const ly = levels[L] + (L ? 0.07 : 0);
        b.box(C.pallet, 1.1, 0.14, 1.1, rx, ly + 0.07, z + bayW / 2 - 0.6);
        b.box(C.pallet, 1.1, 0.14, 1.1, rx, ly + 0.07, z + bayW / 2 + 0.6);
        const fill = (i * 3 + L * 5) % 7;
        if (fill !== 3) b.box(fill % 2 ? C.carton : C.carton2, 1.0, 0.9 + (fill % 3) * 0.2, 1.0, rx, ly + 0.14 + (0.9 + (fill % 3) * 0.2) / 2, z + bayW / 2 - 0.6);
        if (fill !== 5) b.box(fill % 2 ? C.carton2 : C.white2, 1.0, 0.8, 1.0, rx, ly + 0.54, z + bayW / 2 + 0.6);
      }
    }
    // Bin shelving nearer the aisle: open shelves of small blue and navy bins.
    for (const z0 of [-8, 2]) {
      const len = 6;
      for (const z of [z0 - len / 2, z0 + len / 2]) for (const dx of [-0.35, 0.35]) b.box(C.steel3, 0.06, 2.0, 0.06, 8.6 + dx, 1.0, z);
      for (let s = 0; s < 4; s++) {
        const y = 0.2 + s * 0.55;
        b.box(C.steel, 0.8, 0.04, len, 8.6, y, z0);
        for (let j = 0; j < 10; j++) b.box((s + j) % 3 ? C.bin : C.bin2, 0.55, 0.3, 0.5, 8.45, y + 0.17, z0 - len / 2 + 0.3 + j * 0.6);
      }
      gl.box(C.peri, 0.02, 0.05, len, 8.17, 2.0, z0);
    }
    // A pallet jack waiting in the aisle.
    b.box(C.navy, 0.6, 0.12, 1.4, 11.3, 0.1, 9.5);
    b.box(C.navy2, 0.5, 0.6, 0.3, 11.3, 0.45, 10.3);
    b.box(C.steel3, 0.05, 0.9, 0.05, 11.3, 1.1, 10.4);
  },
  test(b, gl) {
    common(b, gl);
    airHandler(b, gl, 7);
    // Test cell: a cage of posts and bars around a robot arm on a pedestal.
    const cx = 10.6, cz = -2, w = 5.2, d = 6.4, h = 2.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.navy, 0.14, h + 0.2, 0.14, cx + (w / 2) * sx, (h + 0.2) / 2, cz + (d / 2) * sz);
    for (const yy of [0.25, h]) {
      for (const sz of [-1, 1]) b.box(C.navy2, w, 0.07, 0.07, cx, yy, cz + (d / 2) * sz);
      for (const sx of [-1, 1]) b.box(C.navy2, 0.07, 0.07, d, cx + (w / 2) * sx, yy, cz);
    }
    for (let i = 1; i < 26; i++) b.box(C.steel3, 0.025, h - 0.25, 0.025, cx - w / 2, (h + 0.25) / 2, cz - d / 2 + i * (d / 26)); // mesh face to the aisle
    for (let i = 1; i < 6; i++) b.box(C.steel3, 0.025, 0.025, d, cx - w / 2, 0.25 + i * ((h - 0.25) / 6), cz);
    for (let i = 1; i < 20; i++) for (const sz of [-1, 1]) b.box(C.steel3, 0.025, h - 0.25, 0.025, cx - w / 2 + i * (w / 20), (h + 0.25) / 2, cz + (d / 2) * sz);
    b.box(C.white2, w - 0.2, 0.05, d - 0.2, cx, 0.03, cz);                    // cell floor plate
    b.cyl(C.white, 0.5, 0.7, cx + 0.4, 0.35, cz);                             // pedestal
    b.box(C.white, 0.9, 0.5, 0.9, cx + 1.6, 0.25, cz + 1.8);                  // test fixture
    gl.box(C.peri, 0.92, 0.04, 0.04, cx + 1.6, 0.52, cz + 1.35);
    // Stack light on the corner post, and a control console outside the cage.
    b.cyl(C.ink, 0.1, 0.5, cx - w / 2, h + 0.45, cz - d / 2);
    b.box(C.white2, 1.1, 1.0, 0.7, cx - w / 2 - 0.9, 0.5, cz + d / 2 + 0.9);
    b.box(C.ink, 0.06, 0.5, 0.65, cx - w / 2 - 1.45, 1.35, cz + d / 2 + 0.9);
    gl.box(C.periDeep, 0.02, 0.4, 0.55, cx - w / 2 - 1.49, 1.35, cz + d / 2 + 0.9);
    cart(b, 8.2, 8.5, "boxes", 0.4);
  },
  weld(b, gl) {
    common(b, gl);
    for (const [z, flip] of [[-6, 0], [5.5, 1]]) {
      const x = 11;
      // Booth: dark back curtains for contrast, a translucent screen toward the aisle.
      b.box(C.navy2, 0.08, 2.4, 4.4, 14.2, 1.3, z);
      for (const sz of [-1, 1]) b.box(C.navy2, 3.4, 2.4, 0.08, 12.5, 1.3, z + 2.2 * sz);
      for (const sz of [-1, 1]) b.box(C.steel3, 0.08, 2.6, 0.08, 8.7, 1.3, z + 2.2 * sz);
      b.box(C.steel3, 0.08, 0.08, 4.4, 8.7, 2.6, z);
      // Table, fixture and part.
      b.box(C.steel2, 2.2, 0.12, 1.6, x, 0.9, z);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.steel3, 0.1, 0.85, 0.1, x + 1.0 * sx, 0.43, z + 0.7 * sz);
      b.box(C.white2, 1.2, 0.3, 0.2, x, 1.11, z - 0.2);
      b.box(C.white2, 0.2, 0.5, 0.9, x + 0.35, 1.21, z + 0.1);
      // Welding arm on a riser, torch pointing at the joint.
      b.box(C.navy, 0.7, 0.9, 0.7, x + 1.8, 0.45, z + (flip ? 0.9 : -0.9));
      b.cyl(C.white, 0.22, 0.3, x + 1.8, 1.05, z + (flip ? 0.9 : -0.9));
      b.add(CYLG, C.white, x + 1.4, 1.55, z + (flip ? 0.6 : -0.6), 0.2, 1.1, 0.2, (flip ? -1 : 1) * 0.5, 0, 0.7);
      b.add(CYLG, C.white2, x + 0.75, 1.62, z + (flip ? 0.1 : -0.1), 0.14, 0.9, 0.14, 0, 0, -1.3);
      b.cyl(C.ink, 0.05, 0.3, x + 0.35, 1.43, z);
      // Fume hood on an arm.
      b.cyl(C.steel, 0.3, 0.25, x - 0.2, 2.2, z);
      b.box(C.steel3, 0.08, 0.08, 1.8, x - 0.2, 2.4, z + 0.9);
      b.box(C.steel3, 0.08, 2.4, 0.08, x - 0.2, 1.2, z + 1.8);
      // Gas bottles.
      for (const dz of [-0.3, 0.3]) { b.cyl(C.navy, 0.16, 1.3, 14.0, 0.65, z + 1.6 + dz); b.ball(C.navy2, 0.3, 0.2, 0.3, 14.0, 1.32, z + 1.6 + dz); }
    }
  },
  laser(b, gl) {
    common(b, gl);
    airHandler(b, gl, 8);
    // Laser cutting cell: long bed, side rails for the gantry, low glazed enclosure.
    const cx = 11, z0 = -3, L = 11, W = 4;
    b.box(C.navy, W + 0.6, 0.9, L, cx, 0.45, z0);
    b.box(C.ink, W - 0.4, 0.04, L - 0.6, cx, 0.92, z0);                       // slat bed
    for (let i = 0; i < 16; i++) b.box(C.steel3, W - 0.4, 0.06, 0.04, cx, 0.95, z0 - L / 2 + 0.5 + i * 0.66);
    for (const sx of [-1, 1]) b.box(C.white, 0.3, 0.35, L, cx + (W / 2 + 0.05) * sx, 1.08, z0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.white2, 0.12, 1.4, 0.12, cx + (W / 2 + 0.25) * sx, 1.6, z0 + (L / 2) * sz);
    for (const sz of [-1, 1]) b.box(C.white2, W + 0.5, 0.1, 0.12, cx, 2.3, z0 + (L / 2) * sz);
    for (const sx of [-1, 1]) b.box(C.white2, 0.12, 0.1, L, cx + (W / 2 + 0.25) * sx, 2.3, z0);
    // Control cabinet and a stack of cut sheet.
    b.box(C.white, 1.2, 2.0, 0.9, cx, 1.0, z0 + L / 2 + 1.0);
    b.box(C.ink, 0.06, 0.45, 0.6, cx - 0.62, 1.45, z0 + L / 2 + 1.0);
    gl.box(C.periDeep, 0.02, 0.36, 0.5, cx - 0.66, 1.45, z0 + L / 2 + 1.0);
    for (let i = 0; i < 6; i++) b.box(i % 2 ? C.steel : C.steel2, 1.6, 0.04, 1.1, 8.0, 0.1 + i * 0.045, z0 + L / 2 + 2.2);
    b.box(C.pallet, 1.7, 0.12, 1.2, 8.0, 0.06, z0 + L / 2 + 2.2);
  },
  window(b, gl) {
    common(b, gl, { wall: false });
    // Wall with three tall windows onto the lot.
    const x = HALF + 0.15;
    b.box(C.wall, 0.3, 1.2, SEG, x, 0.6, 0);
    b.box(C.wall, 0.3, ROOF - 5.4, SEG, x, (ROOF + 5.4) / 2, 0);
    for (const z of [-12, -4, 4, 12]) b.box(C.wall, 0.3, 4.2, z === -12 || z === 12 ? 1.2 : 1.0, x, 3.3, z);
    for (const z of [-8, 0, 8]) {
      b.box(C.steel, 0.1, 0.08, 7, x - 0.1, 1.24, z);                      // sill
      b.box(C.steel, 0.08, 4.2, 0.08, x - 0.05, 3.3, z);                   // mullion
      b.box(C.steel, 0.08, 0.08, 7, x - 0.05, 3.9, z);                     // transom
    }
    lot(b, gl, 1.4);
  },
  door(b, gl) {
    common(b, gl, { wall: false });
    const x = HALF + 0.15, hw = 3.4, dh = 5.4;
    b.box(C.wall, 0.3, ROOF, SEG / 2 - hw, x, ROOF / 2, -(SEG / 2 + hw) / 2);
    b.box(C.wall, 0.3, ROOF, SEG / 2 - hw, x, ROOF / 2, (SEG / 2 + hw) / 2);
    b.box(C.wall, 0.3, ROOF - dh, hw * 2, x, (ROOF + dh) / 2, 0);
    b.box(C.wainscot, 0.12, 1.3, SEG / 2 - hw, HALF - 0.04, 0.65, -(SEG / 2 + hw) / 2);
    b.box(C.wainscot, 0.12, 1.3, SEG / 2 - hw, HALF - 0.04, 0.65, (SEG / 2 + hw) / 2);
    // Roll-up door, two thirds open: drum housing, slats, guides, a light bar.
    b.box(C.steel, 0.9, 0.9, hw * 2 + 0.6, x - 0.55, dh + 0.5, 0);
    for (let i = 0; i < 9; i++) b.box(i % 2 ? C.white2 : C.white, 0.08, 0.16, hw * 2, x - 0.25, dh - 0.08 - i * 0.16, 0);
    for (const s of [-1, 1]) b.box(C.navy2, 0.2, dh, 0.2, x - 0.25, dh / 2, hw * s);
    gl.box(C.peri, 0.04, 0.06, hw * 2, x - 0.3, dh - 1.53, 0);
    for (const s of [-1, 1]) b.cyl(C.navy, 0.13, 1.1, HALF - 1.0, 0.55, (hw - 0.4) * s);    // bollards
    for (const s of [-1, 1]) b.box(C.mark, 4, 0.012, 0.12, HALF - 2.2, 0.009, (hw - 0.1) * s); // floor guide lines
    lot(b, gl, 0.9, true);
  },
};

// The parking lot outside the wall: asphalt, lines, curb, light poles, trees, cars.
function lot(b, gl, carRate, truck = false) {
  b.box(C.asphalt, 30, 0.02, SEG, HALF + 15, -0.02, 0);
  b.box(C.curb, 1.2, 0.18, SEG, HALF + 0.9, 0.08, 0);
  for (let i = 0; i <= 8; i++) b.box(C.lotLine, 5.2, 0.01, 0.12, HALF + 5.2, 0.005, -12 + i * 3);
  b.box(C.lotLine, 0.12, 0.01, SEG, HALF + 7.8, 0.005, 0);
  for (let i = 0; i <= 8; i++) b.box(C.lotLine, 5.2, 0.01, 0.12, HALF + 13.4, 0.005, -12 + i * 3);
  for (const z of [-6, 6]) { b.cyl(C.steel2, 0.08, 6, HALF + 10.6, 3, z); b.box(C.steel, 1.2, 0.15, 0.4, HALF + 10.2, 6, z); gl.box(C.white, 1.0, 0.03, 0.3, HALF + 10.2, 5.92, z); }
  // Rounded hedge line, then a low neighbouring building across the road.
  for (let i = 0; i < 8; i++) b.ball(i % 2 ? C.tree : C.tree2, 3.4, 1.3, 3.2, HALF + 17.5, 0.55, -10.5 + i * 3);
  b.box(C.white2, 6, 3.6, SEG, HALF + 27, 1.8, 0);
  b.box(C.steel, 6.2, 0.2, SEG, HALF + 27, 3.7, 0);
  for (let i = 0; i < 6; i++) b.box(C.glassDark, 0.04, 1.0, 2.6, HALF + 23.98, 2.1, -10 + i * 4);
  let k = 0;
  for (const row of [HALF + 4.4, HALF + 11.4]) for (let i = 0; i < 8; i++) {
    const z = -10.5 + i * 3, seed = (i * 7 + (row > 25 ? 3 : 0)) % 10;
    if (truck && row < 25 && (i === 3 || i === 4)) continue;
    if (seed / 10 >= carRate * 0.62) continue;
    car(b, row, z, C.car[(k++ + i) % C.car.length]);
  }
  if (truck) {
    // A box truck nosed toward the open door.
    b.box(C.white, 6, 2.8, 2.3, HALF + 5.5, 1.85, 0);
    b.box(C.navy, 0.04, 0.3, 2.31, HALF + 2.52, 2.6, 0);
    b.box(C.ink, 6.1, 0.3, 2.0, HALF + 5.5, 0.3, 0);
    for (const dx of [-2, 1.6, 2.4]) for (const s of [-1, 1]) b.cyl(C.ink, 0.45, 0.32, HALF + 5.5 + dx, 0.45, 1.0 * s, "z");
  }
}

function car(b, x, z, color) {
  // Nose toward the hall: a soft extruded body, a glass cabin, four wheels.
  b.add(CAR_BODY, color, x, 0, z);
  b.add(CAR_CAB, C.glassDark, x, 0, z);
  b.add(CAR_ROOF, color, x, 0, z);
  for (const dx of [-1.35, 1.3]) for (const s of [-1, 1]) b.cyl(C.ink, 0.34, 0.26, x + dx, 0.34, z + 0.8 * s, "z");
}
// Side profiles (x = length, y = height), extruded across the car with a round bevel.
function carPart(points, width, bevel) {
  const sh = new THREE.Shape();
  points.forEach(([px, py], i) => (i ? sh.lineTo(px, py) : sh.moveTo(px, py)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}
const CAR_BODY = carPart([[-2.0, 0.32], [2.0, 0.32], [2.08, 0.62], [1.7, 0.86], [-1.9, 0.9], [-2.08, 0.6]], 1.78, 0.14);
const CAR_CAB = carPart([[-1.15, 0.95], [1.0, 0.95], [0.45, 1.42], [-0.95, 1.44]], 1.5, 0.08);
const CAR_ROOF = carPart([[-0.98, 1.4], [0.5, 1.4], [0.42, 1.5], [-0.92, 1.5]], 1.44, 0.04);

export const ZONE_TYPES = Object.keys(ZONES);
const WEIGHTS = { assembly: 3, inventory: 3, test: 2.2, weld: 2.2, laser: 2.2, window: 1.3, door: 0.8 };

// A soft round dot drawn on a tiny canvas, so sparks read as glints, not squares.
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/* ---------- the hall ---------- */
export class Factory {
  constructor(scene, { edgeMaterial } = {}) {
    this.scene = scene;
    this.M = {
      solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      glass: new THREE.MeshBasicMaterial({ color: 0xdfe6fb, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      screen: new THREE.MeshBasicMaterial({ color: 0x3c4a8c, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      edge: edgeMaterial || new THREE.LineBasicMaterial({ color: 0x262d4d, transparent: true, opacity: 0.2 }),
      spark: new THREE.PointsMaterial({ color: 0xe9eeff, size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, map: dotTexture() }),
      arc: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      arcHalo: new THREE.MeshBasicMaterial({ color: 0x9beaff, transparent: true, opacity: 0.55, depthWrite: false }),
      beam: new THREE.MeshBasicMaterial({ color: 0x8fa5ff }),
      lightOn: new THREE.MeshBasicMaterial({ color: 0x9fb3ff }),
      lightOff: new THREE.MeshLambertMaterial({ color: 0x3a4262 }),
      lightWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };
    this.geos = [];
    this.templates = {};
    this.pools = {};
    this.quality = 0;
    this.buildShell();
    this.buildBatches();
    this.slots = [];
    this.last = [null, null];
    for (const side of [1, -1]) for (let i = 0; i < NSLOT; i++) {
      const slot = { side, z: 12 - i * SEG, type: null, inst: null, ri: i, lineAt: null };
      this.slots.push(slot);
      this.assign(slot);
    }
  }

  // Static: big floor and ceiling, ceiling light rows over the line.
  buildShell() {
    const { scene } = this;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 200), new THREE.MeshLambertMaterial({ color: 0xe9ecf4 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -80; floor.receiveShadow = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 200), new THREE.MeshLambertMaterial({ color: 0xe8ebf3, emissive: 0xe8ebf3, emissiveIntensity: 0.42 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOF, -80);
    scene.add(floor, ceil);
    this.shell = [floor, ceil];
  }

  template(type) {
    if (this.templates[type]) return this.templates[type];
    const b = new Builder(), gl = new Builder();
    ZONES[type](b, gl);
    const solid = b.geometry();
    const t = { solid, glow: gl.empty ? null : gl.geometry(), edges: new THREE.EdgesGeometry(solid, 35) };
    this.geos.push(solid, t.edges);
    if (t.glow) this.geos.push(t.glow);
    // Extra per-type geometry shared by every instance.
    // Glass and screens are merged per zone too: one transparent draw each.
    const pane = (list) => { const g = new Builder(); for (const a of list) g.box(0xffffff, ...a); const geo = g.geometry(); this.geos.push(geo); return geo; };
    if (type === "window") {
      t.glass = pane([-8, 0, 8].map((z) => [0.02, 4.2, 7, HALF + 0.1, 3.3, z]));
    } else if (type === "weld") {
      t.screen = pane([-6, 5.5].map((z) => [0.02, 2.3, 2.3, 8.7, 1.3, z - 1.05])); // half screen: the near side stays open
    } else if (type === "laser") {
      t.glass = pane([[0.02, 1.3, 11, 11 - 2.25, 1.6, -3], [0.02, 1.3, 11, 11 + 2.25, 1.6, -3], [4.5, 1.3, 0.02, 11, 1.6, -3 - 5.5], [4.5, 1.3, 0.02, 11, 1.6, -3 + 5.5]]);
      const g = new Builder();
      for (const sx of [-1, 1]) g.box(C.white, 0.35, 0.9, 0.5, 2.25 * sx, 1.6, 0);
      g.box(C.white, 4.8, 0.32, 0.55, 0, 2.05, 0);
      g.box(C.periDeep, 4.82, 0.05, 0.57, 0, 1.88, 0);
      t.gantry = g.geometry();
      const h = new Builder();
      h.box(C.navy, 0.4, 0.5, 0.45, 0, 1.75, 0); h.cyl(C.steel, 0.07, 0.35, 0, 1.36, 0);
      t.head = h.geometry();
      t.beamGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 6);
      this.geos.push(t.gantry, t.head, t.beamGeo);
    } else if (type === "test") {
      t.lamp = new THREE.CylinderGeometry(0.11, 0.11, 0.17, 14);
      const a = new Builder();
      a.cyl(C.white, 0.32, 0.3, 0, 0.85, 0); a.add(CYLG, C.white, 0.45, 1.5, 0, 0.26, 1.3, 0.26, 0, 0, -0.6);
      a.ball(C.navy2, 0.34, 0.34, 0.34, 0.85, 2.05, 0); a.add(CYLG, C.white2, 1.35, 1.85, 0, 0.18, 1.1, 0.18, 0, 0, 2.0);
      a.ball(C.ink, 0.2, 0.2, 0.2, 1.8, 1.55, 0);
      t.arm = a.geometry();
      this.geos.push(t.lamp, t.arm);
    }
    this.templates[type] = t;
    return t;
  }

  instance(type) {
    const pool = this.pools[type] || (this.pools[type] = []);
    const got = pool.pop();
    if (got) { got.group.visible = true; return got; }
    const t = this.template(type), M = this.M;
    // The zone's static mesh, glow, glass and outline are drawn in batches (buildBatches); the group only
    // carries the moving parts (sparks, gantry, lamps, test arm).
    const group = new THREE.Group();
    const inst = { type, group, anim: null };
    if (type === "weld") {
      const sparks = [];
      for (const [z] of [[-6], [5.5]]) {
        const tip = new THREE.Vector3(11.35, 1.28, z);
        const n = 36;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(n * 3);
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, M.spark); pts.frustumCulled = false; group.add(pts);
        const arc = new THREE.Mesh(SPHG, M.arc); arc.position.copy(tip); arc.scale.setScalar(0.09); group.add(arc);
        const halo = new THREE.Mesh(SPHG, M.arcHalo); halo.position.copy(tip); halo.scale.setScalar(0.35); group.add(halo);
        const vel = new Float32Array(n * 3), life = new Float32Array(n);
        for (let i = 0; i < n; i++) life[i] = -Math.random();
        sparks.push({ geo, pos, vel, life, n, tip, arc, halo, pts, on: 1, onT: Math.random() });
        this.geos.push(geo);
      }
      inst.anim = (dt, tt) => {
        for (const s of sparks) {
          // Weld in bursts: a second or two on, a beat off.
          s.onT -= dt;
          if (s.onT <= 0) { s.on = s.on ? 0 : 1; s.onT = s.on ? 0.8 + Math.random() * 1.6 : 0.3 + Math.random() * 0.6; }
          const fl = s.on ? 0.7 + Math.random() * 0.6 : 0;
          s.arc.visible = s.halo.visible = s.on === 1;
          s.arc.scale.setScalar(0.07 + 0.05 * fl); s.halo.scale.setScalar(0.25 + 0.22 * fl);
          const lim = this.quality >= 2 ? (s.n / 2) | 0 : s.n;
          for (let i = 0; i < s.n; i++) {
            const j = i * 3;
            if (i >= lim) { s.pos[j + 1] = -50; continue; }
            s.life[i] -= dt;
            if (s.life[i] <= 0) {
              if (!s.on || s.life[i] > -0.02 && Math.random() < 0.5) { s.pos[j + 1] = -50; if (s.life[i] < -1) s.life[i] = 0; continue; }
              s.life[i] = 0.25 + Math.random() * 0.45;
              s.pos[j] = s.tip.x; s.pos[j + 1] = s.tip.y; s.pos[j + 2] = s.tip.z;
              const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
              s.vel[j] = Math.cos(a) * sp - 1.2; s.vel[j + 1] = 1 + Math.random() * 2.5; s.vel[j + 2] = Math.sin(a) * sp;
            } else {
              s.vel[j + 1] -= 9.8 * dt;
              s.pos[j] += s.vel[j] * dt; s.pos[j + 1] += s.vel[j + 1] * dt; s.pos[j + 2] += s.vel[j + 2] * dt;
              if (s.pos[j + 1] < 0.92 && s.pos[j] > 9.9 && s.pos[j] < 12.1) { s.pos[j + 1] = 0.92; s.vel[j + 1] *= -0.3; s.vel[j] *= 0.5; s.vel[j + 2] *= 0.5; }
              else if (s.pos[j + 1] < 0.02) { s.pos[j + 1] = 0.02; s.vel[j + 1] = 0; s.vel[j] *= 0.8; s.vel[j + 2] *= 0.8; }
            }
          }
          s.geo.attributes.position.needsUpdate = true;
        }
      };
    } else if (type === "laser") {
      const cx = 11, z0 = -3, L = 11;
      const gantry = new THREE.Group(); gantry.position.set(cx, 0, z0); group.add(gantry);
      gantry.add(new THREE.Mesh(t.gantry, M.solid));
      const head = new THREE.Mesh(t.head, M.solid); gantry.add(head);
      const beam = new THREE.Mesh(t.beamGeo, M.beam); beam.position.y = 1.08; beam.scale.y = 0.3; head.add(beam);
      const spot = new THREE.Mesh(SPHG, M.arcHalo); spot.scale.set(0.16, 0.04, 0.16); spot.position.y = 0.94; head.add(spot);
      const core = new THREE.Mesh(SPHG, M.arc); core.scale.set(0.06, 0.03, 0.06); core.position.y = 0.94; head.add(core);
      const ph = Math.random() * 10;
      inst.anim = (dt, tt) => {
        const u = tt * 0.35 + ph;
        gantry.position.z = z0 + Math.sin(u) * (L / 2 - 1.2);
        head.position.x = Math.sin(u * 2.7) * 1.4;
        const on = Math.sin(u * 5.3) > -0.4;
        beam.visible = spot.visible = core.visible = on;
        spot.scale.x = spot.scale.z = 0.13 + Math.random() * 0.06;
      };
    } else if (type === "test") {
      const lamps = [];
      for (let i = 0; i < 3; i++) {
        const l = new THREE.Mesh(t.lamp, i === 0 ? M.lightOn : M.lightOff);
        l.position.set(10.6 - 2.6, 2.6 + 0.78 + i * 0.18, -2 - 3.2); group.add(l); lamps.push(l);
      }
      const arm = new THREE.Group(); arm.position.set(11, 0, -2); group.add(arm);
      arm.add(new THREE.Mesh(t.arm, M.solid));
      const ph = Math.random() * 10;
      inst.anim = (dt, tt) => {
        const u = tt + ph;
        arm.rotation.y = Math.sin(u * 0.8) * 1.3;
        // Top lamp blinks while the cycle runs, white lamp steady at the bottom.
        lamps[2].material = Math.floor(u * 2.5) % 2 ? M.lightOn : M.lightOff;
        lamps[1].material = Math.sin(u * 0.8) > 0.6 ? M.lightOn : M.lightOff;
        lamps[0].material = M.lightWhite;
      };
    }
    this.scene.add(group);
    return inst;
  }

  /* ---------- batches: one draw per zone type and side, one outline set per side ---------- */
  // Zone pieces never move inside a zone, so every zone of a type on a side is one InstancedMesh (the side's
  // mirror is the mesh's own scale.x, so winding stays right), and each side's outlines are one LineSegments
  // with a fixed region per slot, rewritten only when a slot comes back into view with its new zone.
  // Both happen in model space, so the world bend (track.js) curves them exactly as before.
  buildBatches() {
    this.travel = 0; this.batchList = []; this.parts = {};
    const M = this.M;
    for (const type of ZONE_TYPES) {
      const t = this.template(type);
      for (const side of [1, -1]) {
        const list = [];
        for (const [k, geo, mat] of [["solid", t.solid, M.solid], ["glow", t.glow, M.glow], ["glass", t.glass, M.glass], ["screen", t.screen, M.screen]]) {
          if (!geo) continue;
          const im = new THREE.InstancedMesh(geo, mat, NSLOT);
          im.scale.x = side; im.count = 0; im.visible = false; im.frustumCulled = false;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          // Transparent sort point: the first zone drawn this frame, as when each zone was its own mesh.
          if (!geo.boundingSphere) geo.computeBoundingSphere();
          im.boundingSphere = geo.boundingSphere.clone(); im.userData = { c: geo.boundingSphere.center.z, solid: k === "solid" };
          this.scene.add(im); this.batchList.push(im); list.push(im);
        }
        (this.parts[type] ||= {})[side] = list;
      }
    }
    this.lineCap = Math.max(...ZONE_TYPES.map((k) => this.templates[k].edges.attributes.position.count));
  }

  // Lazily (only when outlines are on): one LineSegments per side, NSLOT regions of lineCap vertices.
  buildLines() {
    this.lines = [1, -1].map((side) => {
      const g = new THREE.BufferGeometry(), a = new Float32Array(NSLOT * this.lineCap * 3).fill(-1e4);
      g.setAttribute("position", new THREE.BufferAttribute(a, 3).setUsage(THREE.DynamicDrawUsage));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(10.5, 3, -60), 1e4); // sorts with the far half of the hall
      const L = new THREE.LineSegments(g, this.M.edge);
      L.scale.x = side; L.frustumCulled = false; L.userData.ssTess = 1; // already in zone-sized pieces: never re-sliced
      this.scene.add(L);
      return L;
    });
  }

  writeLine(slot) {
    const attr = this.lines[slot.side > 0 ? 0 : 1].geometry.attributes.position, a = attr.array;
    const src = this.templates[slot.type].edges.attributes.position.array, cap = this.lineCap * 3;
    const o = slot.ri * cap, dz = slot.z - this.travel;
    for (let i = 0; i < src.length; i += 3) { a[o + i] = src[i]; a[o + i + 1] = src[i + 1]; a[o + i + 2] = src[i + 2] + dz; }
    a.fill(-1e4, o + src.length, o + cap);
    attr.addUpdateRange(o, cap); attr.needsUpdate = true;
    slot.lineAt = 1;
  }

  // Wholly past the fog's far edge, every pixel of a zone is the flat fog colour: the silhouette (its solid
  // batch) is enough, so the glow, glass, outline and moving parts are skipped. The view depth of the slot's
  // near face, bent the way the vertex shader bends it, at its four corners (fog reads view depth).
  fogged(slot, cam, far) {
    const e = cam.matrixWorldInverse.elements, B = BEND.value, zs = slot.z + SEG / 2;
    const d = Math.max(0, -zs - B.z), bx = B.x * d * d, by = B.y * d * d;
    let m = Infinity;
    for (const x of FOGX) for (const y of FOGY) {
      const px = x * slot.side + bx, py = y + by;
      m = Math.min(m, -(e[2] * px + e[6] * py + e[10] * zs + e[14]));
    }
    return m > far + 4;
  }

  // Before each render (scene.onBeforeRender, chained in render.js): instance offsets, visibility, outlines.
  sync(cam) {
    for (const b of this.batchList) b.count = 0;
    const far = this.scene.fog ? this.scene.fog.far : Infinity, lines = this.quality < 2 && !this.noEdges;
    if (lines && !this.lines) this.buildLines();
    if (this.lines) {
      if (this.travel > 8192) { this.travel -= 8192; for (const s of this.slots) s.lineAt = null; } // keeps float32 offsets small
      for (const L of this.lines) { L.visible = lines; L.position.z = this.travel; }
    }
    for (const slot of this.slots) {
      const vis = slot.z > -156, fog = vis && this.fogged(slot, cam, far); // past -156 a zone sits wholly in the fog
      slot.inst.group.visible = vis && !fog;
      if (!vis) continue;
      if (lines && slot.lineAt === null) this.writeLine(slot);
      for (const im of this.parts[slot.type][slot.side]) {
        if (fog && !im.userData.solid) continue;
        const n = im.count++;
        im.instanceMatrix.array[n * 16 + 14] = slot.z;
        if (!n) im.boundingSphere.center.z = im.userData.c + slot.z;
      }
    }
    for (const b of this.batchList) { b.visible = b.count > 0; if (b.visible) b.instanceMatrix.needsUpdate = true; }
  }

  pickType(slot) {
    const other = this.slots.find((s) => s !== slot && s.side !== slot.side && Math.abs(s.z - slot.z) < SEG / 2);
    const prev = this.last[slot.side > 0 ? 0 : 1];
    const ban = new Set([prev, other && other.type]);
    // Windows and doors: never both sides at once, never twice in a row on a side.
    if (prev === "window" || prev === "door" || (other && (other.type === "window" || other.type === "door"))) { ban.add("window"); ban.add("door"); }
    const entries = Object.entries(WEIGHTS).filter(([k]) => !ban.has(k));
    let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
    for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
    return entries[0][0];
  }

  assign(slot, type = this.pickType(slot)) {
    if (slot.inst) { slot.inst.group.visible = false; this.pools[slot.inst.type].push(slot.inst); }
    slot.type = type;
    slot.inst = this.instance(type);
    slot.inst.group.scale.x = slot.side;
    slot.inst.group.position.z = slot.z;
    slot.lineAt = null; // its outline region is rewritten when it comes into view
    this.last[slot.side > 0 ? 0 : 1] = type;
  }

  update(dt, v, t) {
    this.travel += v * dt;
    for (const slot of this.slots) {
      slot.z += v * dt;
      if (slot.z - SEG / 2 > 10) { slot.z -= NSLOT * SEG; this.assign(slot); }
      slot.inst.group.position.z = slot.z;
      if (slot.inst.anim && slot.z > -120 && slot.z < 22) slot.inst.anim(dt, t);
    }
  }

  // Test hook: put given zone types right beside the start of the line.
  force(types) {
    let i = 0;
    for (const slot of this.slots.slice().sort((a, b) => b.z - a.z)) {
      if (i >= types.length) break;
      this.assign(slot, types[i++]);
    }
  }

  setQuality(q) { this.quality = q; } // outlines follow it in sync()

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const t of Object.values(this.templates)) { t.solid.dispose(); t.edges.dispose(); t.glow?.dispose(); }
    this.M.spark.map?.dispose();
    for (const m of Object.values(this.M)) m.dispose?.();
    for (const s of this.shell) { s.geometry.dispose(); s.material.dispose(); }
    for (const L of this.lines || []) L.geometry.dispose();
    for (const b of this.batchList) b.dispose();
  }
}

