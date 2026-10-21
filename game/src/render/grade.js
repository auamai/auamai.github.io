// Servo Sprint colour grade and lighting rig (lighting/colour pass, 2026-10-20).
// One place for the brand palette in 3D: graphite world, safety yellow = hazards and
// interactive, electric cyan = the robot / player energy / UI, off-white = highlights.
// NO orange anywhere (AgX keeps saturated yellow on hue; ACES drifts it toward orange).
//
// How it works, so it survives ongoing edits to the scene code:
//  1. At import time it rewrites the shared palette objects (COL, factory C, robot UL,
//     TOOL_COL, shop and milestone colours) before any mesh is built.
//  2. applyGrade(game) runs once at the end of buildScene(): renderer output, tone mapping,
//     background/fog, the light rig, shadow settings, and a single pass over every material
//     (world + 3D UI overlay) that swaps any remaining legacy hex through REMAP and remaps
//     baked vertex / instance colours. regrade(game) re-runs only the material pass.
//  3. Quality tier: "hi" (desktop, quality 0-1) adds the cyan hero light and 2048 shadows;
//     "lo" (touch devices or quality >= 2) keeps 3 lights, 1024 shadows, no extra pass.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { COL, MILESTONES } from "../core/constants.js?v=20261020r6c";
import { C } from "../../factory.js?v=20261020r6c";
import { UL, rim } from "../../robots/kit.js?v=20261020r6c";
import { TOOL_COL } from "../../tools.js?v=20261020r6c";
import { SHOP } from "../../meta.js?v=20261020r6c";

/* ---------- brand ---------- */
export const BRAND = { graphite: 0x14161b, offwhite: 0xf2f0ea, yellow: 0xffc93c, cyan: 0x3ddcff };
// Value ramp for the world (sRGB). Environment sits in G0-G4; hazards and the hero sit in S5-W.
export const G = {
  G0: 0x0b0c0f, // pits, visor, deepest occlusion
  G1: 0x14161b, // brand graphite: background, fog, far walls
  G2: 0x1b1e24, // ceiling, wall, dark frames
  G3: 0x23262d, // shop floor, wainscot
  G4: 0x2c3037, // line bed, pillars, beams, props
  G5: 0x3a3e46, // lanes, racks, rails
  S5: 0x50555e, // steel mid, rollers
  S6: 0x6b707a, // steel light, arm dark links
  S7: 0x8a8f99, // light steel
  W1: 0xc9c6be, // hazard bodies (warm-neutral off-white, not cream)
  W2: 0xe2dfd7, // hazard tops / hero shell shade
  W3: 0xf2f0ea, // brand off-white highlight
  Y: 0xffc93c, Y2: 0xe0ab1f, // safety yellow, its shaded twin (hue 43-44 deg, never < 40)
  CY: 0x3ddcff, CY2: 0x1fa9cc, CY3: 0x9beaff, // cyan, deep cyan, cyan halo
};

