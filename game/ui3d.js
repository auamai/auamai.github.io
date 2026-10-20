// Factory run: 3D hints and countdown, drawn in a small overlay scene on top of the hall.
// Extruded Inter Tight text in the gear palette (periwinkle face, deep periwinkle sides),
// with gesture icons that move the way the swipe does. One geometry per string, cached.
// Only renders while something is on screen; at the lowest quality the game uses the 2D fallback.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLYPHS } from "./glyphs.js?v=20261020r5";

const PAL = { face: 0x8fa2f0, side: 0x2c3570, navy: 0x10162f, pearl: 0xf4f6fb, accent: 0xa9bcff };
const CAP = 0.73;          // Inter Tight cap height, in em
const FOV = 30, CAM_Z = 10;
const BEAT = 0.42;         // one countdown number
const GO_T = 0.5;          // the GO beat

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const outBack = (t) => { t = clamp(t, 0, 1); const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

/* ---------- glyph outlines -> shapes ---------- */
function glyphPath(d, ox, s) {
  const path = new THREE.ShapePath();
  const re = /([MLQZ])([^MLQZ]*)/g;
  let m, cx = 0, cy = 0;
  while ((m = re.exec(d))) {
    const n = m[2].trim() ? m[2].trim().split(/\s+/).map(Number) : [];
    const P = (i) => [ox + n[i] * s, n[i + 1] * s];
    if (m[1] === "M") { [cx, cy] = P(0); path.moveTo(cx, cy); }
    else if (m[1] === "L") { for (let i = 0; i < n.length; i += 2) { [cx, cy] = P(i); path.lineTo(cx, cy); } }
    else if (m[1] === "Q") {
      // TrueType: off-curve points with implied on-curve midpoints; the last point is on the curve.
      const pts = [];
      for (let i = 0; i < n.length; i += 2) pts.push(P(i));
      for (let i = 0; i < pts.length - 1; i++) {
        const c = pts[i];
        const e = i === pts.length - 2 ? pts[i + 1] : [(c[0] + pts[i + 1][0]) / 2, (c[1] + pts[i + 1][1]) / 2];
        path.quadraticCurveTo(c[0], c[1], e[0], e[1]);
        [cx, cy] = e;
      }
    }
  }
  return path;
}

function textShapes(str) {
  const s = 1 / 1000, shapes = [];
  let x = 0;
  for (const ch of str) {
    const g = GLYPHS[ch] || GLYPHS["?"];
    if (ch !== " " && g.d) shapes.push(...glyphPath(g.d, x, s).toShapes(false));
    x += g.a * s;
  }
  return { shapes, width: x };
}

function chevronShape(w = 0.62, h = 0.36, t = 0.13) {
  // A rounded-feel "^" with its tip at the top, centred on the origin.
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(0, h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2 - t * 1.1, -h / 2);
  s.lineTo(0, h / 2 - t * 1.55);
  s.lineTo(-w / 2 + t * 1.1, -h / 2);
  s.closePath();
  return s;
}

function gearShape(teeth = 10, rO = 0.5, rI = 0.41, hole = 0.17) {
  const s = new THREE.Shape(), n = teeth * 2;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, r = i % 2 ? rI : rO;
    if (i === 0) s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); else s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}

// Soft rounded glow, drawn once: pearl for the halo behind hints, navy for the drop shadow.
function glowTexture(rgb) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const x = c.getContext("2d");
  x.filter = "blur(18px)";
  x.fillStyle = `rgba(${rgb},1)`;
  const r = 34;
  x.beginPath();
  x.roundRect ? x.roundRect(40, 34, 176, 60, r) : x.rect(40, 34, 176, 60);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ExtrudeGeometry adds a face group and a side group per glyph contour, which is two draw
// calls per letter. Reorder the vertices so the whole string draws in two calls.
function twoGroups(geo) {
  if (geo.groups.length <= 2) return geo;
  const out = new THREE.BufferGeometry(), names = Object.keys(geo.attributes);
  const order = [0, 1].flatMap((mi) => geo.groups.filter((g) => g.materialIndex === mi));
  const counts = [0, 0];
  for (const g of geo.groups) counts[g.materialIndex] += g.count;
  for (const n of names) {
    const src = geo.attributes[n], k = src.itemSize, arr = new Float32Array(src.count * k);
    let o = 0;
    for (const g of order) { arr.set(src.array.subarray(g.start * k, (g.start + g.count) * k), o); o += g.count * k; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, k));
  }
  out.addGroup(0, counts[0], 0);
  out.addGroup(counts[0], counts[1], 1);
  geo.dispose();
  return out;
}

