// The roof of the hall, built like a car plant's: steel trusses and purlins,
// a skylight ridge, crane runways with two bridge cranes over the line, overhead
// conveyors either side carrying bodies-in-white on hangers, cable trays,
// sprinkler mains, high-bay lights, a catwalk and a few bay signs.
//
// Cost: the static roof is one periodic strip (core, detail, glow, signs: four
// draws) that slides with the run like the line furniture. Bodies are one
// instanced draw, each crane two. Nothing here comes lower than y = 6.3, above
// the camera, so it can never hide a gear or read as something on the floor.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { Builder, C, BOXG, HALF, ROOF } from "./factory.js?v=20261020r6c";

const P = 48;                 // roof pattern period; a multiple of the hall's 24-unit column bays
const Z_HI = 20, Z_LO = -226; // strip extent, so any offset in [0, P) still covers the view (far plane 175)
const SP = 96, S_LO = -274;   // signs repeat less often: their own strip and period
const CHORD_B = 8.24, CHORD_T = 8.86;
const RUNWAY_X = 5.35, RUNWAY_TOP = 7.4;
const CONV_X = 7.4, CONV_Y = 8.1, BODY_Y = 6.28;
const BODY_GAP = 6.5, BODY_N = 22;   // ~143 units of line per side; the far end sits deep in the fog
const TZ0 = 16, TG = 8;               // trusses at z = 16 - 8i: two per 24-unit bay, the bay's own roof beam is the third