/* ---------- 1. shared palettes, rewritten before anything is built ---------- */
Object.assign(COL, {
  bg: G.G1, fog: G.G1,
  floor: G.G4, lane: G.G5, dash: G.W1,
  wall: G.G2, ceiling: G.G2, pillar: G.G4, beam: G.G4, light: G.W3,
  rail: G.G5, roller: G.S5,
  robot: G.S6, robotMid: G.S5, robotDark: G.G4, accent: G.Y,
  crate: G.W1, crateTop: G.W2, arm: G.Y, armDark: G.Y2,
  gap: G.G0, gear: G.CY, edge: 0x000000,
  bot: G.W1, botTop: G.W2, botDark: G.G2,
});
Object.assign(C, {
  white: G.G5, white2: G.G4, steel: G.S5, steel2: G.S6, steel3: G.S7,
  navy: G.G2, navy2: G.G4, ink: G.G0,
  peri: G.W3, periDeep: G.S5, rack: G.G5,
  floorZone: G.G3, mark: 0x5c5b57, wall: G.G2, wainscot: G.G3,
  pallet: G.G5, carton: G.S6, carton2: G.S5, bin: G.S5, bin2: G.G4,
  asphalt: G.G2, lotLine: 0x5c5b57, curb: G.G4, tree: 0x262a2e, tree2: 0x202327,
  duct: G.G4, ductBand: G.G5, glassDark: 0x0e1013,
  car: [G.G2, G.S6, G.W1, G.G5, G.S7, G.S5],
});
// Hero (Unit 07): off-white shells, graphite frame, cyan energy.
Object.assign(UL, { pearl: 0xe9e6df, pearlShade: G.W1, navy: G.G2, graphite: 0x2a2e36, slate: 0x454a54, visor: G.G0, light: G.CY, lightDeep: G.CY2 });
rim.color.value.setHex(G.CY); rim.strength.value = 0.38; rim.power.value = 2.6;
Object.assign(TOOL_COL, { navy: G.G2, ink: G.G0, steel: G.W1, pearl: G.W3, peri: G.CY, deep: G.CY2, glow: G.CY });
// Trims / shop: hue-safe equivalents; ids and prices unchanged (names are copy, owned by the game).
const TRIM = { pearl: [0xe9fbff, G.CY3], deep: [G.CY2, 0x137a94], star: [G.W3, G.CY] };
for (const m of MILESTONES) if (TRIM[m.id]) [m.light, m.deep] = TRIM[m.id];
const SHOPC = { "trim-navy": { light: G.CY2, deep: G.G4 }, "trim-ice": { light: 0xe9fbff, deep: G.CY3 },
  "trail-ribbon": { color: G.CY }, "trail-navy": { color: G.S6 }, "trail-pearl": { color: G.W3 },
  "hammer-navy": { color: G.G5 }, "hammer-pearl": { color: G.W3 } };
for (const s of SHOP) if (SHOPC[s.id]) Object.assign(s, SHOPC[s.id]);

/* ---------- legacy hex -> brand hex (literals still inside the scene code) ---------- */
export const REMAP = new Map([
  // render.js literals
  [0x7d90ea, G.Y],      // arm laser (slide under) = hazard
  [0x8297f2, G.Y],      // bot blink on = hazard
  [0x6f80d8, G.CY2],    // gear emissive
  [0xa9bcff, G.CY],     // token, trail, rings, default trim
  [0x6f84e0, G.CY2], [0x7f95f0, G.CY2], [0xf4f6fb, G.W3],
  [0x5a6dcd, G.CY],     // PB line
  [0xc9cfde, G.W1],     // hammer default
  // factory.js M
  [0xdfe6fb, 0x9aa4b0], [0x3c4a8c, 0x18242b], [0x262d4d, G.G0], [0xe9eeff, G.W3],
  [0xc9d4ff, G.CY3], [0x8fa5ff, G.W3], [0x9fb3ff, G.W3], [0x3a4262, G.G4],
  [0xe9ecf4, G.G3], [0xe8ebf3, G.G2],
  // tools.js
  [0x5a6488, G.S6], [0x10162f, G.G0], [0x4f63c4, G.CY2], [0xc3cdff, G.CY3], [0xa4aaba, G.W1], [0x8fa2f0, G.CY],
  // kit.js
  [0x161a2e, 0x111317], [0x8ea2f6, G.CY], [0xc4d1ff, G.CY],
  // ui3d.js PAL + its lights
  [0x151c44, G.G2], [0x4a5aa8, G.G5], [0x253070, G.G0], [0x8f9bd6, G.G4], [0xdfe6ff, G.W3],
]);
// Materials whose colour must land on the exact brand hex on screen (bypass tone mapping).
const EXACT = new Set([G.Y, G.CY, G.CY3, G.W3]);

