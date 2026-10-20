// Factory run: a small endless runner. Loaded only when someone presses Play.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import * as P from "./profile.js";

/* ---------- tuning ---------- */
const LANES = [-2.2, 0, 2.2];
const SPAWN_Z = -100;
const DESPAWN_Z = 14;
const START_SPEED = 13;
const MAX_SPEED = 38;
const ACCEL = 0.32;          // units/s gained per second
const GRAVITY = -28;
const JUMP_V = 9.6;          // peak ~1.65
const SLIDE_T = 0.72;
const GEAR_POINTS = 10;
const DIST_POINTS = 0.5;     // per unit travelled
const PERIOD = 12;           // scenery repeat length

// Light factory built from the portfolio's own palette (styles.css):
// --ink #f4f6fb is the white of the hall, the page navy #10162f is the ink,
// --accent #a9bcff is the periwinkle. Cool tones only, no orange.
const SITE = { paper: 0xf4f6fb, navy: 0x10162f, accent: 0xa9bcff };
const COL = {
  bg: SITE.paper, fog: SITE.paper,
  floor: 0xe9ecf4, lane: 0xdfe3ee, dash: SITE.accent,
  wall: 0xf1f3f9, ceiling: 0xe8ebf3, pillar: 0xe2e6f0, beam: 0xe6e9f2, light: SITE.accent,
  rail: 0xd5dae6, roller: 0xbcc3d5,
  robot: 0x5a6488, robotMid: 0x454e72, robotDark: 0x262d4d, accent: SITE.accent,
  crate: 0xa4aaba, crateTop: 0xb9bfcc, arm: 0x949bad, armDark: 0x6c7389,
  gap: 0x262d4d, gear: 0x8fa2f0, edge: 0x262d4d,
  bot: 0xb0b6c5, botTop: 0xc9ced9, botDark: 0x3a4262,
};

const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>',
};