export class UI3D {
  constructor(renderer, { still = false } = {}) {
    this.renderer = renderer;
    this.still = still;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
    this.cam.position.set(0, 0, CAM_Z);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9bd6, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(-3, 5, 8);
    const rimL = new THREE.DirectionalLight(0xdfe6ff, 0.9);
    rimL.position.set(4, -2, 3);
    this.scene.add(key, rimL);

    // Metallic look on cheap materials: a strong white specular over the periwinkle face.
    const fade = { transparent: true, opacity: 1 };
    this.M = {
      face: new THREE.MeshPhongMaterial({ color: PAL.face, specular: 0xffffff, shininess: 90, emissive: 0x4f63c4, emissiveIntensity: 0.22, ...fade }),
      side: new THREE.MeshPhongMaterial({ color: PAL.side, specular: 0xa9bcff, shininess: 40, emissive: 0x10162f, emissiveIntensity: 0.3, ...fade }),
      halo: new THREE.MeshBasicMaterial({ map: glowTexture("244,246,251"), transparent: true, opacity: 0.85, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: glowTexture("16,22,47"), transparent: true, opacity: 0.12, depthWrite: false }),
      ring: new THREE.MeshBasicMaterial({ color: PAL.accent, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
      gear: new THREE.MeshPhongMaterial({ color: PAL.accent, specular: 0xffffff, shininess: 60, transparent: true, opacity: 0.22, depthWrite: false }),
    };
    this.mats = [this.M.face, this.M.side];
    this.cache = new Map();
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geo = {
      plane,
      chevron: new THREE.ExtrudeGeometry(chevronShape(), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.018, bevelSegments: 1 }),
      gear: new THREE.ExtrudeGeometry(gearShape(), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1, curveSegments: 10 }).translate(0, 0, -0.07),
      ring: new THREE.RingGeometry(0.9, 1, 56),
    };
    this.geo.chevron.translate(0, 0, -0.07);

    /* hint: halo, shadow, icon, title */
    const H = (this.hint = { g: new THREE.Group(), on: false, t: 0, out: -1, id: "" });
    H.halo = new THREE.Mesh(plane, this.M.halo);
    H.halo.position.z = -0.4;
    H.shadow = new THREE.Mesh(plane, this.M.shadow);
    H.title = new THREE.Mesh(undefined, this.mats);
    H.icon = new THREE.Group();
    H.chev = [0, 1].map(() => new THREE.Mesh(this.geo.chevron, this.mats));
    H.wheel = new THREE.Mesh(this.geo.gear, this.mats);
    H.icon.add(...H.chev, H.wheel);
    H.g.add(H.halo, H.shadow, H.icon, H.title);
    H.g.visible = false;
    this.scene.add(H.g);

    /* countdown: numeral, ring burst, gear flourish */
    const C = (this.count = { g: new THREE.Group(), on: false, t: 0, seq: [] });
    C.num = new THREE.Mesh(undefined, this.mats);
    C.shadow = new THREE.Mesh(plane, this.M.shadow);
    C.ring = new THREE.Mesh(this.geo.ring, this.M.ring);
    C.ring2 = new THREE.Mesh(this.geo.ring, this.M.ring.clone());
    C.gear = new THREE.Mesh(this.geo.gear, this.M.gear);
    C.gear.position.z = -0.8;
    C.g.add(C.gear, C.shadow, C.ring, C.ring2, C.num);
    C.g.visible = false;
    this.scene.add(C.g);

    this.w = 1; this.h = 1;
  }

  get active() { return this.hint.g.visible || this.count.g.visible; }

