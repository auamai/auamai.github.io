// Servo Sprint: 3D hints and countdown, drawn in a small overlay scene on top of the hall.
// Extruded Inter Tight text in deep navy with a lighter navy-periwinkle extrusion, on a soft pearl glow,
// with gesture icons that move the way the swipe does. One geometry per string, cached.
// Drawn on its own small transparent canvas at the screen's pixel ratio (capped at 2) with MSAA, so it
// stays crisp when the hall drops resolution to hold frame rate. Only renders while something is on
// screen; at the lowest quality the game uses the 2D fallback.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLYPHS } from "./glyphs.js?v=20261021r8";

// r6b release: on the graphite hall the 3D text is off-white with a graphite extrusion and a dark halo
// (the navy-on-pearl set was for the old white hall; the grade had turned it dark-on-dark).
const PAL = { face: 0xf2f0ea, side: 0x2c3037, navy: 0x0b0c0f, pearl: 0x14161b, accent: 0x5a6dcd, soft: 0xa9bcff };
const DPR_CAP = 2;
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

// A spanner: a bar with an open jaw at the top and a ring at the bottom, tipped 45 degrees.
function wrenchShape() {
  // Open-end head (centre 0,0.3) with a notch at the top, a straight handle, a ring end.
  const s = new THREE.Shape(), R = 0.2, yN = Math.sqrt(R * R - 0.07 * 0.07), yH = Math.sqrt(R * R - 0.065 * 0.065);
  s.moveTo(0.07, 0.3 + yN);
  s.lineTo(0.07, 0.33); s.lineTo(-0.07, 0.33); s.lineTo(-0.07, 0.3 + yN);
  s.absarc(0, 0.3, R, Math.atan2(yN, -0.07), Math.atan2(-yH, -0.065) + Math.PI * 2, false);
  s.lineTo(-0.065, -0.22);
  s.absarc(0, -0.32, 0.13, Math.PI * 0.63, Math.PI * 2.37, false);
  s.lineTo(0.065, 0.3 - yH);
  s.absarc(0, 0.3, R, Math.atan2(-yH, 0.065) + Math.PI * 2, Math.atan2(yN, 0.07) + Math.PI * 2, false);
  const eye = new THREE.Path();
  eye.absarc(0, -0.32, 0.06, 0, Math.PI * 2, true);
  s.holes.push(eye);
  return s;
}

function starShape(n = 5, rO = 0.5, rI = 0.22) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? rI : rO;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
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