const tmp = new THREE.Color();
// Everything already on the brand ramp is left alone by the fallback (palettes above are pre-graded).
const ONRAMP = new Set([...Object.values(G), ...Object.values(BRAND), ...Object.values(C).flat(), ...Object.values(COL), ...REMAP.values()]);
const hexOf = (c) => c.getHex();
// Tolerant lookup: sRGB -> linear -> sRGB round trips can land 1 step off the literal (0x7d90ea -> 0x7d90e9).
function near(h) {
  if (REMAP.has(h)) return REMAP.get(h);
  const r = h >> 16, g = (h >> 8) & 255, b = h & 255;
  for (const [k, v] of REMAP) if (Math.abs((k >> 16) - r) <= 2 && Math.abs(((k >> 8) & 255) - g) <= 2 && Math.abs((k & 255) - b) <= 2) return v;
  return undefined;
}
function swap(c) { const v = near(hexOf(c)); if (v !== undefined && v !== hexOf(c)) { c.setHex(v); return true; } return false; }

// Fallback for baked vertex / instance colours not in REMAP: compress the old light hall's
// value range into the graphite band, neutralised with a faint cool cast; saturated
// periwinkle becomes off-white glow (light >= .6) or graphite (dark).
function fallback(c) {
  const r = c.r, g = c.g, b = c.b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx > 0 ? (mx - mn) / mx : 0, L = 0.2126 * r + 0.7152 * g + 0.0722 * b; // linear
  if (sat > 0.25 && b > r) { if (mx > 0.6) c.setHex(G.W3); else c.setHex(G.G4); return; }
  const v = 0.006 + 0.03 * Math.sqrt(L); // linear: white -> ~#2c3037, navy -> ~#16181c
  c.setRGB(v * 0.97, v * 0.99, v * 1.06);
}
function remapAttr(attr, skipBright) {
  if (!attr || attr.userData?.graded) return;
  const a = attr.array;
  for (let i = 0; i < a.length; i += 3) {
    tmp.setRGB(a[i], a[i + 1], a[i + 2]);
    if (!swap(tmp) && !ONRAMP.has(tmp.getHex())) {
      // glow meshes keep white as off-white light; everything else goes to the graphite band
      if (skipBright && tmp.r > 0.8 && tmp.g > 0.8 && tmp.b > 0.8) tmp.setHex(G.W3); else if (!(skipBright && tmp.getHex() === G.W3)) fallback(tmp);
    }
    a[i] = tmp.r; a[i + 1] = tmp.g; a[i + 2] = tmp.b;
  }
  attr.userData = { ...(attr.userData || {}), graded: true };
  attr.needsUpdate = true;
}

function gradeMaterial(m, stats) {
  if (!m || m.userData?.graded) return;
  if (m.color) { swap(m.color); if (m.isMeshBasicMaterial && EXACT.has(hexOf(m.color))) m.toneMapped = false; }
  if (m.emissive) swap(m.emissive);
  if (m.specular) m.specular.setHex(0xffffff);
  if (m.uniforms?.uColor) swap(m.uniforms.uColor.value);
  // Lambert self-light from the white hall would lift the graphite world back to grey.
  if (m.isMeshLambertMaterial && !m.userData?.lift && m.emissiveIntensity > 0 && hexOf(m.emissive) !== G.Y && hexOf(m.emissive) !== G.Y2 && hexOf(m.emissive) !== G.CY && hexOf(m.emissive) !== G.CY2 && hexOf(m.emissive) !== G.W3) m.emissiveIntensity = Math.min(m.emissiveIntensity, 0.06);
  if (m.isMeshLambertMaterial && (hexOf(m.emissive) === G.Y || hexOf(m.emissive) === G.Y2)) m.emissiveIntensity = Math.min(m.emissiveIntensity, 0.6);
  if (m.isMeshLambertMaterial && (hexOf(m.emissive) === G.CY || hexOf(m.emissive) === G.CY2)) m.emissiveIntensity = 0.6;
  if (m.isLineBasicMaterial) { m.color.setHex(0x000000); m.opacity = Math.min(m.opacity, 0.35); }
  m.userData = { ...(m.userData || {}), graded: true };
  m.needsUpdate = true;
  stats.n++;
}

