// three.js scene, meshes, quality ladder, robot animation, camera, trails.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import * as MT from "../../meta.js?v=20261021r7";
import { Factory } from "../../factory.js?v=20261021r7";
import { Ceiling } from "../../ceiling.js?v=20261021r7";
import { UI3D } from "../../ui3d.js?v=20261021r7";
import { createKit, RUNNERS, ROLLERS } from "../../robots/index.js?v=20261021r7";
import { toolMaterials, toolGeometries, buildTool, Burst } from "../../tools.js?v=20261021r7";
import { LANES, MORPH_T, COL, MILESTONES, visY, REVIVE_T } from "../core/constants.js?v=20261021r7";
import { BOX, BOX_EDGES, CYL, CYL_EDGES, gearGeometry, mergeParts } from "./geometry.js?v=20261021r7";
import { applyGrade, regrade } from "./grade.js?v=20261021r7";
import { makeArmKit } from "./arm.js?v=20261021r7";

export class Render {
  /* ---------- scene ---------- */
  buildScene() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.dprCap = 2; // min(dpr, 2) everywhere: 3x phones drew 2.25x the pixels for no visible gain (mobile pass)

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COL.bg);
    scene.fog = new THREE.Fog(COL.fog, 46, 150); // fades into the page white, far enough to stay crisp
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 175); // near 0.3 (was 0.1): 3x the depth precision, no far-floor z-fight on 24-bit mobile depth
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
    // Soft fill from the other side so the far wall and the robot's shaded side stay light.
    const fill = new THREE.DirectionalLight(0xeef1ff, 0.65);
    fill.position.set(-6, 7, 3);
    scene.add(fill);

    const lam = (color, emissive = 0x000000, ei = 1) =>
      new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, flatShading: true });
    this.M = {
      floor: Object.assign(lam(COL.floor), { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1 }), lane: Object.assign(lam(COL.lane), { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2 }), dash: lam(COL.dash, COL.accent, 0.35),
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
    this.kit = createKit(renderer, { lite: this.lite });
    this.armKit = makeArmKit(renderer, this.kit.env, this.lite);
    // 3D hints and countdown (an overlay scene drawn after the hall); 2D fallback at the lowest quality.
    this.ui = new UI3D(renderer, { still: this.reduceMotion, container: this.canvas.parentNode });

    this.buildWorld();
    this.buildRobot();
    this.buildToken();
    this.buildTools();
    this.buildGhost();
    this.buildTrail();
    this.applyTrim();
    this.applyCos();
    this.applyQuality();
    applyGrade(this); // lighting + colour grade (grade.js)
    this.applyDesign(); // Garage paint/finish/plate on top of the graded shell (r7)
    this.initBend(); // turns + climbs: one shared bend uniform on every world material (track.js)
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
    // The hall itself (floor, roof, walls, the shop-floor zones either side) lives in factory.js.
    this.factory = new Factory(scene);
    this.factory.noEdges = this.coarse; // hairline edges crawl (shimmer) at phone sizes; the grade's rim light carries the shapes
    // The three lanes share one material: one merged plane, one draw.
    const laneGeo = new THREE.PlaneGeometry(1.9, 190);
    const lane = new THREE.Mesh(mergeParts(LANES.map((x) => ({ geo: laneGeo, mx: new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, 0.003, -78) }))), M.lane);
    laneGeo.dispose();
    lane.receiveShadow = true;
    lane.renderOrder = -1;
    scene.add(lane);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 190), M.floor);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, 0.002, -78);
    bed.receiveShadow = true;
    bed.renderOrder = -2;
    scene.add(bed);
    // Roof trusses, cranes and the body conveyors overhead (ceiling.js). They replace round 3's flat light strips.
    this.ceiling = new Ceiling(scene);
    // Both side rails (and their outlines) in one mesh + one line set.
    const rails = [-1, 1].map((s) => this.mesh(M.rail, 1.3, 0.55, 190, 4.45 * s, 0.275, -78, false));
    for (const r of rails) r.updateMatrix();
    scene.add(new THREE.Mesh(mergeParts(rails.map((r) => ({ geo: BOX, mx: r.matrix }))), M.rail));
    if (this.edgeMat) scene.add(new THREE.LineSegments(mergeParts(rails.map((r) => ({ geo: BOX_EDGES, mx: r.matrix }))), this.edgeMat));

    // Line furniture repeats every PERIOD units and slides as one group.
    const scen = new THREE.Group();
    const inst = (mat, sx, sy, sz, list, shadow = false) => {
      const im = new THREE.InstancedMesh(BOX, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.castShadow = shadow;
      scen.add(im);
    };
    const dashes = [], rollers = [];
    for (let z = 12; z >= -168; z -= 1) {
      if (z % 4 === 0) for (const x of [-1.1, 1.1]) dashes.push([x, 0.012, z]);
    }
    for (let z = 12; z >= -168; z -= 1.5) for (const s of [-1, 1]) rollers.push([4.45 * s, 0.58, z]);
    inst(M.dash, 0.06, 0.02, 1.5, dashes);
    inst(M.roller, 1.25, 0.1, 0.22, rollers);
    scene.add(scen);
    this.scenery = scen;
  }

  buildRobot() {
    // Runner and roller come from the robot registry (game/robots/). The player
    // container moves; the two forms inside it swap during the wheel power-up.
    const root = new THREE.Group();
    const runner = this.kit.build(RUNNERS, this.settings.robot);
    const roller = this.kit.build(ROLLERS, this.settings.roller);
    roller.root.visible = false;
    root.add(runner.root, roller.root);

    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), this.M.blob);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;

    // Transform flash: two periwinkle rings that open out and fade.
    const flashMat = new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: 0, depthWrite: false });
    const flash = new THREE.Group();
    for (const r of [0.55, 0.8]) flash.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 40), flashMat));
    flash.visible = false;
    root.add(flash);
    this.M.flash = flashMat;

    this.scene.add(root, blob);
    this.robot = { root, runner, roller, blob, flash, form: "runner" };
    this.edgeMat = this.M.edge; // obstacles and mobile robots keep their thin outline
  }

  // The wheel token: a glowing periwinkle wheel in a soft halo. One at a time.
  buildToken() {
    const g = new THREE.Group();
    const glow = new THREE.MeshBasicMaterial({ color: 0xa9bcff });
    const deep = new THREE.MeshBasicMaterial({ color: 0x6f84e0 });
    const white = new THREE.MeshBasicMaterial({ color: 0xf4f6fb });
    const halo = new THREE.MeshBasicMaterial({ color: 0xa9bcff, transparent: true, opacity: 0.28, depthWrite: false });
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.085, 12, 36), glow));
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 18).rotateX(Math.PI / 2), white));
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.2, 3, 8), deep);
      const a = (i / 5) * Math.PI * 2;
      sp.position.set(Math.sin(a) * 0.17, Math.cos(a) * 0.17, 0);
      sp.rotation.z = -a;
      wheel.add(sp);
    }
    g.add(wheel);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), halo);
    g.add(h);
    const ringM = new THREE.MeshBasicMaterial({ color: 0xa9bcff, transparent: true, opacity: 0.5, depthWrite: false });
    const floorRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), ringM);
    floorRing.rotation.x = -Math.PI / 2;
    g.add(floorRing);
    g.visible = false;
    this.scene.add(g);
    Object.assign(this.M, { tokGlow: glow, tokDeep: deep, tokWhite: white, tokHalo: halo, tokRing: ringM });
    this.tokenMesh = { g, wheel, halo: h, floorRing };
  }

  /* ---------- tools ---------- */
  buildTools() {
    this.TM = toolMaterials();
    this.TG = toolGeometries();
    for (const k of ["screw", "wrench", "drill", "hammer", "gold", "rail", "ramp"]) this.pools[k] = [];
    this.rails = []; this.ramps = [];
    this.burst = new Burst(this.scene, this.TM, this.TG, this.gearGeo, 56);
    this.buildInstances();
    this.burst.scale = this.coarse ? 0.6 : 1;
    // Held props: the hammer and the drill ride in the runner's right hand while active.
    const grip = this.robot.runner.joints?.armR?.grip;
    this.props = {};
    for (const k of ["hammer", "drill"]) {
      const m = buildTool(k, this.TM, this.TG, { pickup: false });
      m.scale.setScalar(k === "hammer" ? 0.9 : 0.75);
      if (k === "hammer") m.rotation.set(Math.PI, 0, 0); else m.rotation.set(0, Math.PI / 2, -Math.PI / 2);
      m.userData.spin.rotation.set(0, 0, 0);
      if (k === "hammer") { this.hammerMat = this.TM.steel.clone(); m.traverse((o) => { if (o.material === this.TM.steel) o.material = this.hammerMat; }); }
      m.visible = false;
      (grip || this.robot.root).add(m);
      this.props[k] = m;
    }
    // Personal-best line on the floor: where, at this pace, the run passes the old best.
    const pbm = new THREE.MeshBasicMaterial({ color: 0x5a6dcd, transparent: true, opacity: 0.85, depthWrite: false });
    const pb = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 0.14), pbm);
    bar.rotation.x = -Math.PI / 2; bar.position.y = 0.02;
    pb.add(bar);
    for (const sx of [-1, 1]) pb.add(this.mesh(this.M.strip, 0.08, 1.1, 0.08, 3.5 * sx, 0.55, 0, false));
    pb.visible = false;
    this.scene.add(pb);
    this.pbLine = pb;
    this.M.pbLine = pbm;
  }

  // Milestone trims: the runner's light strips take the colour of the best badge you chose.
  applyTrim() {
    const best = this.profile ? this.profile.best : 0;
    const cos = MT.cosClean(this.profile && this.profile.cos);
    const m = MILESTONES.find((x) => x.id === this.settings.trim && best >= x.at) || MT.SHOP.find((x) => x.kind === "trim" && x.id === this.settings.trim && cos.owned.includes(x.id));
    const KM = this.kit.M;
    KM.light.color.setHex(m ? m.light : 0x3ddcff);
    KM.lightDeep.color.setHex(m ? m.deep : 0x1fa9cc);
    if (this.rig) { KM.light.userData.graded = KM.lightDeep.userData.graded = false; regrade(this); }
  }

  /* ---------- instanced pickups ---------- */
  // Gears and screws are the most repeated things on the belt (a ramp arc is 10+ gears, a screw line 3-4
  // screws of 6 parts). Each one is a bare transform in the scene (pooled, moved by the sim exactly as
  // before); one InstancedMesh per part draws them all: gears 1 draw (+1 shadow on desktop), screws 3.
  buildInstances() {
    const G = this.TG, TM = this.TM, S = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const at = (geo, x, y, z, rx = 0) => ({ geo, mx: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, 0, 0)), new THREE.Vector3(1, 1, 1)) });
    const steel = mergeParts([at(G.hex, 0, 0.17, 0), at(G.shaft, 0, -0.04, 0)]);
    const navy = mergeParts([0, 1, 2].map((i) => at(G.thread, 0, 0.06 - i * 0.09, 0, Math.PI / 2)));
    S.identity();
    const im = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); return m; };
    this.inst = { gear: im(this.gearGeo, this.M.gear, 96), steel: im(steel, TM.steel, 32), navy: im(navy, TM.navy, 32), halo: im(G.halo, TM.halo, 32) };
    this.inst.halo.renderOrder = 0;
    this.scene.onBeforeRender = () => this.syncInstances(); // after the scene's matrix update, before the shadow pass
  }

  // Same transform tree buildTool("screw") makes, minus the meshes.
  screwProxy() {
    const g = new THREE.Group(), spin = new THREE.Object3D(), halo = new THREE.Object3D();
    spin.rotation.z = 0.5; spin.scale.setScalar(1.25); halo.scale.setScalar(0.55);
    g.add(spin, halo);
    g.userData = { spin, halo, proxy: true };
    return g;
  }

  // Copies live transforms into the instance buffers. No allocation; grows a buffer only past its size.
  syncInstances() {
    const I = this.inst;
    if (!I) return;
    let n = 0;
    for (const g of this.gears) if (g.m.visible) { if (n >= I.gear.instanceMatrix.count) this.growInst("gear"); g.m.matrixWorld.toArray(I.gear.instanceMatrix.array, n++ * 16); }
    I.gear.count = n; I.gear.visible = n > 0; I.gear.instanceMatrix.needsUpdate = true;
    I.gear.castShadow = this.gearShadow !== false;
    n = 0;
    for (const it of this.items) {
      if (it.kind !== "screw" || !it.g.visible) continue;
      if (n >= I.steel.instanceMatrix.count) { this.growInst("steel"); this.growInst("navy"); this.growInst("halo"); }
      const u = it.g.userData;
      u.spin.matrixWorld.toArray(I.steel.instanceMatrix.array, n * 16);
      u.spin.matrixWorld.toArray(I.navy.instanceMatrix.array, n * 16);
      u.halo.matrixWorld.toArray(I.halo.instanceMatrix.array, n * 16);
      n++;
    }
    for (const k of ["steel", "navy", "halo"]) { I[k].count = n; I[k].visible = n > 0; I[k].instanceMatrix.needsUpdate = true; }
  }

  growInst(k) {
    const old = this.inst[k], m = new THREE.InstancedMesh(old.geometry, old.material, old.instanceMatrix.count * 2);
    m.instanceMatrix.array.set(old.instanceMatrix.array);
    m.frustumCulled = false; m.castShadow = old.castShadow; m.renderOrder = old.renderOrder; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.remove(old); old.dispose(); this.scene.add(m); this.inst[k] = m;
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
    this.factory.setQuality(this.quality);
    this.ceiling.setQuality(this.quality);
    if (this.quality >= 2 && !this.lite) this.useLiteKit();
    // Dropping to the flat fallback mid-hint moves the hint across too.
    if (!this.use3d && this.ui && this.ui.hint.on) { const id = this.tipNow; this.ui.hint.on = false; this.ui.hint.g.visible = false; if (id) { this.tipNow = null; this.showTip(id, this.tipLeft, true); } }
    this.resize();
  }

  // Swap both robot forms onto the lighter kit (standard instead of physical shells).
  useLiteKit() {
    this.lite = true;
    const R = this.robot, old = [R.runner, R.roller], oldKit = this.kit;
    this.kit = createKit(this.renderer, { lite: true });
    const runner = this.kit.build(RUNNERS, this.settings.robot);
    const roller = this.kit.build(ROLLERS, this.settings.roller);
    for (const [o, n] of [[R.runner, runner], [R.roller, roller]]) {
      n.root.visible = o.root.visible;
      n.root.scale.copy(o.root.scale);
      n.root.rotation.copy(o.root.rotation);
      R.root.remove(o.root);
      R.root.add(n.root);
    }
    R.runner = runner; R.roller = roller;
    for (const o of old) o.dispose();
    oldKit.dispose();
    if (this.plateTex) this.applyDesign();
  }

  resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    // One rotation or URL-bar slide fires window resize, visualViewport resize and the ResizeObserver together;
    // re-assigning the same canvas size still throws the drawing buffer away, so only a real change does work.
    const pr = this.renderer.getPixelRatio(), sz = this.sized || (this.sized = { w: 0, h: 0, pr: 0 });
    if (w === sz.w && h === sz.h && pr === sz.pr) return;
    sz.w = w; sz.h = h; sz.pr = pr;
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
    if (this.ui) { this.ui.resize(w, h); this.placeTipSub(); }
  }

  // 3D hints and countdown unless quality has dropped to its last step.
  get use3d() { return this.quality < 3 && !window.__frFlatUi; }

  // Trail colour and hammer skin from what's worn.
  applyCos() {
    const eq = MT.cosClean(this.profile && this.profile.cos).eq;
    const tr = MT.SHOP.find((x) => x.id === eq.trail), hm = MT.SHOP.find((x) => x.id === eq.hammer);
    this.trailOn = !!tr;
    if (tr && this.trail) this.trail.mat.color.setHex(tr.color);
    if (this.hammerMat) this.hammerMat.color.setHex(hm ? hm.color : 0xc9cfde);
    if (this.rig) { if (this.hammerMat) this.hammerMat.userData.graded = false; this.trail.mat.userData.graded = false; regrade(this); }
  }

  // Garage design (r7): paint and finish on the shell, plate text + pattern on the chassis plate.
  // One shared CanvasTexture, redrawn only when the design changes (never per frame).
  applyDesign(code) {
    const d = MT.designParts(code ?? (MT.cosClean(this.profile && this.profile.cos).d || {}).code), KM = this.kit && this.kit.M;
    if (!KM) return;
    const [, hex] = MT.PAINTS[d.paint], [, rough, cc] = MT.FINISHES[d.finish];
    // The graded default shell colours, kept per kit (the lite kit is a fresh set).
    const p0 = KM.pearl.userData.paint0 || (KM.pearl.userData.paint0 = { pearl: KM.pearl.color.getHex(), shade: KM.pearlShade.color.getHex(), rough: [KM.pearl.roughness, KM.pearlShade.roughness] });
    KM.pearl.color.setHex(d.paint === 0 ? p0.pearl : hex);
    KM.pearlShade.color.setHex(d.paint === 0 ? p0.shade : new THREE.Color(hex).multiplyScalar(0.82).getHex());
    [KM.pearl, KM.pearlShade].forEach((m, i) => { m.roughness = d.finish === 0 ? p0.rough[i] : rough; if ("clearcoat" in m) m.clearcoat = d.finish === 0 ? (i ? 0.7 : 1) : cc; });
    if (KM.plate) {
      if (!this.plateTex) {
        const c = document.createElement("canvas"); c.width = 256; c.height = 128;
        this.plateTex = new THREE.CanvasTexture(c); this.plateTex.colorSpace = THREE.SRGBColorSpace; this.plateTex.anisotropy = 4;
      }
      const c = this.plateTex.image, ctx = c.getContext("2d");
      ctx.fillStyle = "#" + KM.graphite.color.getHexString(); ctx.fillRect(0, 0, 256, 128); // the pack's own colour (its UVs sit in the corner)
      MT.drawPlate(ctx, 6, 6, 244, 116, MT.designCode(d));
      this.plateTex.needsUpdate = true;
      if (KM.plate.map !== this.plateTex) { KM.plate.map = this.plateTex; KM.plate.needsUpdate = true; }
    }
  }

  // Run trail: a short ribbon of fading quads left behind the feet.
  buildTrail() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xa9bcff, transparent: true, opacity: 0.6, depthWrite: false });
    const geo = new THREE.PlaneGeometry(0.34, 0.5).rotateX(-Math.PI / 2);
    const bits = [];
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(geo, mat.clone()); m.visible = false; this.scene.add(m); bits.push({ m, t: 9 }); }
    this.trail = { mat, bits, i: 0, acc: 0 };
  }

  updateTrail(dt, v) {
    const T = this.trail;
    if (!T) return;
    T.acc += dt;
    if (this.trailOn && this.state === "play" && T.acc > 0.035) {
      T.acc = 0;
      const b = T.bits[T.i++ % T.bits.length];
      b.t = 0; b.m.visible = true; b.m.position.set(this.r.x + (Math.random() - 0.5) * 0.1, Math.max(0.03, visY(this.r.y) + 0.04), 0.3);
      b.m.material.color.copy(T.mat.color);
    }
    for (const b of T.bits) {
      if (b.t > 0.5) { b.m.visible = false; continue; }
      b.t += dt; b.m.position.z += v * dt;
      b.m.material.opacity = 0.55 * (1 - b.t / 0.5); b.m.scale.set(1 - b.t, 1, 1);
    }
  }

  animateRobot(dt, v, sliding) {
    const R = this.robot, r = this.r, st = this.state, pw = this.pw;
    const k = Math.min(1, dt * 12);
    R.root.position.x = r.x;
    R.blob.position.x = r.x;
    const runner = R.runner, roller = R.roller;

    // Which form shows, and the morph between them.
    let mix = 0; // 0 = runner, 1 = roller
    if (pw.phase === "in") mix = Math.min(1, pw.t / MORPH_T);
    else if (pw.phase === "drive") mix = 1;
    else if (pw.phase === "out") mix = 1 - Math.min(1, (pw.t - pw.outAt) / MORPH_T);
    const ease = mix * mix * (3 - 2 * mix);
    // The runner folds down and spins away as the roller unfolds, and back.
    const hs = Math.max(0, 1 - ease * 1.6), ws = Math.max(0, ease * 1.6 - 0.6);
    runner.root.scale.set(hs, hs, hs);
    runner.root.rotation.y = ease * Math.PI;
    runner.root.visible = hs > 0.01;
    roller.root.scale.set(ws, ws, ws);
    roller.root.rotation.y = (1 - Math.min(1, ws)) * -Math.PI;
    roller.root.visible = ws > 0.01;
    if (pw.phase === "grace") runner.root.visible = Math.floor(pw.t * 12) % 2 === 0;
    R.form = mix > 0.5 ? "roller" : "runner";

    // Flash rings while morphing.
    const morphing = pw.phase === "in" || pw.phase === "out";
    R.flash.visible = morphing;
    if (morphing) {
      const u = pw.phase === "in" ? pw.t / MORPH_T : (pw.t - pw.outAt) / MORPH_T;
      R.flash.position.y = 0.8;
      R.flash.scale.setScalar(0.6 + u * 2.2);
      R.flash.children[1].rotation.x = u * 3;
      this.M.flash.opacity = Math.max(0, 0.85 * (1 - u));
    } else if (this.reviveT > 0) {
      // Spare Servo reboot: the rings snap out in the first 0.3 s, then hold as a slow-breathing
      // shield (about 1.3 Hz, never a hard blink) until invulnerability ends.
      const age = REVIVE_T - this.reviveT, k = Math.min(1, age / 0.3);
      R.flash.visible = true;
      R.flash.position.y = 0.8;
      R.flash.scale.setScalar(0.6 + k * 0.9);
      R.flash.children[1].rotation.x = age * 2.4;
      this.M.flash.opacity = this.reviveT < 0.3 ? this.reviveT * 2 : 0.45 + 0.2 * Math.cos(age * 8);
    }

    const f = this.fx;
    const S = { mode: "run", t: this.t, speed: v, vy: r.vy, lean: LANES[r.lane] - r.x, ax: r.ax || 0, impact: r.landT > 0 ? r.impact : 0, hammer: f.hammer > 0, drill: f.drill > 0, swing: f.swing };
    if (st === "menu") {
      // Faces the camera and idles. In the Garage it turns slowly on the spot (live preview: the
      // chassis plate is on its back), then settles to the nearest front-facing turn after.
      if (this.view === "shop") R.root.rotation.y += dt * (this.reduceMotion ? 0.25 : 0.7);
      else { const y = R.root.rotation.y, to = Math.PI + Math.round((y - Math.PI) / (Math.PI * 2)) * Math.PI * 2; R.root.rotation.y += (to - y) * Math.min(1, dt * 4); }
      R.root.rotation.x = 0;
      R.root.position.y = 0;
      R.blob.scale.setScalar(1);
      S.mode = "menu";
      runner.update(S, dt);
      return;
    }
    R.root.rotation.y += (0 - R.root.rotation.y) * Math.min(1, dt * 10);

    if (st === "dying") {
      if (this.deathKind === "fall") {
        R.root.position.y -= dt * (2 + this.deathT * 14);
        R.root.rotation.x += (0.5 - R.root.rotation.x) * k;
      } else {
        R.root.position.y = Math.max(0, R.root.position.y - dt * 4);
        R.root.rotation.x += (1.35 - R.root.rotation.x) * Math.min(1, dt * 7);
      }
      if (runner.root.visible) { S.mode = "hit"; S.speed = 0; runner.update(S, dt); }
      R.blob.scale.setScalar(Math.max(0.01, 1 - this.deathT));
      return;
    }
    if (st !== "play") return;

    R.root.position.y = visY(r.y);
    R.root.rotation.x = 0;
    S.mode = sliding ? "slide" : r.ground ? "run" : "air";
    if (runner.root.visible) runner.update(S, dt);
    if (roller.root.visible) roller.update(S, dt);
    R.blob.scale.setScalar(Math.max(0.35, 1 - r.y * 0.3) * (R.form === "roller" ? 1.25 : 1));
  }

  updateCamera(dt) {
    const c = this.camera, b = this.camBase;
    const tx = this.r.x * 0.45;
    c.position.x += (tx - c.position.x) * Math.min(1, dt * 6);
    // Ramp flight: the camera rises, eases back and tilts up with the drawn arc so the robot stays in
    // frame under the HUD on every phone aspect, then settles back after landing. Normal jumps (under
    // ~1.7 units) never move it. Smoothed every frame, no snaps; render-only, the sim never reads it.
    const air = this.state === "play" || this.state === "dying" ? Math.max(0, visY(this.r.y) - 1.8) : 0;
    const up = air > (this.camAir || 0);
    this.camAir = (this.camAir || 0) + (air - (this.camAir || 0)) * Math.min(1, dt * (up ? 9 : 4));
    const L = this.camAir, tall = this.camera.aspect < 0.75 ? 1 : 0.7;
    this.camLook = L * 0.75 * tall;
    c.position.y = Math.min(7.4, b.y + L * 0.5 * tall); // stays under the roof trusses (8.24)
    c.position.z = b.z + L * 0.3 * tall;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      // Smooth low-frequency shake (was per-frame random jitter, which read as strobing on phones); gentler on touch.
      const k = this.shake * (this.coarse ? 0.32 : 0.5), t = performance.now() / 1000;
      c.position.x += Math.sin(t * 38) * k;
      c.position.y += Math.sin(t * 45 + 1.3) * k * 0.8;
    }
    // Garage close-up (r7): the robot sits beside the panel on wide screens, above it on phones.
    const gk = this.garageK = (this.garageK || 0) + ((this.view === "shop" && this.state === "menu" ? 1 : 0) - (this.garageK || 0)) * Math.min(1, dt * 8);
    // The close-up also pulls the fog and far plane in (a studio feel), so the far hall drops out of
    // the frustum: the Garage view draws fewer calls than the title, not more.
    const fb = this.fogBase || (this.fogBase = { near: this.scene.fog.near, far: this.scene.fog.far, cam: c.far });
    const cf = fb.cam + (52 - fb.cam) * gk;
    if (Math.abs(cf - c.far) > 0.01) {
      const k = gk < 0.002 ? 0 : gk;
      this.scene.fog.near = fb.near + (12 - fb.near) * k; this.scene.fog.far = fb.far + (50 - fb.far) * k;
      c.far = k ? cf : fb.cam; c.updateProjectionMatrix();
    }
    if (gk > 0.002) {
      const port = c.aspect < 1, px = port ? 0 : -1.05, py = port ? 1.5 : 1.45, pz = port ? 3.6 : 3.6, ly = port ? -0.1 : 0.95;
      c.position.set(c.position.x + (px - c.position.x) * gk, c.position.y + (py - c.position.y) * gk, c.position.z + (pz - c.position.z) * gk);
      c.lookAt(this.r.x * 0.3 + (px - this.r.x * 0.3) * gk, (this.lookY ?? 0.9) + (ly - (this.lookY ?? 0.9)) * gk, -10 + 10 * gk);
      return;
    }
    c.lookAt(this.r.x * 0.3, (this.lookY ?? 0.9) + (this.camLook || 0), -10);
    // Turns (track.js): look into the corner and bank with the robot's lean. No allocation.
    if (this.camYaw) c.rotateY(this.camYaw);
    if (this.camPitch) c.rotateX(this.camPitch);
    if (this.lean && !this.reduceMotion) c.rotateZ(this.lean * 0.18);
  }
}