  text(str) {
    let e = this.cache.get(str);
    if (!e) {
      const { shapes, width } = textShapes(str);
      const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: 0.16, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.014, bevelSegments: 1,
      });
      geo.translate(-width / 2, -CAP / 2, -0.08);
      e = { geo: twoGroups(geo), width };
      this.cache.set(str, e);
    }
    return e;
  }

  // World units per CSS pixel at the text plane (z = 0).
  get unit() { return (2 * CAM_Z * Math.tan((FOV * Math.PI) / 360)) / this.h; }

  resize(w, h) {
    this.w = w; this.h = h;
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    if (this.hint.on) this.layoutHint();
  }

  /* ---------- hints ---------- */
  // Upper-middle of the screen: above the lanes and the next obstacles, below the HUD.
  hintLayout() {
    const w = this.w, h = this.h, short = h < 520 && w > h;
    const em = clamp(Math.min(w, h) * 0.085, 28, short ? 36 : 46);
    const top = short ? 0.2 : w < h ? 0.25 : 0.22;
    return { em, top };
  }

  showHint(id, title, icon) {
    const H = this.hint;
    H.id = id; H.icon_ = icon; H.on = true; H.t = 0; H.out = -1;
    H.g.visible = true;
    const e = this.text(title);
    H.title.geometry = e.geo;
    H.width = e.width;
    H.chev.forEach((c) => (c.visible = icon === "lr" || icon === "up" || icon === "down"));
    H.wheel.visible = icon === "wheel";
    if (icon === "lr") { H.chev[0].rotation.z = Math.PI / 2; H.chev[1].rotation.z = -Math.PI / 2; }
    else if (icon === "down") { H.chev[0].rotation.z = H.chev[1].rotation.z = Math.PI; }
    else { H.chev[0].rotation.z = H.chev[1].rotation.z = 0; }
    this.layoutHint();
    this.setOpacity(0);
  }

  layoutHint() {
    const H = this.hint, u = this.unit, L = this.hintLayout();
    // Shrink to fit narrow screens, keeping 24 px each side.
    const maxW = (this.w - 48) * u;
    let em = L.em * u;
    if (H.width * em > maxW) em = maxW / H.width;
    H.em = em;
    H.title.scale.setScalar(em);
    const y = (0.5 - L.top) * this.h * u;
    H.baseY = y;
    H.g.position.set(0, y, 0);
    // Icon sits above the title, the shadow just under it, the halo behind everything.
    H.icon.position.set(0, em * 1.05, 0);
    H.icon.scale.setScalar(em * 0.95);
    H.shadow.position.set(em * 0.05, -em * 0.12, -0.3);
    H.shadow.scale.set(H.width * em * 1.35, em * 1.5, 1);
    H.halo.position.set(0, em * 0.15, -0.4);
    H.halo.scale.set(Math.max(H.width * em, em * 3) * 1.75, em * 5.2, 1);
    H.subY = L.top * this.h + (em / u) * 0.95; // CSS px from the top for the 2D sub line
  }

  hideHint() {
    const H = this.hint;
    if (H.on && H.out < 0) H.out = 0;
  }

  setOpacity(a) {
    this.M.face.opacity = this.M.side.opacity = a;
    this.M.halo.opacity = 0.94 * a;
    this.M.shadow.opacity = 0.12 * a;
  }

  updateHint(dt) {
    const H = this.hint;
    if (!H.on) return;
    H.t += dt;
    let a = smooth(H.t / 0.25), s = this.still ? 1 : outBack(H.t / 0.38);
    if (H.out >= 0) {
      H.out += dt;
      const k = 1 - smooth(H.out / 0.28);
      a *= k; s *= 0.9 + 0.1 * k;
      if (H.out >= 0.28) { H.on = false; H.g.visible = false; return; }
    }
    this.setOpacity(a);
    const t = H.t;
    H.g.scale.setScalar(Math.max(0.01, s));
    // A small float and sway, so it reads as an object in the hall rather than a label.
    const bob = this.still ? 0 : Math.sin(t * 2.2) * 0.06 * H.em;
    H.g.position.y = H.baseY + bob;
    H.g.rotation.y = this.still ? 0 : Math.sin(t * 1.3) * 0.08;
    H.g.rotation.x = this.still ? 0 : -0.06 + Math.sin(t * 1.7) * 0.03;
    // Gesture icon: the chevrons move the way the swipe does, the wheel spins.
    const ic = H.icon_, c = H.chev;
    const p = this.still ? 0.5 : (t * 1.4) % 1, e = smooth(p);
    if (ic === "lr") {
      c[0].position.set(-0.42 - e * 0.3, 0, 0); c[1].position.set(0.42 + e * 0.3, 0, 0);
    } else if (ic === "up" || ic === "down") {
      const d = ic === "up" ? 1 : -1;
      c[0].position.set(0, d * (-0.16 + e * 0.3), 0); c[1].position.set(0, d * (0.16 + e * 0.3), 0);
      c[0].scale.setScalar(1); c[1].scale.setScalar(0.8);
    }
    if (ic === "wheel" && !this.still) H.wheel.rotation.z = -t * 3;
  }

  /* ---------- countdown ---------- */
  // seq: ["3","2","1","GO"] for a resume or a fresh start, ["GO"] for a quick retry.
  startCount(seq) {
    const C = this.count;
    C.seq = seq; C.t = 0; C.on = true; C.idx = -1;
    C.g.visible = true;
    this.layoutCount();
  }

  stopCount() {
    const C = this.count;
    C.on = false; C.g.visible = false;
  }

  get countDur() { const n = this.count.seq.length; return (n - 1) * BEAT + GO_T; }

  layoutCount() {
    const C = this.count, u = this.unit;
    const short = this.h < 520 && this.w > this.h;
    C.em = clamp(Math.min(this.w, this.h) * (short ? 0.28 : 0.34), short ? 90 : 110, 230) * u;
    C.g.position.set(0, (0.5 - (short ? 0.33 : 0.36)) * this.h * u, 0);
  }

  // Returns the label on screen now ("" once done).
  updateCount(dt) {
    const C = this.count;
    if (!C.on) return "";
    C.t += dt;
    const nb = C.seq.length - 1;
    let i = Math.min(nb, Math.floor(C.t / BEAT));
    if (C.seq[i] !== "GO" && C.t >= nb * BEAT) i = nb;
    const t0 = i * BEAT, len = C.seq[i] === "GO" ? GO_T : BEAT;
    const u = (C.t - t0) / len;
    if (C.t >= nb * BEAT + GO_T) { this.stopCount(); return ""; }
    const label = C.seq[i];
    if (i !== C.idx) {
      C.idx = i;
      const e = this.text(label);
      C.num.geometry = e.geo;
      C.w = e.width;
    }
    const go = label === "GO", em = C.em * (go ? 0.82 : 1);
    const a = go ? 1 - smooth((u - 0.45) / 0.55) : 1 - smooth((u - 0.78) / 0.22);
    this.M.face.opacity = this.M.side.opacity = this.still ? Math.min(smooth(u / 0.2), a) : a;
    if (this.still) {
      // Reduced motion: a plain fade, nothing moves.
      C.num.scale.setScalar(em);
      C.num.rotation.set(0, 0, 0);
      C.ring.visible = C.ring2.visible = false;
      C.gear.visible = false;
      C.shadow.visible = false;
      return label;
    }
    // Scale punch with a slight twist that settles, alternating direction each beat.
    const dir = i % 2 ? -1 : 1, k = outBack(u / 0.42);
    C.num.scale.setScalar(em * (1.7 - 0.7 * k));
    C.num.rotation.set(0.25 * (1 - k), dir * 0.45 * (1 - k), dir * -0.18 * (1 - k));
    // Ring burst each beat; GO gets a second, wider one.
    C.ring.visible = true;
    C.ring.scale.setScalar(C.em * (0.5 + smooth(u) * 0.9));
    this.M.ring.opacity = 0.55 * (1 - smooth(u));
    C.ring2.visible = go;
    if (go) { C.ring2.scale.setScalar(C.em * (0.7 + smooth(u) * 1.6)); C.ring2.material.opacity = 0.4 * (1 - smooth(u)); }
    // The gear behind ticks an eighth of a turn per beat, then spins away on GO.
    C.gear.visible = true;
    C.gear.scale.setScalar(C.em * 1.25);
    C.gear.rotation.z = -(i + smooth(u / 0.5)) * (Math.PI / 5) - (go ? smooth(u) * Math.PI * 0.6 : 0);
    this.M.gear.opacity = 0.2 * a;
    C.shadow.visible = true;
    C.shadow.position.set(C.em * 0.05, -C.em * 0.5, -0.5);
    C.shadow.scale.set(C.w * C.em * 1.4, C.em * 0.5, 1);
    this.M.shadow.opacity = 0.1 * a;
    return label;
  }

  update(dt) {
    if (this.count.on) this.updateCount(dt);
    if (this.hint.on && !this.count.on) this.updateHint(dt);
    // While the countdown shows, the hint waits underneath.
    if (this.count.on) this.hint.g.visible = false;
    else if (this.hint.on) this.hint.g.visible = true;
  }

  render() {
    if (!this.active) return;
    const r = this.renderer, ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }

  dispose() {
    for (const e of this.cache.values()) e.geo.dispose();
    Object.values(this.geo).forEach((g) => g.dispose());
    this.M.halo.map.dispose(); this.M.shadow.map.dispose();
    Object.values(this.M).forEach((m) => m.dispose());
    this.count.ring2.material.dispose();
  }
}