export function regrade(game) {
  const stats = { n: 0 };
  const roots = [game.scene, game.ui?.scene].filter(Boolean);
  for (const root of roots) root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) gradeMaterial(m, stats);
    if (o.geometry?.attributes?.color) remapAttr(o.geometry.attributes.color, mats.some((m) => m && m.isMeshBasicMaterial));
    if (o.isInstancedMesh && o.instanceColor) { o.instanceColor.userData = {}; remapAttr(o.instanceColor, false); }
  });
  // Material banks that are not (yet) in the scene: pooled obstacles, runtime swaps (blinkOn), the trail master.
  for (const bank of [game.M, game.TM, game.kit?.M, game.factory?.M, game.ceiling?.M, game.ui?.M]) if (bank) for (const m of Object.values(bank)) if (m && m.isMaterial) gradeMaterial(m, stats);
  if (game.trail?.mat) gradeMaterial(game.trail.mat, stats);
  // Trail bits are clones: keep them on the trail's colour.
  if (game.trail) for (const b of game.trail.bits) b.m.material.color.copy(game.trail.mat.color);
  return stats.n;
}

// AgX (three r160) cannot output #FFC93C at any input (best reachable ~#DFA96D, sat 0.5), so lit yellow
// paint read as tan. Hazard yellow skips AgX and uses its own hue-keeping curve instead: luminance
// Reinhard (white point 3) scaled so a key-lit face lands on #F9C43A, then highlights roll off toward a
// warm off-white (1, 1, .8) so glare stays hue 41-44 deg (never orange) and clearcoat glints still read.
export function punch(m) {
  if (!m || m.userData?.punch) return;
  const prev = m.onBeforeCompile;
  m.toneMapped = false;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", `{
      vec3 c_ = outgoingLight * 1.25;
      float l_ = max(dot(c_, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
      c_ *= (1.0 + l_ / 9.0) / (1.0 + l_) * 1.45;
      float m_ = max(max(c_.r, c_.g), c_.b);
      if (m_ > 1.0) { c_ /= m_; c_ = mix(c_, vec3(1.0, 1.0, 0.8), min((m_ - 1.0) * 0.5, 1.0)); }
      outgoingLight = c_;
    }
#include <opaque_fragment>`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : "") + "|ssYellow";
  m.userData = { ...(m.userData || {}), punch: 1 };
  m.needsUpdate = true;
}

/* ---------- 2. renderer, rig, fog ---------- */
export function gradeTier(game) { return game.coarse || game.quality >= 2 ? "lo" : "hi"; }

export function applyGrade(game) {
  const { renderer, scene } = game;
  const tier = gradeTier(game);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.25;
  scene.background = new THREE.Color(G.G1);
  scene.background = new THREE.Color(0x1a1d23);
  scene.fog = new THREE.Fog(0x1a1d23, 34, 128); // haze a step above graphite so far silhouettes separate

  // Replace the old rig (hemi 1.9 + sun 1.5 + fill 0.65, all white: flat, no value structure).
  const old = []; scene.traverse((o) => { if (o.isLight) old.push(o); });
  for (const l of old) if (l.isHemisphereLight || (l.isDirectionalLight && l !== game.sun)) l.parent.remove(l);
  const hemi = new THREE.HemisphereLight(0xd6e0ea, 0x3a3e46, 0.85);        // ambient: cool sky, graphite bounce
  const sun = game.sun;                                                  // key: front-left, casts the only shadow
  sun.color.setHex(0xf6f4ee); sun.intensity = 3.0;
  sun.position.set(5, 12, 7);
  const sm = tier === "hi" ? 2048 : 1024;
  if (sun.shadow.map && sun.shadow.mapSize.x !== sm) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.025;           // no acne on flat faces, no peter-panning
  Object.assign(sun.shadow.camera, { left: -5.6, right: 5.6, top: 12, bottom: -16, near: 2, far: 36 });
  sun.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0x9fb4c8, 0.45);              // fill: cool, opposite side, no shadow
  fill.position.set(-7, 5, 4);
  const back = new THREE.DirectionalLight(0xe6eef6, 1.6);               // rim: from behind and above, edges every silhouette
  back.position.set(0, 7, -20);
  scene.add(hemi, fill, back);
  game.rig = { hemi, sun, fill, back, tier };
  if (tier === "hi" && game.robot) {                                    // cyan hero light: energy spill on the lane
    const hero = new THREE.PointLight(G.CY, 3.2, 5.5, 2);
    hero.position.set(0, 0.9, 0.6);
    game.robot.root.add(hero);
    game.rig.hero = hero;
  }

  // Hazards carry their own light so yellow stays saturated in shadow (AgX greys unlit yellow).
  if (game.M) {
    for (const k of ["arm", "armDark"]) { const m = game.M[k]; if (m) { m.emissive.setHex(G.Y2); m.emissiveIntensity = 0.32; } }
    if (game.M.crateBand) game.M.crateBand.emissiveIntensity = 0.55;
    if (game.M.strip) game.M.strip.emissiveIntensity = 0.6;
    if (game.M.laser) game.M.laser.toneMapped = false;
    for (const k of ["crateBand", "strip", "accent"]) punch(game.M[k]);
  }
  if (game.armKit) punch(game.armKit.M.paint);
  if (game.ceiling?.M?.sign) game.ceiling.M.sign.toneMapped = false;
  // Lift the roof out of pure black (was 20-30 % of pixels at L* < 2): downward faces only see the hemi ground.
  if (game.factory?.shell) { const c = game.factory.shell[1].material; c.emissive.setHex(G.G2); c.emissiveIntensity = 1; c.userData.lift = true; }
  if (game.ceiling?.M?.solid) { game.ceiling.M.solid.emissive.setHex(G.G4); game.ceiling.M.solid.emissiveIntensity = 0.55; game.ceiling.M.solid.userData.lift = true; }
  if (game.factory?.M?.screen) game.factory.M.screen.opacity = 0.45;
  // r6b: desktop 16:9 still had 14-16 % of pixels at L* < 2 (overhead car bodies, upper side walls see only the
  // hemi ground colour). A small flat floor lifts those blacks to ~L* 5 without flattening the lit faces.
  if (game.ceiling?.M?.body) { const m = game.ceiling.M.body; m.emissive.setHex(G.G4); m.emissiveIntensity = 0.55; m.userData.lift = true; }
  if (game.factory?.M?.solid) { const m = game.factory.M.solid; m.emissive.setHex(G.G3); m.emissiveIntensity = 0.3; m.userData.lift = true; }
  // Lane dashes are guidance, not hazard: off-white, not yellow.
  if (game.M?.dash) { game.M.dash.emissive.setHex(G.W3); game.M.dash.emissiveIntensity = 0.12; }
  // Kit environment: neutral studio with off-white panels and one cyan strip (was periwinkle).
  regrade(game);
  vignette(game, tier);
  return game.rig;
}

// Cinematic vignette as a CSS layer over the canvas: zero GPU passes, safe on phones.
function vignette(game, tier) {
  const host = game.canvas?.parentNode;
  if (!host || host.querySelector(".fr__vignette")) return;
  const v = document.createElement("div");
  v.className = "fr__vignette";
  v.setAttribute("aria-hidden", "true");
  const k = tier === "hi" ? 0.4 : 0.38; // 0.5 crushed the desktop roof corners (lighting_qa #6)
  Object.assign(v.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0",
    background: `radial-gradient(ellipse 85% 75% at 50% 58%, rgba(11,12,15,0) 55%, rgba(11,12,15,${k}) 100%)` });
  game.canvas.insertAdjacentElement("afterend", v);
}