/* ---------- body-in-white ---------- */
// Side profile (x = length, y = height), wheel arches cut into the sill line,
// extruded across the car with a soft bevel. Pillars and roof make an open cabin.
function arcPts(cx, cy, r, steps, out) {
  for (let i = 0; i <= steps; i++) { const a = Math.PI - (i / steps) * Math.PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
}
function extrude(points, width, bevel, segs = 2) {
  const sh = new THREE.Shape();
  points.forEach(([px, py], i) => (i ? sh.lineTo(px, py) : sh.moveTo(px, py)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 3 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}
function bodyGeometry() {
  const lower = [[-2.1, 0.22]];
  arcPts(-1.28, 0.22, 0.38, 4, lower);
  arcPts(1.32, 0.22, 0.38, 4, lower);
  lower.push([2.06, 0.22], [2.14, 0.46], [2.02, 0.66], [1.05, 0.8], [-1.62, 0.82], [-2.08, 0.72], [-2.15, 0.42]);
  const parts = [];
  const lowerG = extrude(lower, 1.72, 0.09, 1); lowerG.rotateY(Math.PI / 2); parts.push([lowerG, 0xffffff]);
  const roofG = extrude([[-1.08, 1.27], [0.36, 1.29], [0.3, 1.35], [-1.02, 1.34]], 1.46, 0.035, 1); roofG.rotateY(Math.PI / 2); parts.push([roofG, 0xffffff]);
  const b = new Builder();
  for (const [g, c] of parts) b.add(g, c, 0, 0, 0);
  // Pillars, both sides. The car's length runs along z after the turn.
  const pillar = (x0, y0, x1, y1, w) => {
    // Profile x maps to -z after the turn, so the box's long (z) axis tilts by atan2(-dy, -dx) about x.
    const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(-(y1 - y0), -(x1 - x0));
    for (const s of [-1, 1]) b.add(BOXG, 0xffffff, s * 0.69, (y0 + y1) / 2, -(x0 + x1) / 2, 0.07, w, len + 0.06, a, 0, 0);
  };
  pillar(1.0, 0.8, 0.34, 1.3, 0.07);  // A
  pillar(-0.3, 0.82, -0.32, 1.3, 0.12); // B
  pillar(-1.6, 0.82, -1.06, 1.3, 0.1); // C
  b.box(0xffffff, 1.5, 0.05, 0.08, 0, 1.3, -0.35); // header at the windscreen
  // Hanger: a carriage on the rail over the roof line, a C-frame stepping outboard (+x)
  // and down, cradle bars under the sills.
  const top = CONV_Y - BODY_Y - 0.06, bot = 0.12, hx = 1.04;
  b.box(C.navy, 0.16, 0.12, 3.4, 0, top, 0);
  for (const z of [-1.3, 1.3]) {
    b.box(C.navy, hx + 0.06, 0.08, 0.1, hx / 2, top - 0.02, z);       // arm out
    b.box(C.navy, 0.08, top - bot, 0.1, hx, (top + bot) / 2, z);      // drop
    b.box(C.navy2, hx * 2, 0.07, 0.1, 0, bot, z);                     // cradle
    b.box(C.navy2, 0.08, 0.2, 0.1, -hx + 0.04, bot + 0.1, z);         // inboard stop
  }
  for (const [g] of parts) g.dispose();
  return b.geometry();
}

/* ---------- the static roof strip ---------- */
function strip(core, detail, glow) {
  const L = Z_HI - Z_LO, zc = (Z_HI + Z_LO) / 2;
  // Skylight ridge in the roof plane, purlins, runways, conveyor rails, cable trays, sprinkler mains.
  for (let z = TZ0 - 4; z > Z_LO; z -= TG) glow.box(0xffffff, 1.8, 0.02, 4.6, 0, ROOF - 0.02, z);
  for (const x of [-1.15, 1.15]) core.box(C.steel, 0.12, 0.08, L, x, ROOF - 0.06, zc);
  for (let x = -14; x <= 14; x += 4) if (Math.abs(x) > 2) detail.box(C.white2, 0.1, 0.12, L, x, ROOF - 0.08, zc);
  for (const s of [-1, 1]) {
    // Crane runway on the inner column line: a girder and its rail.
    core.box(C.steel, 0.24, 0.34, L, RUNWAY_X * s, RUNWAY_TOP - 0.23, zc);
    core.box(C.steel2, 0.1, 0.06, L, RUNWAY_X * s, RUNWAY_TOP - 0.03, zc);
    // Overhead conveyor: an I-beam rail hung from the trusses.
    core.box(C.navy2, 0.3, 0.04, L, CONV_X * s, CONV_Y - 0.06, zc);
    core.box(C.navy2, 0.08, 0.16, L, CONV_X * s, CONV_Y + 0.04, zc);
    core.box(C.navy2, 0.3, 0.04, L, CONV_X * s, CONV_Y + 0.12, zc);
    // Cable tray with a few runs of cable in it.
    core.box(C.steel, 0.52, 0.025, L, 9.75 * s, 7.94, zc);
    for (const dx of [-0.25, 0.25]) detail.box(C.steel, 0.025, 0.1, L, (9.75 + dx) * s, 7.99, zc);
    detail.cyl(C.navy, 0.045, L, (9.62) * s, 7.995, zc, "z");
    detail.cyl(C.periDeep, 0.04, L, (9.74) * s, 7.99, zc, "z");
    detail.cyl(C.steel3, 0.05, L, (9.87) * s, 8.0, zc, "z");
    // Sprinkler mains inside the truss depth.
    detail.cyl(C.steel2, 0.045, L, 3.0 * s, 8.74, zc, "z");
    detail.cyl(C.steel2, 0.045, L, 12.5 * s, 8.74, zc, "z");
  }
  // Trusses every 8 units, except on the hall's column lines where its roof beams already run.
  for (let i = 0; TZ0 - i * TG > Z_LO; i++) {
    const z = TZ0 - i * TG, j = i % 6;                           // position in the 48-unit pattern
    const onColumn = i % 3 === 2;
    for (const s of [-1, 1]) {
      // Runway brackets and conveyor drops at every truss.
      core.box(C.steel2, 0.07, CHORD_B - RUNWAY_TOP, 0.07, RUNWAY_X * s, (CHORD_B + RUNWAY_TOP) / 2, z);
      detail.box(C.navy2, 0.05, CHORD_B - CONV_Y - 0.14, 0.05, CONV_X * s, (CHORD_B + CONV_Y + 0.14) / 2, z);
      detail.box(C.steel3, 0.02, CHORD_B - 7.95, 0.02, 9.75 * s, (CHORD_B + 7.95) / 2, z);           // tray hanger
      for (const dz of [-2, 2]) detail.box(C.white, 0.07, 0.16, 0.07, 3.0 * s, 8.62, z + dz);            // sprinkler drops

    }
    if (onColumn) continue;
    core.box(C.steel, HALF * 2, 0.14, 0.16, 0, CHORD_T, z);
    core.box(C.steel, HALF * 2, 0.12, 0.14, 0, CHORD_B, z);
    for (const x of [-HALF + 0.1, -RUNWAY_X, 0, RUNWAY_X, HALF - 0.1]) detail.box(C.steel2, 0.07, CHORD_T - CHORD_B, 0.07, x, (CHORD_T + CHORD_B) / 2, z);
    const dh = CHORD_T - CHORD_B, len = Math.hypot(2, dh), a = Math.atan2(dh, 2);
    for (let x = -HALF; x < HALF; x += 2) {
      const up = ((x + HALF) / 2) % 2 === 0 ? 1 : -1;
      detail.add(BOXG, C.steel2, x + 1, (CHORD_T + CHORD_B) / 2, z, len, 0.06, 0.06, 0, 0, a * up);
    }
    // Linear high-bays under the chord over the line.
    for (const x of [-2.2, 2.2]) {
      core.box(C.steel, 0.24, 0.07, 2.4, x, CHORD_B - 0.1, z);
      glow.box(0xdfe6ff, 0.17, 0.02, 2.3, x, CHORD_B - 0.14, z);
    }
    // Round pendants over the side bays.
    for (const s of [-1, 1]) {
      const x = 9.0 * s;
      core.box(C.steel3, 0.02, CHORD_B - 7.9, 0.02, x, (CHORD_B + 7.9) / 2, z);
      core.add(DOME, C.white2, x, 7.52, z);
      glow.add(DISC, 0xeef2ff, x, 7.53, z);
    }
    // A catwalk along one truss in each pattern, open grating with handrails.
    if (j === 4) {
      const zc2 = z + 0.62;
      detail.box(C.steel3, HALF * 2, 0.04, 0.9, 0, CHORD_B + 0.06, zc2);
      for (const dz of [-0.45, 0.45]) {
        detail.box(C.steel, HALF * 2, 0.08, 0.03, 0, CHORD_B + 0.12, zc2 + dz);
        detail.box(C.periDeep, HALF * 2, 0.035, 0.035, 0, CHORD_B + 0.44, zc2 + dz);
        for (let x = -HALF + 1; x < HALF; x += 2.5) detail.box(C.steel, 0.035, 0.38, 0.035, x, CHORD_B + 0.27, zc2 + dz);
      }
    }
  }
}
// Bay signs on truss faces, toward the camera: [x, atlas row] per truss slot of the
// 96-unit sign pattern. Slots 2, 5, 8, 11 are column lines (no truss); 4 and 10 carry the catwalk.
const SIGN_LABELS = ["BODY SHOP", "LINE 3", "MAIN AISLE", "BAY 12", "WELD", "NO RUNNING", "FINAL ASSEMBLY", "FOREMAN'S OFFICE"];
const SIGN_AT = { 0: [[0, 0]], 1: [[10.4, 3], [-10.4, 4]], 3: [[0, 1]], 6: [[10.4, 5], [-10.4, 2]], 7: [[0, 6]], 9: [[-10.4, 7]] };
function signList() {
  const out = [];
  for (let i = 0; ; i++) {
    const z = TZ0 - i * TG;
    if (z < S_LO) break;
    for (const [x, row] of SIGN_AT[i % 12] || []) out.push([x, 8.53, z + 0.11, 3.6, 0.45, row]);
  }
  return out;
}
const DOME = new THREE.LatheGeometry([[0.05, 0.42], [0.16, 0.3], [0.3, 0.13], [0.36, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
const DISC = new THREE.CircleGeometry(0.32, 10).rotateX(Math.PI / 2); // faces down

function signAtlas() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 1024;
  const x = c.getContext("2d");
  SIGN_LABELS.forEach((t, i) => {
    const y = i * 128;
    x.fillStyle = "#1b1e24"; x.fillRect(0, y, 1024, 128); // graphite sign (grade.js palette)
    x.fillStyle = "#3ddcff"; x.fillRect(44, y + 50, 28, 28);
    x.fillStyle = "#f2f0ea";
    x.font = "400 66px 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
    x.textBaseline = "middle";
    // Spread the letters a little, like the site's mono labels, and fit the row.
    const sp = 8, w = [...t].reduce((a, ch) => a + x.measureText(ch).width + sp, -sp), k = Math.min(1, 860 / w);
    let px = 104;
    for (const ch of t) { x.save(); x.translate(px, y + 66); x.scale(k, 1); x.fillText(ch, 0, 0); x.restore(); px += (x.measureText(ch).width + sp) * k; }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; // clamped to the GPU max by three
  return tex;
}
function signGeometry(list) {
  const pos = [], uv = [], idx = [];
  list.forEach(([x, y, z, w, h, row], i) => {
    const v0 = 1 - (row + 1) / 8, v1 = 1 - row / 8;
    pos.push(x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z, x - w / 2, y + h / 2, z);
    uv.push(0, v0 + 0.004, 1, v0 + 0.004, 1, v1 - 0.004, 0, v1 - 0.004);
    const k = i * 4; idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ---------- bridge crane ---------- */
function craneGeometry() {
  const b = new Builder(), span = RUNWAY_X * 2;
  for (const s of [-1, 1]) {
    b.box(C.white2, span - 0.6, 0.4, 0.3, 0, RUNWAY_TOP + 0.2, 0.55 * s);     // box girders, pale so a pass overhead stays calm
    b.box(C.periDeep, span - 0.6, 0.05, 0.31, 0, RUNWAY_TOP + 0.1, 0.55 * s);  // one accent stripe low on each
    b.box(C.navy, 0.5, 0.32, 2.3, RUNWAY_X * s, RUNWAY_TOP + 0.16, 0);         // end trucks
    for (const dz of [-0.85, 0.85]) b.cyl(C.ink, 0.12, 0.12, RUNWAY_X * s, RUNWAY_TOP + 0.06, dz, "x");
  }
  b.box(C.steel, span - 0.8, 0.03, 0.03, 0, RUNWAY_TOP + 0.62, 0.72);         // handrail on the walk side
  return b.geometry();
}
function trolleyGeometry() {
  const b = new Builder();
  b.box(C.navy, 0.9, 0.24, 1.5, 0, RUNWAY_TOP + 0.52, 0);
  b.cyl(C.steel, 0.2, 0.7, 0, RUNWAY_TOP + 0.48, 0, "x");                     // hoist drum
  b.box(C.navy2, 0.92, 0.04, 1.52, 0, RUNWAY_TOP + 0.42, 0);
  const hy = 6.62;                                                               // hook block well above the camera
  for (const dz of [-0.1, 0.1]) b.box(C.steel3, 0.02, RUNWAY_TOP + 0.4 - hy, 0.02, 0, (RUNWAY_TOP + 0.4 + hy) / 2, dz);
  b.box(C.navy, 0.3, 0.26, 0.2, 0, hy, 0);
  b.box(C.white, 0.31, 0.05, 0.21, 0, hy + 0.06, 0);
  const hook = new THREE.TorusGeometry(0.11, 0.03, 6, 12, Math.PI * 1.35);
  b.add(hook, C.ink, 0, hy - 0.28, 0, 1, 1, 1, 0, Math.PI / 2, -0.5);
  b.box(C.ink, 0.05, 0.12, 0.05, 0, hy - 0.16, 0);
  hook.dispose();
  return b.geometry();
}

/* ---------- the ceiling ---------- */
export class Ceiling {
  constructor(scene) {
    this.scene = scene;
    this.dist = 0;
    this.quality = -1;
    const solid = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xe8ebf3, emissiveIntensity: 0.18 });
    this.M = {
      solid,
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      sign: (() => {
        // Signs fade out as they pass overhead (view depth 6-10 m): on portrait phones the nearest sign
        // otherwise sat half-cropped behind the HUD at the top of the screen.
        const m = new THREE.MeshBasicMaterial({ map: signAtlas(), transparent: true });
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <fog_fragment>",
          "#ifdef USE_FOG\n  gl_FragColor.a *= smoothstep(6.0, 10.0, vFogDepth);\n#endif\n#include <fog_fragment>"); };
        m.customProgramCacheKey = () => "ssSignFade";
        return m;
      })(),
      body: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    const core = new Builder(), detail = new Builder(), glow = new Builder();
    strip(core, detail, glow);
    this.geos = [core.geometry(), detail.geometry(), glow.geometry(), signGeometry(signList())];
    const g = new THREE.Group(), sg = new THREE.Group();
    const [mc, md, mg, ms] = this.geos.map((geo, i) => new THREE.Mesh(geo, [solid, solid, this.M.glow, this.M.sign][i]));
    for (const m of [mc, md, mg, ms]) { m.frustumCulled = false; m.matrixAutoUpdate = false; m.updateMatrix(); }
    g.add(mc, md, mg);
    sg.add(ms);
    this.detail = md;
    scene.add(g, sg);
    this.group = g;
    this.signs = sg;

    // Bodies on both conveyors: one instanced draw. Index order puts every other
    // body first, so lowering the count thins the line evenly.
    const bg = bodyGeometry();
    this.geos.push(bg);
    const n = BODY_N * 2;
    const bodies = new THREE.InstancedMesh(bg, this.M.body, n);
    bodies.frustumCulled = false;
    bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tints = [0xf4f6fb, 0xe6e9f1, 0xd3d8e4, 0xf4f6fb, 0xc4ccdf, 0xeef1f7, 0xa9bcff, 0xe6e9f1, 0xf4f6fb, 0xd3d8e4, 0x8f9cc9];
    this.all = [];
    for (let side = 0; side < 2; side++) for (let k = 0; k < BODY_N; k++) {
      this.all.push({ side, k, empty: (k * 7 + side * 3) % 9 === 4, color: tints[(k * 5 + side * 2) % tints.length] });
    }
    scene.add(bodies);
    this.bodies = bodies;
    this.o = new THREE.Object3D();

    // Two bridge cranes over the line, drifting along their runways.
    const cg = craneGeometry(), tg = trolleyGeometry();
    this.geos.push(cg, tg);
    this.cranes = [0, 1].map((i) => {
      const bridge = new THREE.Mesh(cg, solid);
      const trolley = new THREE.Mesh(tg, solid);
      bridge.add(trolley);
      bridge.frustumCulled = trolley.frustumCulled = false;
      scene.add(bridge);
      return { bridge, trolley, z: -30 - i * 92, own: i ? -0.9 : 0.7, ph: i * 2.1 };
    });
    this.setQuality(0);
  }

  update(dt, v, t) {
    this.dist += v * dt;
    this.group.position.z = this.dist % P;
    this.signs.position.z = this.dist % SP;

    // Conveyors run the opposite way on each side, a little faster than walking pace.
    const span = BODY_N * BODY_GAP, o = this.o, n = this.bodies.count;
    for (let i = 0; i < n; i++) {
      const s = this.slots[i];
      const u = s.side ? this.dist - t * 1.3 : this.dist + t * 1.1;
      const z = 16 - span + (((u + s.k * BODY_GAP) % span) + span) % span;
      // Each body hangs under its rail; the left line is turned round so its hanger is outboard too.
      o.position.set(s.side ? -CONV_X : CONV_X, BODY_Y, z);
      o.rotation.set(0, s.side ? Math.PI : 0, Math.sin(t * 0.9 + s.k) * 0.008);
      o.scale.setScalar(s.empty ? 0 : 1);
      o.updateMatrix();
      this.bodies.setMatrixAt(i, o.matrix);
    }
    this.bodies.instanceMatrix.needsUpdate = true;

    for (const c of this.cranes) {
      c.z += (v + c.own) * dt;
      if (c.z > 26) c.z -= 190;
      if (c.z < -170) c.z += 190;
      c.bridge.position.z = c.z;
      c.trolley.position.x = Math.sin(t * 0.22 + c.ph) * 3.8;
      c.bridge.visible = c.z > -160;
    }
  }

  // 0 full detail; 1 thins the bodies to 3/4; 2 drops truss webs and small runs, half the bodies; 3 a third.
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.detail.visible = q < 2;
    const per = Math.round(BODY_N * [1, 0.75, 0.5, 0.34][Math.min(3, q)]);
    // Shown bodies come first in the instance order, spread evenly along both lines.
    const keep = new Set();
    for (let i = 0; i < per; i++) keep.add(Math.floor((i * BODY_N) / per));
    const shown = this.all.filter((s) => keep.has(s.k)), rest = this.all.filter((s) => !keep.has(s.k));
    this.slots = shown.concat(rest);
    const col = new THREE.Color();
    this.slots.forEach((s, i) => this.bodies.setColorAt(i, col.setHex(s.color)));
    this.bodies.instanceColor.needsUpdate = true;
    this.bodies.count = shown.length;
  }

  stats(parts = false) {
    if (parts) {
      const t = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      return { core: t(this.geos[0]), detail: t(this.geos[1]), glow: t(this.geos[2]), signs: t(this.geos[3]), body: t(this.bodies.geometry), crane: t(this.cranes[0].bridge.geometry) + t(this.cranes[0].trolley.geometry) };
    }
    let tris = 0;
    const add = (geo, times = 1) => { tris += ((geo.index ? geo.index.count : geo.attributes.position.count) / 3) * times; };
    [...this.group.children, ...this.signs.children].forEach((m) => { if (m.visible) add(m.geometry); });
    add(this.bodies.geometry, this.bodies.count);
    for (const c of this.cranes) if (c.bridge.visible) { add(c.bridge.geometry); add(c.trolley.geometry); }
    return { tris: Math.round(tris), bodies: this.bodies.count };
  }

  dispose() {
    this.scene.remove(this.group, this.signs, this.bodies, ...this.cranes.map((c) => c.bridge));
    for (const g of this.geos) g.dispose();
    this.bodies.dispose?.();
    this.M.sign.map?.dispose();
    for (const m of Object.values(this.M)) m.dispose();
  }
}