const fmt = (n) => Math.floor(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pick = (a) => a[(Math.random() * a.length) | 0];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

let current = null;
let cssLoaded = null;

function loadCss() {
  if (!cssLoaded) {
    cssLoaded = new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("./game.css?v=20261020b", import.meta.url).href;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }
  return cssLoaded;
}

export async function openGame(opts = {}) {
  if (current) return current;
  await loadCss();
  current = new Game(opts);
  return current;
}

/* ---------- geometry ---------- */
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BOX_EDGES = new THREE.EdgesGeometry(BOX);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const CYL_EDGES = new THREE.EdgesGeometry(CYL, 30);
const BOT_SPEED = 3.2;       // own speed of mobile robots, on top of the belt
const BOT_FROM = 20;         // seconds into a run before mobile robots appear
const BOT_TURN_T = 0.6;      // telegraph before a lane change
const BOT_TURN_MIN_Z = -46;  // never start a lane change closer than this

function gearGeometry() {
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

class Game {
  constructor(opts) {
    this.opts = opts;
    this.state = "menu";
    this.closed = false;
    this.t = 0;
    this.dist = 0;
    this.speed = START_SPEED;
    this.profile = P.load();
    this.board = { status: P.online() ? "loading" : "soon", rows: [] };
    this.settings = P.settings();
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.coarse = matchMedia("(pointer: coarse)").matches;
    this.obstacles = [];
    this.gears = [];
    this.pools = { crate: [], stack: [], arm: [], gap: [], bot: [], gear: [] };
    this.r = { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false };
    this.shake = 0;
    this.fps = { frames: 0, acc: 0 };
    this.quality = 0;
    this.prevFocus = document.activeElement;
    if (window.__frDebug) window.__frGame = this;

    this.buildDom();
    this.buildScene();
    this.bind();
    this.showMenu();
    this.refreshBoard();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------- DOM ---------- */
  buildDom() {
    const root = document.createElement("div");
    root.className = "fr";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Factory run");
    root.innerHTML = `
      <canvas class="fr__canvas" aria-hidden="true"></canvas>
      <div class="fr__hud" hidden>
        <span class="fr__score">0</span>
        <span class="fr__meta"><span class="fr__gears">0</span> gears · best <span class="fr__best">0</span></span>
      </div>
      <div class="fr__corner">
        <button class="fr__icon" type="button" data-act="pause" aria-label="Pause" hidden>${ICON.pause}</button>
        <button class="fr__icon" type="button" data-act="close" aria-label="Close game">${ICON.close}</button>
      </div>
      <div class="fr__pad" hidden>
        <button type="button" data-move="left" aria-label="Move left">${ICON.left}</button>
        <button type="button" data-move="jump" aria-label="Jump">${ICON.up}</button>
        <button type="button" data-move="slide" aria-label="Slide">${ICON.down}</button>
        <button type="button" data-move="right" aria-label="Move right">${ICON.right}</button>
      </div>
      <div class="fr__layer"><div class="fr__panel"></div></div>
      <div class="fr__toast" role="status" aria-live="polite"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector(".fr__canvas");
    this.hud = root.querySelector(".fr__hud");
    this.elScore = root.querySelector(".fr__score");
    this.elGears = root.querySelector(".fr__gears");
    this.elBest = root.querySelector(".fr__best");
    this.btnPause = root.querySelector('[data-act="pause"]');
    this.pad = root.querySelector(".fr__pad");
    this.layer = root.querySelector(".fr__layer");
    this.panel = root.querySelector(".fr__panel");
    this.toastEl = root.querySelector(".fr__toast");

    this.savedOverflow = [document.documentElement.style.overflow, document.body.style.overflow];
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("fr-open");
  }

  /* ---------- scene ---------- */
  buildScene() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.dprCap = this.coarse ? 2 : 2.5;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COL.bg);
    scene.fog = new THREE.Fog(COL.fog, 46, 150); // fades into the page white, far enough to stay crisp
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 170);
    this.camBase = new THREE.Vector3(0, 4.4, 8);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xdde2ec, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(4, 11, 6);
    sun.castShadow = true;
    const sm = this.coarse ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 14, bottom: -14, near: 1, far: 40 });
    sun.target.position.set(0, 0, -6);
    scene.add(sun, sun.target);
    this.sun = sun;

    const lam = (color, emissive = 0x000000, ei = 1) =>
      new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, flatShading: true });
    this.M = {
      floor: lam(COL.floor), lane: lam(COL.lane), dash: lam(COL.dash, COL.accent, 0.35),
      // A little self-light keeps the white hall white instead of grey in its shaded faces.
      wall: lam(COL.wall, COL.wall, 0.4), ceiling: lam(COL.ceiling, COL.ceiling, 0.42),
      pillar: lam(COL.pillar, COL.pillar, 0.25), beam: lam(COL.beam, COL.beam, 0.3), light: lam(COL.light, COL.light, 0.9),
      strip: lam(COL.accent, COL.accent, 0.8), rail: lam(COL.rail), roller: lam(COL.roller),
      robot: lam(COL.robot), robotMid: lam(COL.robotMid), robotDark: lam(COL.robotDark), accent: lam(COL.accent, COL.accent, 0.9),
      crate: lam(COL.crate), crateTop: lam(COL.crateTop), crateBand: lam(COL.accent, COL.accent, 0.25),
      arm: lam(COL.arm), armDark: lam(COL.armDark), laser: new THREE.MeshBasicMaterial({ color: 0x7d90ea }),
      bot: lam(COL.bot), botTop: lam(COL.botTop), botDark: lam(COL.botDark),
      blinkOn: new THREE.MeshBasicMaterial({ color: 0x8297f2 }), blinkOff: lam(COL.botDark),
      gap: new THREE.MeshBasicMaterial({ color: COL.gap }),
      gear: lam(COL.gear, 0x6f80d8, 0.35),
      blob: new THREE.MeshBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.18, depthWrite: false }),
      edge: new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.55 }),
      edgeSoft: new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.3 }),
    };
    this.gearGeo = gearGeometry();

    this.buildWorld();
    this.buildRobot();
    this.applyQuality();
  }

  mesh(mat, sx, sy, sz, x = 0, y = 0, z = 0, shadow = true, edge = this.edgeMat) {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    if (edge) m.add(new THREE.LineSegments(BOX_EDGES, edge)); // thin crisp outline
    return m;
  }

  cyl(mat, r, len, x, y, z, edge = this.edgeMat) {
    const m = new THREE.Mesh(CYL, mat);
    m.scale.set(r * 2, len, r * 2);
    m.rotation.z = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true;
    if (edge) m.add(new THREE.LineSegments(CYL_EDGES, edge));
    return m;
  }

  buildWorld() {
    const { scene, M } = this;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 170), M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -70;
    floor.receiveShadow = true;
    scene.add(floor);
    for (const x of LANES) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 170), M.lane);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(x, 0.003, -70);
      lane.receiveShadow = true;
      scene.add(lane);
    }
    // Closed ceiling: tall portrait views look up into it instead of empty sky.
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 170), M.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 7.4, -70);
    scene.add(ceil);
    for (const s of [-1, 1]) scene.add(this.mesh(M.strip, 0.1, 0.03, 170, 2.2 * s, 7.37, -70, false)); // ceiling light lines
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(170, 7.4), M.wall);
      wall.position.set(6 * s, 3.7, -70);
      wall.rotation.y = -s * Math.PI / 2;
      scene.add(wall);
      scene.add(this.mesh(M.rail, 1.3, 0.55, 170, 4.45 * s, 0.275, -70, false));
    }

    // Everything below repeats every PERIOD units and slides as one group.
    const scen = new THREE.Group();
    const zs = [];
    for (let z = 12; z >= -150; z -= 1) zs.push(z);
    const inst = (mat, sx, sy, sz, list, shadow = false) => {
      const im = new THREE.InstancedMesh(BOX, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.castShadow = shadow;
      scen.add(im);
    };
    const dashes = [], pillars = [], strips = [], beams = [], lights = [], rollers = [];
    for (const z of zs) {
      if (z % 4 === 0) for (const x of [-1.1, 1.1]) dashes.push([x, 0.012, z]);
      if (z % PERIOD === 0) {
        for (const s of [-1, 1]) { pillars.push([5.6 * s, 3.5, z]); strips.push([5.27 * s, 3.2, z]); }
        beams.push([0, 7.2, z]);
        lights.push([0, 6.95, z]);
      }
    }
    for (let z = 12; z >= -150; z -= 1.5) for (const s of [-1, 1]) rollers.push([4.45 * s, 0.58, z]);
    inst(M.dash, 0.06, 0.02, 1.5, dashes);
    inst(M.pillar, 0.6, 7, 0.6, pillars);
    inst(M.strip, 0.06, 4.6, 0.06, strips);
    inst(M.beam, 12, 0.35, 0.45, beams);
    inst(M.light, 3.2, 0.06, 0.5, lights);
    inst(M.roller, 1.25, 0.1, 0.22, rollers);
    scene.add(scen);
    this.scenery = scen;
  }

  buildRobot() {
    const { M } = this;
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x0c1024, transparent: true, opacity: 0.6 });
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.95;
    root.add(body);
    body.add(this.mesh(M.robot, 0.64, 0.72, 0.4, 0, 0.42, 0));
    body.add(this.mesh(M.robotMid, 0.66, 0.12, 0.42, 0, 0.08, 0));
    body.add(this.mesh(M.robotDark, 0.42, 0.44, 0.14, 0, 0.44, 0.26));      // back pack (faces camera)
    body.add(this.mesh(M.accent, 0.26, 0.05, 0.02, 0, 0.54, 0.335, false)); // pack light
    body.add(this.mesh(M.accent, 0.26, 0.07, 0.02, 0, 0.52, -0.21, false)); // chest light

    body.add(this.mesh(M.robotDark, 0.2, 0.18, 0.2, 0, 0.86, 0));            // neck
    const head = new THREE.Group();
    head.position.y = 0.94;
    head.add(this.mesh(M.robot, 0.5, 0.4, 0.44, 0, 0.2, 0));
    head.add(this.mesh(M.accent, 0.38, 0.11, 0.02, 0, 0.22, -0.225, false)); // visor
    for (const s of [-1, 1]) head.add(this.mesh(M.accent, 0.04, 0.14, 0.14, 0.27 * s, 0.2, 0, false));
    head.add(this.mesh(M.robotMid, 0.04, 0.22, 0.04, 0.12, 0.5, 0));
    head.add(this.mesh(M.accent, 0.09, 0.09, 0.09, 0.12, 0.63, 0, false));
    body.add(head);

    const limb = (x, y, len, w, mat) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      g.add(this.mesh(mat, w, len, w + 0.02, 0, -len / 2, 0));
      return g;
    };
    const armL = limb(-0.42, 0.72, 0.5, 0.15, M.robotMid);
    const armR = limb(0.42, 0.72, 0.5, 0.15, M.robotMid);
    armL.add(this.mesh(M.robotDark, 0.18, 0.16, 0.18, 0, -0.56, 0));
    armR.add(this.mesh(M.robotDark, 0.18, 0.16, 0.18, 0, -0.56, 0));
    const legL = limb(-0.17, 0, 0.86, 0.2, M.robotMid);
    const legR = limb(0.17, 0, 0.86, 0.2, M.robotMid);
    legL.add(this.mesh(M.robotDark, 0.24, 0.1, 0.34, 0, -0.9, -0.05));
    legR.add(this.mesh(M.robotDark, 0.24, 0.1, 0.34, 0, -0.9, -0.05));
    body.add(armL, armR, legL, legR);

    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), M.blob);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;

    this.scene.add(root, blob);
    this.robot = { root, body, head, armL, armR, legL, legR, blob };
    this.edgeMat = M.edge; // obstacles and mobile robots
  }

  /* ---------- pooled obstacles ---------- */
  make(type) {
    const { M } = this;
    const g = new THREE.Group();
    const parts = {};
    let h = 0.65;
    if (type === "crate" || type === "stack") {
      g.add(this.mesh(M.crate, 1.5, 1.1, 1.3, 0, 0.55, 0));
      g.add(this.mesh(M.crateBand, 1.52, 0.1, 1.32, 0, 0.78, 0, false));
      g.add(this.mesh(M.crateTop, 1.3, 0.04, 1.1, 0, 1.11, 0, false));
      if (type === "stack") {
        const top = new THREE.Group();
        top.position.set(0, 1.12, 0);
        top.rotation.y = 0.08;
        top.add(this.mesh(M.crate, 1.4, 1.05, 1.2, 0, 0.525, 0));
        top.add(this.mesh(M.crateBand, 1.42, 0.1, 1.22, 0, 0.74, 0, false));
        g.add(top);
      }
    } else if (type === "arm") {
      h = 0.3;
      for (const s of [-1, 1]) g.add(this.mesh(M.armDark, 0.2, 3.1, 0.24, 1.05 * s, 1.55, 0));
      g.add(this.mesh(M.armDark, 2.34, 0.22, 0.32, 0, 3.05, 0));
      g.add(this.mesh(M.laser, 2.1, 0.035, 0.035, 0, 1.22, 0, false)); // duck under this
      const pivot = new THREE.Group();
      pivot.position.set(0, 2.92, 0);
      pivot.add(this.mesh(M.robotDark, 0.32, 0.3, 0.38, 0, 0, 0));
      pivot.add(this.mesh(M.arm, 0.2, 0.84, 0.22, 0, -0.42, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -0.84;
      elbow.add(this.mesh(M.accent, 0.26, 0.26, 0.3, 0, 0, 0, false));
      elbow.add(this.mesh(M.arm, 0.18, 0.56, 0.2, 0, -0.3, 0));
      elbow.add(this.mesh(M.armDark, 0.52, 0.1, 0.26, 0, -0.62, 0));
      for (const s of [-1, 1]) elbow.add(this.mesh(M.arm, 0.07, 0.22, 0.22, 0.22 * s, -0.76, 0));
      pivot.add(elbow);
      g.add(pivot);
      parts.pivot = pivot;
      parts.elbow = elbow;
    } else if (type === "bot") {
      // Low wheeled AMR: flat chassis, four wheels, a small sensor mast.
      h = 0.7;
      g.add(this.mesh(M.bot, 1.3, 0.36, 1.4, 0, 0.36, 0));
      g.add(this.mesh(M.botTop, 1.14, 0.06, 1.2, 0, 0.57, 0, false));
      g.add(this.mesh(M.botDark, 1.32, 0.07, 1.42, 0, 0.21, 0, false, M.edgeSoft)); // bumper band
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(this.cyl(M.botDark, 0.17, 0.14, 0.66 * sx, 0.17, 0.45 * sz));
      g.add(this.mesh(M.botDark, 0.08, 0.26, 0.08, -0.32, 0.73, -0.3));                 // mast
      g.add(this.mesh(M.botDark, 0.24, 0.1, 0.16, -0.32, 0.88, -0.3));                  // lidar head
      g.add(this.mesh(M.accent, 0.62, 0.05, 0.03, 0, 0.42, 0.71, false));                // face light (toward player)
      const blink = [];
      for (const s of [-1, 1]) {
        const b = this.mesh(M.blinkOff, 0.12, 0.1, 0.12, 0.58 * s, 0.62, 0.62, false);
        b.visible = true; g.add(b); blink.push(b);
      }
      parts.blink = blink;
    } else if (type === "gap") {
      h = 1.5;
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), M.gap);
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.008;
      g.add(hole);
      for (const s of [-1, 1]) g.add(this.mesh(M.strip, 2.0, 0.03, 0.07, 0, 0.02, 1.5 * s, false));
    }
    g.userData = { type, h, parts };
    this.scene.add(g);
    return g;
  }

  spawnObstacle(type, lane, z) {
    const g = this.pools[type].pop() || this.make(type);
    g.visible = true;
    g.position.set(LANES[lane], 0, z);
    g.rotation.y = 0;
    const o = { g, type, lane, x: LANES[lane], z, h: g.userData.h, parts: g.userData.parts, phase: Math.random() * 6.28, passed: false };
    if (type === "bot") {
      o.bv = BOT_SPEED; o.turn = 0; o.to = lane; o.turnIn = 0.6 + Math.random() * 1.6; o.turned = 0;
      for (const b of o.parts.blink) b.material = this.M.blinkOff;
    }
    this.obstacles.push(o);
  }

  // A lane is free for a bot when nothing else sits near that stretch of it.
  laneFree(lane, z, self) {
    for (const o of this.obstacles) {
      if (o === self) continue;
      const occ = o.type === "bot" ? [o.lane, o.to] : [o.lane];
      if (occ.includes(lane) && Math.abs(o.z - z) < 9) return false;
    }
    return true;
  }

  updateBot(o, dt, v) {
    // Slow to belt speed rather than drive through something ahead in its lane.
    let blocked = false;
    for (const q of this.obstacles) {
      if (q === o || q.lane !== o.lane && (q.type !== "bot" || q.to !== o.lane)) continue;
      const dz = q.z - o.z;
      if (dz > 0 && dz < 4.5) { blocked = true; break; }
    }
    const want = blocked ? 0 : BOT_SPEED;
    o.bv += (want - o.bv) * Math.min(1, dt * 4);
    o.z += o.bv * dt;

    if (o.turn > 0) {
      o.turn -= dt;
      const on = Math.floor(o.turn / 0.1) % 2 === 0;
      const side = o.to > o.lane ? 1 : 0;
      o.parts.blink[side].material = on ? this.M.blinkOn : this.M.blinkOff;
      if (o.turn <= 0) { for (const b of o.parts.blink) b.material = this.M.blinkOff; o.lane = o.to; o.turned++; }
    } else {
      o.turnIn -= dt;
      if (o.turnIn <= 0 && o.turned < 2 && o.z < BOT_TURN_MIN_Z) {
        o.turnIn = 1 + Math.random() * 1.5;
        const opts = [o.lane - 1, o.lane + 1].filter((l) => l >= 0 && l <= 2 && this.laneFree(l, o.z, o));
        if (opts.length && Math.random() < 0.7) { o.to = pick(opts); o.turn = BOT_TURN_T; }
      }
    }
    const tx = LANES[o.lane];
    o.x += (tx - o.x) * Math.min(1, dt * 5);
    o.g.position.x = o.x;
    o.g.rotation.y = (o.x - tx) * 0.18; // a slight yaw while it steers
  }

  spawnGear(lane, z, y) {
    let m = this.pools.gear.pop();
    if (!m) { m = new THREE.Mesh(this.gearGeo, this.M.gear); m.castShadow = true; this.scene.add(m); }
    m.visible = true;
    m.scale.setScalar(1);
    m.position.set(LANES[lane], y, z);
    this.gears.push({ m, x: LANES[lane], y, z, taken: false, t: 0 });
  }

  spawnRow() {
    const z = SPAWN_Z;
    const diff = (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    // Mobile robots get their own row so they never close the last open lane:
    // at most two, and every bot is low enough to jump.
    if (this.runTime >= BOT_FROM && Math.random() < 0.18 + diff * 0.32) {
      const lanes = shuffle([0, 1, 2]);
      const n = diff > 0.45 && Math.random() < 0.4 ? 2 : 1;
      for (const ln of lanes.slice(0, n)) this.spawnObstacle("bot", ln, z - Math.random() * 3);
      if (Math.random() < 0.6) { const ln = lanes[2]; for (let i = 0; i < 5; i++) this.spawnGear(ln, z + 4.8 - i * 2.4, 1.0); }
      this.toNext = Math.max(16, this.speed * 0.7) + Math.random() * 10;
      return;
    }
    const n = Math.random() < 0.35 + diff * 0.35 ? 2 : 1; // never all three lanes
    const lanes = shuffle([0, 1, 2]);
    const types = diff < 0.15 ? ["crate", "gap", "arm"] : ["crate", "gap", "arm", "stack", "stack"];
    let crateLane = -1;
    for (const ln of lanes.slice(0, n)) {
      const t = pick(types);
      if (t === "crate") crateLane = ln;
      this.spawnObstacle(t, ln, z);
    }
    const roll = Math.random();
    if (crateLane >= 0 && roll < 0.35) {
      for (let i = 0; i < 5; i++) { const u = (i - 2) / 2; this.spawnGear(crateLane, z - u * 2.4, 1.0 + 1.3 * (1 - u * u)); }
    } else if (roll < 0.8) {
      const ln = pick(lanes.slice(n));
      for (let i = 0; i < 5; i++) this.spawnGear(ln, z + 4.8 - i * 2.4, 1.0);
    }
    this.toNext = Math.max(14, this.speed * 0.62) + Math.random() * 10;
  }

  clearWorld() {
    for (const o of this.obstacles) { o.g.visible = false; this.pools[o.type].push(o.g); }
    for (const g of this.gears) { g.m.visible = false; this.pools.gear.push(g.m); }
    this.obstacles.length = 0;
    this.gears.length = 0;
  }

  /* ---------- quality & sizing ---------- */
  applyQuality() {
    const levels = [
      { dpr: this.dprCap, shadow: true },
      { dpr: Math.min(this.dprCap, 1.75), shadow: true },
      { dpr: 1.25, shadow: false },
      { dpr: 1, shadow: false },
    ];
    const q = levels[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.sun.castShadow = q.shadow;
    this.resize();
  }

  resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const a = w / h;
    this.camera.aspect = a;
    // Portrait needs a wider, higher view so all three lanes stay on screen.
    if (a < 1) {
      const k = Math.max(0, Math.min(1, (a - 0.45) / 0.55));
      this.camera.fov = 78 - k * 18;
      this.camBase.set(0, 5.2 - k * 0.8, 9.2 - k * 1.2);
      this.lookY = 0.9 + (1 - k) * 1.1; // aim a little higher so the runner sits in the lower third
    } else {
      this.camera.fov = 58;
      this.camBase.set(0, 4.4, 8);
      this.lookY = 0.9;
    }
    this.camera.updateProjectionMatrix();
  }

  measure(dt) {
    if (this.state !== "play" || this.runTime < 2 || this.quality >= 3 || window.__frLockQuality) return;
    const f = this.fps;
    f.frames++; f.acc += dt;
    if (f.acc >= 2) {
      // Step down only on a real, sustained drop: two slow windows in a row.
      f.slow = f.frames / f.acc < 40 ? (f.slow || 0) + 1 : 0;
      if (f.slow >= 2) { this.quality++; f.slow = 0; this.applyQuality(); }
      f.frames = 0; f.acc = 0;
    }
  }

  /* ---------- input ---------- */
  bind() {
    this.onKey = (e) => {
      const typing = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (e.key === "Escape") {
        e.preventDefault();
        if (this.state === "play") this.pause();
        else if (this.state === "pause") this.resume();
        else this.close();
        return;
      }
      if (typing) return;
      const k = e.key.toLowerCase();
      if (this.state === "play") {
        const map = { arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "jump", w: "jump", " ": "jump", arrowdown: "slide", s: "slide" };
        if (map[k]) { e.preventDefault(); if (!e.repeat) this.act(map[k]); }
        else if (k === "p") this.pause();
      } else if (this.state === "pause" && k === "p") {
        this.resume();
      } else if (this.state === "over" && (k === "enter" || k === " ") && !(e.target && e.target.closest && e.target.closest("button"))) {
        e.preventDefault();
        this.startRun();
      }
    };
    window.addEventListener("keydown", this.onKey);

    // Swipes: fire as soon as the finger has moved far enough.
    this.onDown = (e) => {
      if (this.state !== "play" || e.target.closest("button, .fr__panel")) return;
      this.swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
    };
    this.onMove = (e) => {
      const s = this.swipe;
      if (!s || s.done || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      const th = Math.max(22, Math.min(window.innerWidth, window.innerHeight) * 0.045);
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      s.done = true;
      if (Math.abs(dx) > Math.abs(dy)) this.act(dx < 0 ? "left" : "right");
      else this.act(dy < 0 ? "jump" : "slide");
    };
    this.onUp = () => { this.swipe = null; };
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);

    // No page scroll, pull-to-refresh or pinch zoom while the game is open.
    this.onTouchMove = (e) => { if (!e.target.closest(".fr__panel")) e.preventDefault(); };
    this.root.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.onGesture = (e) => e.preventDefault();
    document.addEventListener("gesturestart", this.onGesture);
    this.root.addEventListener("dblclick", this.onGesture);

    this.pad.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("[data-move]");
      if (!b) return;
      e.preventDefault();
      if (this.state === "play") this.act(b.dataset.move);
    });
    this.root.querySelector(".fr__corner").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "close") this.close();
      if (b.dataset.act === "pause") this.state === "pause" ? this.resume() : this.pause();
    });
    this.panel.addEventListener("click", (e) => this.onPanelClick(e));
    this.panel.addEventListener("submit", (e) => this.onPanelSubmit(e));
    this.panel.addEventListener("focusin", (e) => {
      if (e.target.tagName === "INPUT") setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    });

    this.onVis = () => { if (document.hidden && this.state === "play") this.pause(); };
    document.addEventListener("visibilitychange", this.onVis);
    this.onBlur = () => { if (this.state === "play") this.pause(); };
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pagehide", this.onBlur);

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", this.onResize);
    if ("ResizeObserver" in window) { this.ro = new ResizeObserver(this.onResize); this.ro.observe(this.root); }

    // Back button closes the overlay instead of leaving the page.
    if (!this.opts.standalone) {
      history.pushState({ factoryRun: true }, "");
      this.onPop = () => this.close(true);
      window.addEventListener("popstate", this.onPop);
    }
  }

  act(move) {
    const r = this.r;
    if (move === "left") r.lane = Math.max(0, r.lane - 1);
    else if (move === "right") r.lane = Math.min(2, r.lane + 1);
    else if (move === "jump") {
      if (r.ground) { r.vy = JUMP_V; r.ground = false; r.slideT = 0; }
    } else if (move === "slide") {
      if (r.ground) r.slideT = SLIDE_T;
      else { r.vy = Math.min(r.vy, -16); r.queueSlide = true; }
    }
  }

  /* ---------- run lifecycle ---------- */
  startRun() {
    if (!this.profile) return this.showMenu();
    this.clearWorld();
    Object.assign(this.r, { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false });
    const R = this.robot;
    R.root.rotation.set(0, 0, 0);
    R.root.position.set(0, 0, 0);
    this.speed = START_SPEED;
    this.runTime = 0;
    this.score = 0;
    this.gearsRun = 0;
    this.toNext = 10;
    this.deathT = 0;
    this.fps.frames = 0; this.fps.acc = 0;
    this.shown = { score: -1, gears: -1 };
    this.elBest.textContent = fmt(this.profile.best);
    this.state = "play";
    this.hidePanel();
    this.hud.hidden = false;
    this.btnPause.hidden = false;
    this.pad.hidden = !this.settings.pad;
  }

  pause() {
    if (this.state !== "play") return;
    this.state = "pause";
    this.btnPause.setAttribute("aria-label", "Resume");
    this.pad.hidden = true;
    this.renderPanel(`
      <h2 class="fr__title">Paused</h2>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid" type="button" data-panel="resume">Resume</button>
        <button class="fr__btn" type="button" data-panel="menu">Quit run</button>
      </div>`);
  }

  resume() {
    if (this.state !== "pause") return;
    this.state = "play";
    this.btnPause.setAttribute("aria-label", "Pause");
    this.pad.hidden = !this.settings.pad;
    this.hidePanel();
    this.last = performance.now();
  }

  die(kind) {
    if (this.state !== "play") return;
    this.state = "dying";
    this.deathKind = kind;
    this.deathT = 0;
    this.deathSpeed = this.speed;
    this.shake = this.reduceMotion ? 0 : 0.35;
    this.btnPause.hidden = true;
    this.pad.hidden = true;
    navigator.vibrate?.(60);
  }

  endRun() {
    this.state = "over";
    this.hud.hidden = true;
    const score = Math.floor(this.score);
    const prevBest = this.profile.best;
    P.recordRun(this.profile, score, this.gearsRun);
    this.lastRun = { score, gears: this.gearsRun, time: this.runTime, best: score > prevBest && score > 0, rank: null };
    this.showOver();
    this.submitRun(score, Math.round(this.runTime * 1000));
  }

  async submitRun(score, durationMs) {
    if (!P.online()) return;
    if (durationMs >= 3000 && score > 0) {
      const res = await P.postScore(this.profile, score, durationMs);
      if (res.ok && res.data && res.data.rank && this.state === "over" && this.lastRun) {
        this.lastRun.rank = res.data.rank;
        this.showOver();
      } else if (res.status === 403) {
        this.toast("That name is claimed. Load its save code to post scores.");
      }
    }
    if (this.profile.code) {
      const s = await P.sync(this.profile);
      if (s.ok && s.data && s.data.profile) P.merge(this.profile, s.data.profile);
    }
    this.refreshBoard();
  }

  async refreshBoard() {
    if (!P.online()) { this.board = { status: "soon", rows: [] }; return; }
    const res = await P.topScores();
    this.board = res.ok && res.data && Array.isArray(res.data.scores)
      ? { status: "ok", rows: res.data.scores.slice(0, 10) }
      : { status: "soon", rows: [] };
    const b = this.panel.querySelector(".fr__board");
    if (b) b.outerHTML = this.boardHtml();
  }

  /* ---------- panels ---------- */
  renderPanel(html) {
    this.layer.hidden = false;
    this.panel.innerHTML = html;
    this.panel.scrollTop = 0;
    const f = this.panel.querySelector("[autofocus], .fr__btn--solid");
    if (f && !(this.coarse && f.tagName === "INPUT")) f.focus({ preventScroll: true });
  }

  hidePanel() {
    this.layer.hidden = true;
    this.panel.innerHTML = "";
  }

  boardHtml() {
    if (this.board.status === "loading") return `<div class="fr__board"><p class="fr__muted">Loading board…</p></div>`;
    if (this.board.status !== "ok") return `<div class="fr__board"><p class="fr__muted">Global leaderboard coming soon</p></div>`;
    if (!this.board.rows.length) return `<div class="fr__board"><p class="fr__label">Top 10</p><p class="fr__muted">No runs yet. Yours could be first.</p></div>`;
    const me = this.profile && this.profile.username.toLowerCase();
    return `<div class="fr__board"><p class="fr__label">Top 10</p><ol>${this.board.rows.map((r, i) =>
      `<li${me && r.username.toLowerCase() === me ? ' class="is-me"' : ""}><span>${i + 1}</span><span>${esc(r.username)}</span><span>${fmt(r.score)}</span></li>`).join("")}</ol></div>`;
  }

  controlsHint() {
    return this.coarse
      ? "Swipe left or right to switch lanes, up to jump, down to slide."
      : "Arrow keys or WASD. Space jumps, down slides.";
  }

  padToggleHtml() {
    return `<button class="fr__link" type="button" data-panel="pad">On-screen buttons: ${this.settings.pad ? "on" : "off"}</button>`;
  }

  showMenu(error = "") {
    this.state = "menu";
    this.hud.hidden = true;
    this.btnPause.hidden = true;
    this.pad.hidden = true;
    this.clearWorld();
    Object.assign(this.r, { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false });
    const p = this.profile;
    const links = [];
    let body;
    if (p && !this.switching) {
      body = `
        <p class="fr__lede">Welcome back, ${esc(p.username)}.</p>
        <p class="fr__muted">Best ${fmt(p.best)} · ${fmt(p.games)} ${p.games === 1 ? "run" : "runs"} · ${fmt(p.gears)} gears</p>
        <div class="fr__actions"><button class="fr__btn fr__btn--solid" type="button" data-panel="start">Start</button></div>`;
      links.push(`<button class="fr__link" type="button" data-panel="switch">Not you?</button>`);
      if (P.online()) {
        links.push(p.code
          ? `<span class="fr__note">Saved across devices</span>`
          : `<button class="fr__link" type="button" data-panel="claim">Save across devices</button>`);
      }
    } else {
      body = `
        <form class="fr__form" data-form="name" novalidate>
          <label class="fr__label" for="fr-name">Pick a name</label>
          <input id="fr-name" class="fr__input" name="username" type="text" inputmode="text" autocomplete="nickname"
            autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" minlength="3" maxlength="16"
            pattern="[A-Za-z0-9_]{3,16}" placeholder="robot_fan" value="${esc(this.switching ? "" : (p ? p.username : ""))}" autofocus />
          <p class="fr__hint${error ? " is-error" : ""}">${esc(error || (this.switching ? "A new name starts a new save on this device." : "3 to 16 letters, numbers or _"))}</p>
          <div class="fr__actions">
            <button class="fr__btn fr__btn--solid" type="submit">Start</button>
            ${this.switching ? '<button class="fr__btn" type="button" data-panel="unswitch">Back</button>' : ""}
          </div>
        </form>`;
    }
    if (P.online()) links.push(`<button class="fr__link" type="button" data-panel="restore">Load a save code</button>`);
    links.push(this.padToggleHtml());
    this.renderPanel(`
      <h2 class="fr__title">Factory run</h2>
      <p class="fr__sub">Run the floor, collect gears, stay clear of the machines.</p>
      ${body}
      <p class="fr__muted fr__controls">${this.controlsHint()}</p>
      <div class="fr__links">${links.join("")}</div>
      ${this.boardHtml()}`);
  }

  showOver() {
    const r = this.lastRun;
    const head = this.deathKind === "fall" ? "Fell through the line" : "Run over";
    const links = [];
    if (P.online() && !this.profile.code) links.push(`<button class="fr__link" type="button" data-panel="claim">Save across devices</button>`);
    links.push(this.padToggleHtml());
    this.renderPanel(`
      <p class="fr__label">${head}</p>
      <p class="fr__big">${fmt(r.score)}</p>
      <p class="fr__lede">${r.best ? "New best." : `Best ${fmt(this.profile.best)}`}${r.rank ? ` · #${r.rank} on the board` : ""}</p>
      <p class="fr__muted">${fmt(r.gears)} gears · ${clock(r.time)}</p>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid" type="button" data-panel="start">Run again</button>
        <button class="fr__btn" type="button" data-panel="menu">Menu</button>
      </div>
      <div class="fr__links">${links.join("")}</div>
      ${this.boardHtml()}`);
  }

  showRestore(error = "") {
    this.state = "menu";
    this.renderPanel(`
      <h2 class="fr__title">Load a save code</h2>
      <p class="fr__sub">Enter the name and the 10-character code you were given.</p>
      <form class="fr__form" data-form="restore" novalidate>
        <label class="fr__label" for="fr-rname">Name</label>
        <input id="fr-rname" class="fr__input" name="username" type="text" autocomplete="username" autocapitalize="off"
          autocorrect="off" spellcheck="false" enterkeyhint="next" maxlength="16" />
        <label class="fr__label" for="fr-code">Save code</label>
        <input id="fr-code" class="fr__input fr__input--code" name="code" type="text" autocomplete="off" autocapitalize="characters"
          autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="12" placeholder="ABCDE23456" />
        <p class="fr__hint${error ? " is-error" : ""}">${esc(error || "Letters and numbers, no spaces needed.")}</p>
        <div class="fr__actions">
          <button class="fr__btn fr__btn--solid" type="submit">Load</button>
          <button class="fr__btn" type="button" data-panel="menu">Back</button>
        </div>
      </form>`);
  }

  showClaim(error = "") {
    const from = this.state;
    this.claimFrom = from === "over" ? "over" : "menu";
    this.renderPanel(`
      <h2 class="fr__title">Save across devices</h2>
      <p class="fr__sub">Claim <b class="fr__name">${esc(this.profile.username)}</b> and get a save code. Use it to load this profile on another device.</p>
      <p class="fr__hint${error ? " is-error" : ""}">${esc(error || "No email or password. Just the code.")}</p>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid" type="button" data-panel="doclaim">Claim name</button>
        <button class="fr__btn" type="button" data-panel="back">Back</button>
      </div>`);
  }

  showCode(code) {
    const pretty = `${code.slice(0, 5)} ${code.slice(5)}`;
    this.renderPanel(`
      <p class="fr__label">Your save code</p>
      <p class="fr__code">${esc(pretty)}</p>
      <p class="fr__sub">Write this down. It's the only way to load ${esc(this.profile.username)} on another device, and it won't be shown again.</p>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid" type="button" data-panel="back">I've saved it</button>
        <button class="fr__btn" type="button" data-panel="copy" data-code="${esc(code)}">Copy</button>
      </div>`);
  }

  async onPanelClick(e) {
    const b = e.target.closest("[data-panel]");
    if (!b) return;
    const a = b.dataset.panel;
    if (a === "start") this.startRun();
    else if (a === "resume") this.resume();
    else if (a === "menu") { this.switching = false; this.showMenu(); }
    else if (a === "switch") { this.switching = true; this.showMenu(); }
    else if (a === "unswitch") { this.switching = false; this.showMenu(); }
    else if (a === "restore") this.showRestore();
    else if (a === "claim") { if (this.state === "over") this.claimFrom = "over"; this.showClaim(); }
    else if (a === "back") { if (this.claimFrom === "over" && this.lastRun) { this.state = "over"; this.showOver(); } else this.showMenu(); }
    else if (a === "pad") {
      this.settings.pad = !this.settings.pad;
      P.setSetting("pad", this.settings.pad);
      b.textContent = `On-screen buttons: ${this.settings.pad ? "on" : "off"}`;
    } else if (a === "copy") {
      try { await navigator.clipboard.writeText(b.dataset.code); this.toast("Copied"); } catch { this.toast("Couldn't copy. Write it down instead."); }
    } else if (a === "doclaim") {
      b.disabled = true;
      const res = await P.claim(this.profile);
      if (res.ok && res.data && res.data.code) {
        this.profile.code = res.data.code;
        P.save(this.profile);
        this.showCode(res.data.code);
      } else {
        b.disabled = false;
        const msg = res.status === 409 ? "That name is already claimed. Load its code, or start a new name."
          : res.status === 429 ? "Too many tries. Give it a minute."
          : res.offline ? "Couldn't reach the server. Try again shortly."
          : (res.data && res.data.error) || "That didn't work.";
        this.showClaim(msg);
      }
    }
  }

  async onPanelSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.form === "name") {
      const name = form.username.value.trim();
      const err = P.checkName(name);
      if (err) return this.showMenu(err);
      document.activeElement?.blur?.();
      if (!this.profile || this.profile.username !== name) this.profile = P.create(name);
      this.switching = false;
      this.startRun();
    } else if (form.dataset.form === "restore") {
      const name = form.username.value.trim();
      const code = form.code.value;
      if (P.checkName(name) || !P.isCode(code)) return this.showRestore("Check the name and the 10-character code.");
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      const res = await P.restore(name, code);
      if (res.ok && res.data && res.data.profile) {
        const rp = res.data.profile;
        const same = this.profile && this.profile.username.toLowerCase() === rp.username.toLowerCase();
        const base = same ? this.profile : P.create(rp.username);
        base.username = rp.username;
        base.code = P.cleanCode(code);
        this.profile = P.merge(base, rp);
        this.switching = false;
        document.activeElement?.blur?.();
        this.toast(`Loaded ${rp.username}`);
        this.showMenu();
        this.refreshBoard();
      } else {
        this.showRestore(res.status === 401 ? "That name and code don't match."
          : res.status === 429 ? "Too many tries. Give it a minute."
          : "Couldn't reach the server. Try again shortly.");
      }
    }
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("is-on");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove("is-on"), 2800);
  }

  /* ---------- frame ---------- */
  loop(now) {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.measure(dt);
  }

  update(dt) {
    const st = this.state;
    if (st === "pause") return;
    this.t += dt;
    const r = this.r, R = this.robot;

    let v = 0;
    if (st === "play") {
      this.runTime += dt;
      this.speed = Math.min(MAX_SPEED, START_SPEED + ACCEL * this.runTime);
      v = this.speed;
    } else if (st === "dying") {
      this.deathT += dt;
      v = this.deathSpeed * Math.max(0, 1 - this.deathT * 3);
      if (this.deathT > 0.95) this.endRun();
    } else if (st === "menu") {
      v = 4;
    }

    this.dist += v * dt;
    this.scenery.position.z = this.dist % PERIOD;
    if (st === "play") this.score += v * dt * DIST_POINTS;

    // Robot physics
    if (st === "play") {
      r.x += (LANES[r.lane] - r.x) * Math.min(1, dt * 14);
      if (!r.ground) {
        r.vy += GRAVITY * dt;
        r.y += r.vy * dt;
        if (r.y <= 0) {
          r.y = 0; r.vy = 0; r.ground = true;
          if (r.queueSlide) { r.slideT = SLIDE_T; r.queueSlide = false; }
        }
      }
      if (r.slideT > 0) r.slideT -= dt;
    }
    const sliding = r.slideT > 0 && r.y < 0.3;

    // Obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      const zPrev = o.z;
      o.z += v * dt;
      if (o.type === "bot" && st !== "menu") this.updateBot(o, st === "play" ? dt : 0, v);
      o.g.position.z = o.z;
      if (o.parts.pivot) {
        o.parts.pivot.rotation.z = Math.sin(this.t * 2.4 + o.phase) * 0.5;
        o.parts.elbow.rotation.z = Math.sin(this.t * 2.4 + o.phase + 1.2) * 0.45;
      }
      if (st === "play" && !o.passed && Math.abs(r.x - o.x) < 0.95) {
        const h = o.h + 0.25;
        if (zPrev - h <= 0 && o.z + h >= 0) {
          if (o.type === "crate" && r.y < 1.05) this.die("crash");
          else if (o.type === "stack") this.die("crash");
          else if (o.type === "bot" && r.y < 0.95) this.die("crash");
          else if (o.type === "arm" && !sliding) this.die("crash");
          else if (o.type === "gap" && r.y < 0.06 && Math.abs(o.z) < o.h - 0.35) this.die("fall");
        }
      }
      if (o.z - o.h > 0.5) o.passed = true;
      if (o.z > DESPAWN_Z) { o.g.visible = false; this.pools[o.type].push(o.g); this.obstacles.splice(i, 1); }
    }

    // Gears
    const top = r.y + (sliding ? 0.8 : 1.9);
    for (let i = this.gears.length - 1; i >= 0; i--) {
      const g = this.gears[i];
      const zPrev = g.z;
      g.z += v * dt;
      if (g.taken) {
        g.t += dt;
        g.m.position.y += dt * 7;
        g.m.scale.setScalar(Math.max(0.01, 1 - g.t * 4));
        if (g.t > 0.25) { g.m.visible = false; this.pools.gear.push(g.m); this.gears.splice(i, 1); continue; }
      } else {
        g.m.rotation.y = this.t * 3 + g.x;
        if (st === "play" && Math.abs(r.x - g.x) < 0.9 && zPrev - 0.6 <= 0 && g.z + 0.6 >= 0 && g.y + 0.4 > r.y && g.y - 0.4 < top) {
          g.taken = true;
          this.gearsRun++;
          this.score += GEAR_POINTS;
        }
      }
      g.m.position.z = g.z;
      if (g.z > DESPAWN_Z) { g.m.visible = false; this.pools.gear.push(g.m); this.gears.splice(i, 1); }
    }

    if (st === "play") {
      this.toNext -= v * dt;
      if (this.toNext <= 0) this.spawnRow();
    }

    this.animateRobot(dt, v, sliding);
    this.updateCamera(dt);

    if (st === "play") {
      const s = Math.floor(this.score);
      if (s !== this.shown.score) { this.shown.score = s; this.elScore.textContent = fmt(s); }
      if (this.gearsRun !== this.shown.gears) { this.shown.gears = this.gearsRun; this.elGears.textContent = this.gearsRun; }
    }
  }

  animateRobot(dt, v, sliding) {
    const R = this.robot, r = this.r, st = this.state;
    const k = Math.min(1, dt * 12);
    R.root.position.x = r.x;
    R.blob.position.x = r.x;

    if (st === "menu") {
      // Faces the camera and idles.
      R.root.rotation.y += (Math.PI - R.root.rotation.y) * Math.min(1, dt * 4);
      R.root.rotation.x = 0;
      R.root.position.y = 0;
      R.body.position.y = 0.95 + Math.sin(this.t * 2.2) * 0.02;
      R.body.rotation.x = 0;
      R.legL.rotation.x = R.legR.rotation.x = 0;
      R.armL.rotation.x = 0;
      R.armR.rotation.x = 0;
      R.armR.rotation.z = 2.6 + Math.sin(this.t * 5) * 0.35;
      R.armL.rotation.z = -0.1;
      R.head.rotation.y = Math.sin(this.t * 0.9) * 0.25;
      R.blob.scale.setScalar(1);
      return;
    }
    R.root.rotation.y += (0 - R.root.rotation.y) * Math.min(1, dt * 10);
    R.armR.rotation.z += (0 - R.armR.rotation.z) * k;
    R.armL.rotation.z += (0 - R.armL.rotation.z) * k;
    R.head.rotation.y += (0 - R.head.rotation.y) * k;

    if (st === "dying") {
      if (this.deathKind === "fall") {
        R.root.position.y -= dt * (2 + this.deathT * 14);
        R.root.rotation.x += (0.5 - R.root.rotation.x) * k;
      } else {
        R.root.position.y = Math.max(0, R.root.position.y - dt * 4);
        R.root.rotation.x += (1.35 - R.root.rotation.x) * Math.min(1, dt * 7);
      }
      R.blob.scale.setScalar(Math.max(0.01, 1 - this.deathT));
      return;
    }
    if (st !== "play") return;

    R.root.position.y = r.y;
    R.root.rotation.x = 0;
    const phase = this.t * (6 + v * 0.28);
    const swing = r.ground ? Math.sin(phase) * 0.85 : 0.4;
    if (sliding) {
      R.body.rotation.x += (-1.05 - R.body.rotation.x) * k;
      R.body.position.y += (0.42 - R.body.position.y) * k;
      R.legL.rotation.x += (1.2 - R.legL.rotation.x) * k;
      R.legR.rotation.x += (1.0 - R.legR.rotation.x) * k;
      R.armL.rotation.x += (-0.6 - R.armL.rotation.x) * k;
      R.armR.rotation.x += (-0.6 - R.armR.rotation.x) * k;
    } else {
      R.body.rotation.x += ((r.ground ? 0.12 : -0.05) - R.body.rotation.x) * k;
      R.body.position.y = 0.95 + (r.ground ? Math.abs(Math.sin(phase)) * 0.06 : 0);
      R.legL.rotation.x = r.ground ? swing : -0.5;
      R.legR.rotation.x = r.ground ? -swing : 0.3;
      R.armL.rotation.x = r.ground ? -swing * 0.9 : -2.4;
      R.armR.rotation.x = r.ground ? swing * 0.9 : -2.4;
    }
    R.blob.scale.setScalar(Math.max(0.35, 1 - r.y * 0.3));
  }

  updateCamera(dt) {
    const c = this.camera, b = this.camBase;
    const tx = this.r.x * 0.45;
    c.position.x += (tx - c.position.x) * Math.min(1, dt * 6);
    c.position.y = b.y;
    c.position.z = b.z;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      c.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      c.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    c.lookAt(this.r.x * 0.3, this.lookY ?? 0.9, -10);
  }

  /* ---------- teardown ---------- */
  close(fromPop = false) {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    document.removeEventListener("visibilitychange", this.onVis);
    document.removeEventListener("gesturestart", this.onGesture);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pagehide", this.onBlur);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener("resize", this.onResize);
    this.ro?.disconnect();
    if (this.onPop) window.removeEventListener("popstate", this.onPop);

    this.scene.traverse((o) => { if (o.geometry && o.geometry !== BOX) o.geometry.dispose(); });
    Object.values(this.M).forEach((m) => m.dispose());
    this.gearGeo.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.root.remove();
    document.documentElement.style.overflow = this.savedOverflow[0];
    document.body.style.overflow = this.savedOverflow[1];
    document.documentElement.classList.remove("fr-open");
    current = null;

    if (this.opts.standalone) { location.href = this.opts.exitUrl || "../"; return; }
    if (!fromPop && history.state && history.state.factoryRun) history.back();
    this.prevFocus?.focus?.({ preventScroll: true });
  }
}