// Soft elliptical glow computed per pixel (no texture to magnify, so no blocky steps or banding):
// pearl for the halo behind hints, navy for the drop shadow. A one-step dither hides 8-bit banding.
function glowMaterial(hex, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex) }, uOpacity: { value: opacity } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float d = length(p * vec2(1.0, 1.15));
        float a = 1.0 - smoothstep(0.18, 1.0, d);
        a *= a;
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        gl_FragColor = vec4(uColor, clamp(a * uOpacity + (n - 0.5) / 255.0, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
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
  constructor(renderer, { still = false, container = null } = {}) {
    this.shared = renderer;
    this.renderer = renderer;
    this.container = container;
    this.still = still;
    this.drawn = false;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
    this.cam.position.set(0, 0, CAM_Z);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9bd6, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 5, 8);
    const rimL = new THREE.DirectionalLight(0xdfe6ff, 0.9);
    rimL.position.set(4, -2, 3);
    this.scene.add(key, rimL);

    // Deep navy face, lighter navy-periwinkle sides for depth.
    const fade = { transparent: true, opacity: 1 };
    this.M = {
      // The face holds one deep navy whatever the sway does to the light; the sides take the shading.
      face: new THREE.MeshBasicMaterial({ color: PAL.face, ...fade }),
      side: new THREE.MeshPhongMaterial({ color: PAL.side, specular: 0xa9bcff, shininess: 24, emissive: 0x253070, emissiveIntensity: 0.4, ...fade }),
      halo: glowMaterial(PAL.pearl, 0.92),
      shadow: glowMaterial(PAL.navy, 0.14),
      ring: new THREE.MeshBasicMaterial({ color: PAL.accent, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
      gear: new THREE.MeshPhongMaterial({ color: PAL.soft, specular: 0xffffff, shininess: 60, transparent: true, opacity: 0.22, depthWrite: false }),
    };
    this.mats = [this.M.face, this.M.side];
    this.cache = new Map();
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geo = {
      plane,
      chevron: new THREE.ExtrudeGeometry(chevronShape(), { depth: 0.14, bevelEnabled: false }),
      gear: new THREE.ExtrudeGeometry(gearShape(), { depth: 0.14, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -0.07),
      ring: new THREE.RingGeometry(0.9, 1, 96),
      tool: new THREE.ExtrudeGeometry(wrenchShape(), { depth: 0.14, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -0.07).rotateZ(-Math.PI / 4),
      star: new THREE.ExtrudeGeometry(starShape(), { depth: 0.14, bevelEnabled: false }).translate(0, 0, -0.07),
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
    H.tool = new THREE.Mesh(this.geo.tool, this.mats);
    H.star = new THREE.Mesh(this.geo.star, this.mats);
    H.icon.add(...H.chev, H.wheel, H.tool, H.star);
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
      // Enough curve steps that bowls read round at 230 px, no bevel: an outward bevel on thin
      // counters (e, a, g) folds into the face and showed as light seams across the letters.
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.2, curveSegments: 10, bevelEnabled: false });
      geo.translate(-width / 2, -CAP / 2, -0.1);
      e = { geo: twoGroups(geo), width };
      this.cache.set(str, e);
    }
    return e;
  }

  // World units per CSS pixel at the text plane (z = 0).
  get unit() { return (2 * CAM_Z * Math.tan((FOV * Math.PI) / 360)) / this.h; }

  // Our own transparent canvas over the hall, created the first time something shows.
  // Falls back to drawing into the hall's renderer if a second WebGL context isn't available.
  surface() {
    if (this.own !== undefined || !this.container) return;
    this.own = null;
    try {
      const c = document.createElement("canvas");
      c.className = "fr__ui3d";
      c.setAttribute("aria-hidden", "true");
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, powerPreference: "high-performance" });
      r.setClearColor(0x000000, 0);
      const base = this.shared.domElement;
      base.parentNode === this.container ? base.after(c) : this.container.prepend(c);
      this.own = r;
      this.renderer = r;
      this.fit();
    } catch (e) { this.own = null; this.renderer = this.shared; }
  }

  fit() {
    if (!this.own) return;
    this.own.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    this.own.setSize(this.w, this.h, false);
    this.drawn = true; // a resize clears the buffer; draw (or clear) again next frame
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.fit();
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
    this.surface();
    const H = this.hint;
    H.id = id; H.icon_ = icon; H.on = true; H.t = 0; H.out = -1;
    H.g.visible = true;
    const e = this.text(title);
    H.title.geometry = e.geo;
    H.width = e.width;
    H.chev.forEach((c) => (c.visible = icon === "lr" || icon === "up" || icon === "down"));
    H.wheel.visible = icon === "wheel";
    H.tool.visible = icon === "tool";
    H.star.visible = icon === "star";
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

  fadeText(a) { this.M.face.opacity = this.M.side.opacity = a; }

  setOpacity(a) {
    this.fadeText(a);
    this.M.halo.uniforms.uOpacity.value = 0.92 * a;
    this.M.shadow.uniforms.uOpacity.value = 0.14 * a;
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
    // Tipped back a little so the lighter extrusion shows under the navy face as depth.
    H.g.rotation.x = -0.2 + (this.still ? 0 : Math.sin(t * 1.7) * 0.03);
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
    if (ic === "tool" && !this.still) H.tool.rotation.z = Math.sin(t * 5) * 0.35;
    if (ic === "star" && !this.still) { H.star.rotation.y = t * 2.5; H.star.scale.setScalar(1 + Math.sin(t * 8) * 0.06); }
  }

  /* ---------- countdown ---------- */
  // seq: ["3","2","1","GO"] for a resume or a fresh start, ["GO"] for a quick retry.
  startCount(seq) {
    this.surface();
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
    this.fadeText(this.still ? Math.min(smooth(u / 0.2), a) : a);
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
    this.M.shadow.uniforms.uOpacity.value = 0.1 * a;
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
    if (this.own) {
      // Own canvas: draw while active, clear once when the last thing leaves.
      if (this.active) { this.own.render(this.scene, this.cam); this.drawn = true; }
      else if (this.drawn) { this.own.clear(); this.drawn = false; }
      return;
    }
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
    Object.values(this.M).forEach((m) => m.dispose());
    this.count.ring2.material.dispose();
    if (this.own) {
      this.own.dispose();
      this.own.forceContextLoss?.();
      this.own.domElement.remove();
      this.own = null;
    }
  }
}
