// Factory run: a small endless runner. Loaded only when someone presses Play.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import * as P from "./profile.js?v=20261020r6";
import { Factory } from "./factory.js?v=20261020r6";
import { Ceiling } from "./ceiling.js?v=20261020r6";
import { createKit, RUNNERS, ROLLERS } from "./robots/index.js?v=20261020r6";
import { UI3D } from "./ui3d.js?v=20261020r6";
import { FactoryAudio } from "./audio.js?v=20261020r6";
import * as MT from "./meta.js?v=20261020r6";
import { toolMaterials, toolGeometries, buildTool, Burst } from "./tools.js?v=20261020r6";

/* ---------- tuning ---------- */
const LANES = [-2.2, 0, 2.2];
const SPAWN_Z = -100;
const DESPAWN_Z = 14;
const START_SPEED = 13;
const MAX_SPEED = 38;
const ACCEL = 0.32;          // units/s gained per second
// World scale (round 6): 1 unit = 0.85 m, so the UL-H1 (1.9 units) stands 1.6 m and lanes (2.2) sit 1.9 m apart.
// All ballistic motion uses real gravity, 9.81 m/s², in those units.
const M_PER_U = 0.85;
const GRAVITY = -9.81 / M_PER_U; // -11.54 u/s²
const JUMP_H = 1.65;             // same apex as before (1.4 m)
const JUMP_V = Math.sqrt(2 * -GRAVITY * JUMP_H); // 6.17 u/s (5.25 m/s): hang time 2v/g = 1.07 s
const PHYS_HZ = 120;             // fixed physics step: the same course and score on every device
const LANE_W = 22, LANE_W_ROLL = 34; // critically damped lane spring (rad/s): ~0.2 s / ~0.13 s to settle
const COYOTE = 0.1;              // a jump this soon after leaving a rail still counts
const MU_SLIDE = 0.5;            // kinetic friction for the slide's entry skid
const SLIDE_T = 0.72;
const GEAR_POINTS = 10;
const DIST_POINTS = 0.5;     // per unit travelled
const PERIOD = 12;           // scenery repeat length

// Wheel power-up: turns the runner into the UL-W1 roller for a few seconds.
const WHEEL_FROM = 14;       // seconds into a run before a token can appear
const WHEEL_GAP = 28;        // at least this long between tokens
const WHEEL_CHANCE = 0.16;   // per eligible row
const MORPH_T = 0.45;        // transform animation, each way (invulnerable)
const DRIVE_T = 8;           // total time as the roller, morph-in included
const GRACE_T = 1.2;         // blinking grace after changing back
const DRIVE_MULT = 1;        // Roller Mode has no flat multiplier any more: it earns through its own moves
// Roller Mode (round 6): its own abilities.
const ROLL_SPEED = 1.2;       // world speed (and so distance points) while rolling
const RAIL_H = 1.2;           // grind height
const RAIL_GEAR_GAP = 2.0;    // gears along a rail
const RAMP_DEG = 35, RAMP_H = 1.4, RAMP_L = 2.0;  // kicker: a 35 degree lip 1.4 high; a true projectile off it
const RAMP_G = 1;             // (real gravity in the air)
const LAND_ROLL = 0.5;        // invulnerable roll after a ramp landing
const HOP_V = Math.sqrt(2 * 9.81 / 0.85 * 0.75); // the roller's jump: a low hop, 0.75 units
const DRIFT_CHAIN = 0.6, DRIFT_CASH = 1.5;
const DRIFT_MULT = [1, 1.2, 1.4, 1.6];
const RATE_CAP = 1200;       // points in any one-second window (the sim's best was 1,014)
const JUMP_BUF = 0.16;       // a jump pressed this close before landing still fires on landing
const OVER_LOCK = 450;       // ms after game over before a key or tap can restart
const COUNT_BEAT = 0.42;    // countdown: three numbers of this length, then a GO beat while play starts
// Tools (round 6). Every point still goes through addScore and its caps.
const SCREW_POINTS = 25;
const DRILL_POINTS = 50;      // per machine bored through
const HAMMER_POINTS = 75;     // per crate, stack or robot smashed
const MAGNET_T = 6, DRILL_T = 5, HAMMER_T = 6, GOLD_T = 10, OVER_T = 8;
const MAGNET_R = 10;          // magnet reach: this far ahead, every lane
const MULT_CAP = 6;           // all multipliers together never go past this
const TOOL_FROM = 10;         // seconds into a run before tool pickups (tutorial runs: 25)
const TOOL_GAP = 8;           // at least this long between tool pickups
const TOOL_KIND_GAP = 20;     // and this long between two of the same kind
const TOOL_CHANCE = 0.3;      // per eligible row
const GOLD_MIN = 60, GOLD_MAX = 120; // the golden torque wrench: once in this window, then again
const METER_N = 10;           // toolbox meter: 5 segments of 2; a tool fills one, smashes half (one per tool)
const HIT_STOP = 0.06;        // real seconds the world holds on a smash
const PB_GOLD_DELAY = 2.5;    // passing your best brings a golden wrench this soon after
// Score caps, mirrored exactly by the leaderboard Worker (allowedScore() there):
// no one-second window over RATE_CAP, and never more than allowedScore(seconds of run).
// A perfect bot measured ~112/s on average and 1,014 in its best one-second window (r6 sim).
const AVG_CAP = 180;          // per second of run
const GRACE = 50;
const BURST = 8000;           // room for one multiplier streak, opening at 800/s after 10 s
const BURST_FROM = 10, BURST_RATE = 800;
export const allowedScore = (secs) => secs * AVG_CAP + GRACE + Math.min(BURST, Math.max(0, secs - BURST_FROM) * BURST_RATE);
const SLOW_T = 1.2;          // first-run hint slow-mo: real seconds, eased in and out
const SLOW_K = 0.4;          // game speed at the bottom of the slow-mo
const TUT_SPEED = 9.5;       // first-run start speed, easing up to the normal curve
const TUT_EASE = 16;         // seconds to reach the normal curve

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
  key: '<svg class="fr__key" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H21M17.5 12v3.2M20.2 12v2.4"/></svg>',
  tool: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.6-8.6zM16 4.8l3.2 3.2"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.4 5.3 5.6.6-4.2 3.8 1.2 5.6L12 16l-5 2.8 1.2-5.6L4 9.4l5.6-.6z"/></svg>',
  wheel: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 4.5v5.9M12 13.6v5.9M5.5 15.8l5.1-2.9M13.4 11.1l5.1-2.9M5.5 8.2l5.1 2.9M13.4 12.9l5.1 2.9"/></svg>',
};

// Short, in-context first-run tips. Touch copy, key copy.
// Each is a short 3D title and a quieter line under it.
const TIPS = {
  lanes: { icon: "lr", touch: ["Swipe left or right", "to change lanes"], keys: ["← →  or  A  D", "to change lanes"] },
  jump: { icon: "up", touch: ["Swipe up", "to jump"], keys: ["↑  or  Space", "to jump"] },
  slide: { icon: "down", touch: ["Swipe down", "to slide under"], keys: ["↓  or  S", "to slide under"] },
  wheel: { icon: "wheel", all: ["Grab the wheel", "Roller Mode for 8 s"] },
  rolling: { icon: "wheel", all: ["Roller Mode", "grind rails, hit ramps, chain drifts"] },
  screw: { icon: "tool", all: ["Screws +25", "grab the line"] },
  wrench: { icon: "tool", all: ["Wrench magnet", "pulls gears and screws for 6 s"] },
  drill: { icon: "tool", all: ["Drill", "bores through arms for 5 s"] },
  hammer: { icon: "tool", all: ["Hammer", "smash crates and robots for 6 s"] },
  gold: { icon: "star", all: ["Golden torque wrench", "×2 to ×5 while you stay clean"] },
  over: { icon: "star", all: ["Overdrive ×2", "toolbox full"] },
  pb: { icon: "star", all: ["New best", "golden wrench incoming"] },
};
const NO_SLOW = new Set(["lanes", "rolling", "over", "pb", "screw"]);
const TOOL_NAME = { wrench: "Magnet", drill: "Drill", hammer: "Hammer", gold: "Golden" };
const MILESTONES = [
  { at: 1000, id: "pearl", name: "Pearl trim", light: 0xe9edff, deep: 0xc3cdff },
  { at: 2500, id: "deep", name: "Deep periwinkle", light: 0x6f84e0, deep: 0x4f63c4 },
  { at: 5000, id: "star", name: "Starlight", light: 0xf4f6fb, deep: 0x8fa2f0 },
];
const OVER_ICON = {
  gears: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l1.5 2.2 2.6-.6.6 2.6 2.2 1.5-1.2 2.4 1.2 2.4-2.2 1.5-.6 2.6-2.6-.6L12 20.8l-1.5-2.2-2.6.6-.6-2.6-2.2-1.5L6.3 12 5.1 9.6l2.2-1.5.6-2.6 2.6.6z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  time: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.4l2.8 1.6M10 3.5h4"/></svg>',
  dist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M6 18l3-12M18 18l-3-12M12 7v2M12 12v2"/></svg>',
  tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.6-8.6zM16 4.8l3.2 3.2"/></svg>',
  mult: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.4 5.3 5.6.6-4.2 3.8 1.2 5.6L12 16l-5 2.8 1.2-5.6L4 9.4l5.6-.6z"/></svg>',
  smash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5l5-5 3 3-5 5zM9 12l7.5 7.5M14 4l1 2.5M18 8l2.5 1M17 4.5l-1.2 2.3"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg>',
  dare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h8M12 8l4 4-4 4M4 5v14M20 5v14"/></svg>',
  daily: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
};
const CAUSE = { crate: "Clipped a crate", stack: "Into the stack", arm: "Caught by the arm", bot: "Rear-ended a robot", gap: "Fell through the line" };
// Game-over headlines, per hazard: {v} speed in m/s, {bay} the bay you went down in. Picked at random.
const HEADLINES = {
  crate: ["Clipped a crate at {v} m/s", "That crate wasn't moving. You were, at {v} m/s", "Boxed in at {bay}", "Crate 1, robot 0"],
  stack: ["Ran into a wall of crates at {bay}", "The stack won at {v} m/s", "Two crates high, one jump short", "Stacked up at {bay}"],
  arm: ["Swept by the arm at {bay}", "The arm saw you first", "Should have slid under that one", "Picked up by the line at {bay}"],
  bot: ["Rear-ended a rover at {v} m/s", "Right of way: the rover at {bay}", "Robot traffic at {bay}", "Met a rover head-on at {v} m/s"],
  gap: ["Dropped through the line at {bay}", "Missed the floor by a jump", "Down the gap at {v} m/s", "The belt ran out at {bay}"],
  drill: ["Drill cooled, wall didn't"], hammer: ["Hammer's down, the stack wasn't"],
};
const BAY = { weld: "the weld cell", laser: "the laser cutters", test: "the test bay", inventory: "inventory", window: "the windows", assembly: "final assembly", door: "the loading door" };

const fmt = (n) => Math.floor(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Two seeded streams per run: COURSE lays out the obstacles (the same for everyone on a seed),
// LOOT places pickups and steers robots, so what one player collects never changes the course.
let COURSE = Math.random, LOOT = Math.random;
const pick = (a, r = COURSE) => a[(r() * a.length) | 0];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (COURSE() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

let current = null;
let cssLoaded = null;

function loadCss() {
  if (!cssLoaded) {
    cssLoaded = new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("./game.css?v=20261020r6", import.meta.url).href;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
      // Semibold Inter Tight for the score (the page ships 300/400 only).
      if (!document.querySelector("link[data-fr-font]")) {
        const f = document.createElement("link");
        f.rel = "stylesheet"; f.dataset.frFont = "1";
        f.href = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600&display=swap";
        document.head.appendChild(f);
      }
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
    this.tips = Object.assign({}, this.settings.tips);
    // A beat-my-run link (?c=seed&s=score&n=name) opens on that course with the score to beat.
    this.challenge = MT.readChallenge();
    this.dailyLink = new URLSearchParams(location.search).has("daily");
    this.mode = this.challenge ? "challenge" : this.dailyLink ? "daily" : "free";
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.coarse = matchMedia("(pointer: coarse)").matches;
    this.canBuzz = typeof navigator.vibrate === "function" && this.coarse;
    // Lighter robot shaders from the start on small, low-memory phones; others switch when quality drops.
    this.lite = this.coarse && ((navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 4);
    this.view = "menu";
    this.obstacles = [];
    this.gears = [];
    this.pools = { crate: [], stack: [], arm: [], gap: [], bot: [], gear: [] };
    this.r = { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false, jumpBuf: 0, rail: null, hopRail: null, launch: false, landRoll: 0 };
    this.pw = { phase: "none", t: 0 };
    this.token = null;
    this.items = [];
    this.fx = this.freshFx();
    this.rate = { b: new Float32Array(11), i: -1 };
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
      <div class="fr__pops" aria-hidden="true"></div>
      <div class="fr__fxflash" aria-hidden="true"></div>
      <div class="fr__hud" hidden>
        <div class="fr__scorebox"><span class="fr__score">0</span><span class="fr__mult" hidden>×1</span></div>
        <div class="fr__pb" aria-hidden="true"><span class="fr__pb-bar"><i></i></span><span class="fr__pb-label">PB</span></div>
        <span class="fr__meta"><span class="fr__gears">0</span> gears · best <span class="fr__best">0</span></span>
        <div class="fr__meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="fr__chips" aria-hidden="true"></div>
        <span class="fr__power" hidden>
          <svg class="fr__ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="fr__ring-bg" cx="22" cy="22" r="19"/><circle class="fr__ring-fg" cx="22" cy="22" r="19"/>
            <g class="fr__wheel"><circle cx="22" cy="22" r="9"/><circle cx="22" cy="22" r="2.4"/><path d="M22 13.6v6M22 24.4v6M14.7 26.2l5.2-3M24.1 20.8l5.2-3M14.7 17.8l5.2 3M24.1 23.2l5.2 3"/></g></svg>
          <span class="fr__power-label">Roller Mode</span>
        </span>
      </div>
      <div class="fr__corner">
        <button class="fr__icon" type="button" data-act="pause" aria-label="Pause" hidden>${ICON.pause}</button>
        <button class="fr__icon" type="button" data-act="close" aria-label="Close game">${ICON.close}</button>
      </div>
      <div class="fr__pad" hidden>
        <div class="fr__wheelpad" role="group" aria-label="Controls">
          <button type="button" data-move="jump" class="is-up" aria-label="Jump">${ICON.up}</button>
          <button type="button" data-move="right" class="is-right" aria-label="Move right">${ICON.right}</button>
          <button type="button" data-move="slide" class="is-down" aria-label="Slide">${ICON.down}</button>
          <button type="button" data-move="left" class="is-left" aria-label="Move left">${ICON.left}</button>
          <span class="fr__wheelpad-hub" aria-hidden="true"></span>
        </div>
      </div>
      <div class="fr__tip" aria-hidden="true"><span class="fr__tip-icon"></span><span class="fr__tip-title"></span><span class="fr__tip-text"></span></div>
      <div class="fr__count" aria-hidden="true"><span class="fr__count-ring"></span><span class="fr__count-num"></span></div>
      <div class="fr__layer"><div class="fr__panel" role="document"></div></div>
      <div class="fr__toast" role="status" aria-live="polite"></div>
      <div class="fr__sr" role="status" aria-live="polite"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector(".fr__canvas");
    this.hud = root.querySelector(".fr__hud");
    this.elScore = root.querySelector(".fr__score");
    this.elGears = root.querySelector(".fr__gears");
    this.elBest = root.querySelector(".fr__best");
    this.elPower = root.querySelector(".fr__power");
    this.elRing = root.querySelector(".fr__ring-fg");
    this.btnPause = root.querySelector('[data-act="pause"]');
    this.pad = root.querySelector(".fr__pad");
    this.wheelPad = root.querySelector(".fr__wheelpad");
    this.elMult = root.querySelector(".fr__mult");
    this.elScoreBox = root.querySelector(".fr__scorebox");
    this.elPb = root.querySelector(".fr__pb");
    this.elPbBar = root.querySelector(".fr__pb-bar i");
    this.elPbLabel = root.querySelector(".fr__pb-label");
    this.elMeter = [...root.querySelectorAll(".fr__meter i")];
    this.elChips = root.querySelector(".fr__chips");
    this.elPops = root.querySelector(".fr__pops");
    this.elFlash = root.querySelector(".fr__fxflash");
    this.layer = root.querySelector(".fr__layer");
    this.panel = root.querySelector(".fr__panel");
    this.toastEl = root.querySelector(".fr__toast");
    this.srEl = root.querySelector(".fr__sr");
    this.tipEl = root.querySelector(".fr__tip");
    this.countEl = root.querySelector(".fr__count");
    if (this.reduceMotion) root.classList.add("is-still");
    if (this.coarse) root.classList.add("is-touch");
    if (this.settings.lefty) root.classList.add("is-lefty");
    for (const k of ["music", "sfx"]) if (this.settings[k] === undefined) this.settings[k] = true;
    this.audio = new FactoryAudio(this.settings);
    // Sound starts on the first tap or key (browsers block it before), then follows the tab.
    const unlock = () => { this.audio.unlock(); this.audio.mood(this.state === "play" || this.state === "count" ? "run" : this.state === "pause" ? "pause" : this.state === "over" || this.state === "dying" ? "over" : "menu"); };
    root.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true, once: true });

    this.savedOverflow = [document.documentElement.style.overflow, document.body.style.overflow];
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("fr-open");
    // Everything behind the overlay is out of reach for focus and screen readers.
    this.inerted = [...document.body.children].filter((el) => el !== root && !el.inert && el.tagName !== "SCRIPT");
    for (const el of this.inerted) el.inert = true;
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

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 175);
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
    this.kit = createKit(renderer, { lite: this.lite });
    // 3D hints and countdown (an overlay scene drawn after the hall); 2D fallback at the lowest quality.
    this.ui = new UI3D(renderer, { still: this.reduceMotion, container: this.canvas.parentNode });

    this.buildWorld();
    this.buildRobot();
    this.buildToken();
    this.buildTools();
    this.buildTrail();
    this.applyTrim();
    this.applyCos();
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
    // The hall itself (floor, roof, walls, the shop-floor zones either side) lives in factory.js.
    this.factory = new Factory(scene);
    for (const x of LANES) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 190), M.lane);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(x, 0.003, -78);
      lane.receiveShadow = true;
      scene.add(lane);
    }
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 190), M.floor);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, 0.002, -78);
    bed.receiveShadow = true;
    scene.add(bed);
    // Roof trusses, cranes and the body conveyors overhead (ceiling.js). They replace round 3's flat light strips.
    this.ceiling = new Ceiling(scene);
    for (const s of [-1, 1]) scene.add(this.mesh(M.rail, 1.3, 0.55, 190, 4.45 * s, 0.275, -78, false));

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

  freshFx() {
    return { magnet: 0, drill: 0, hammer: 0, gold: 0, goldAge: 0, over: 0, meter: 0, smashCredit: 0, swing: 0, stop: 0, hitFlash: 0 };
  }

  // Combined multiplier: rolling ×1.5, golden ×2 climbing to ×5, overdrive ×2; capped at ×6.
  get mult() {
    const f = this.fx;
    const gold = f.gold > 0 ? Math.min(5, 2 + Math.floor(f.goldAge)) : 1;
    return Math.min(MULT_CAP, gold * (f.over > 0 ? 2 : 1));
  }

  // Milestone trims: the runner's light strips take the colour of the best badge you chose.
  applyTrim() {
    const best = this.profile ? this.profile.best : 0;
    const cos = MT.cosClean(this.profile && this.profile.cos);
    const m = MILESTONES.find((x) => x.id === this.settings.trim && best >= x.at) || MT.SHOP.find((x) => x.kind === "trim" && x.id === this.settings.trim && cos.owned.includes(x.id));
    const KM = this.kit.M;
    KM.light.color.setHex(m ? m.light : 0xa9bcff);
    KM.lightDeep.color.setHex(m ? m.deep : 0x7f95f0);
  }

  spawnItem(kind, lane, z, y = 1.05) {
    const g = this.pools[kind].pop() || buildTool(kind, this.TM, this.TG);
    if (!g.parent) this.scene.add(g);
    g.visible = true;
    g.scale.setScalar(1);
    g.position.set(LANES[lane], y, z);
    const it = { kind, g, lane, x: LANES[lane], y, z, taken: false, t: 0, mag: false };
    this.items.push(it);
    if (kind !== "screw") { this.lastTool = this.runTime; this.lastKind[kind] = this.runTime; }
    if (kind === "gold") this.goldOut = true;
    return it;
  }

  screwLine(lane, z) {
    const n = 3 + (LOOT() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) this.spawnItem("screw", lane, z + 3 - i * 2.0, 1.0);
  }

  toolReady() {
    const from = this.tutorial ? 25 : TOOL_FROM;
    return this.runTime >= from && this.runTime - (this.lastTool ?? -1e9) >= TOOL_GAP && !this.items.some((i) => i.kind !== "screw" && !i.taken);
  }

  pickTool() {
    const f = this.fx, ok = ["wrench", "drill", "hammer"].filter((k) =>
      this.runTime - (this.lastKind[k] ?? -1e9) >= TOOL_KIND_GAP && !(k === "wrench" ? f.magnet : f[k]));
    return ok.length ? pick(ok, LOOT) : null;
  }

  // Golden wrench: due once its random time comes (never while learning), or soon after a new best.
  goldReady() {
    if (this.goldOut || this.fx.gold > 0 || this.tutorial) return false;
    return this.runTime >= this.nextGold || (this.pbGoldAt != null && this.runTime >= this.pbGoldAt);
  }

  collect(it) {
    it.taken = true;
    const f = this.fx, k = it.kind;
    if (k === "screw") { this.screwsRun++; this.addScore(SCREW_POINTS * this.mult, it); this.learned("screw"); return; }
    this.buzz(20);
    this.toolsRun++;
    if (k === "wrench") f.magnet = MAGNET_T;
    else if (k === "drill") { f.drill = DRILL_T; f.smashCredit = 1; }
    else if (k === "hammer") { f.hammer = HAMMER_T; f.smashCredit = 1; }
    if (k !== "screw") this.lastToolKind = k;
    else if (k === "gold") {
      f.gold = GOLD_T; f.goldAge = 0; this.goldOut = false;
      if (this.pbGoldAt != null && this.runTime >= this.pbGoldAt) this.pbGoldAt = null;
      this.nextGold = this.runTime + GOLD_MIN + LOOT() * (GOLD_MAX - GOLD_MIN);
    }
    this.pop(k === "gold" ? "×2" : TOOL_NAME[k], it, true);
    if (this.tipNow === k) this.hideTip();
    this.learned(k);
    this.fillMeter(2);
  }

  fillMeter(n) {
    const f = this.fx;
    if (f.over > 0) return;
    f.meter = Math.min(METER_N, f.meter + n);
    if (f.meter >= METER_N) this.overdrive();
  }

  overdrive() {
    const f = this.fx;
    f.over = OVER_T; f.meter = 0; this.stat.over++;
    this.burst.emit("over", this.r.x, 1.2, 0, 22);
    this.elFlash.classList.remove("is-on"); void this.elFlash.offsetWidth; this.elFlash.classList.add("is-on");
    this.buzz(40);
    this.sfx("over");
    if (!this.tips.over) { this.showTip("over", 1.8); this.tips.over = 1; P.setSetting("tips", this.tips); }
    this.sr("Overdrive, times two.");
  }

  // Hammer and drill: break the thing instead of crashing into it.
  smash(o, i) {
    const f = this.fx, drill = o.type === "arm";
    this.burst.emit(o.type === "bot" ? "bot" : drill ? "arm" : "crate", o.x, drill ? 1.4 : 0.6, o.z, drill ? 10 : 14);
    o.g.visible = false; this.pools[o.type].push(o.g); this.obstacles.splice(i, 1);
    this.smashRun++;
    this.addScore((drill ? DRILL_POINTS : HAMMER_POINTS) * this.mult, { x: o.x, y: 1.2, z: o.z });
    f.stop = this.reduceMotion ? 0 : HIT_STOP;
    this.shake = this.reduceMotion ? 0 : Math.max(this.shake, 0.12);
    f.swing = 0.32;
    this.buzz(18);
    this.sfx(drill ? "drill" : "hammer", o.x);
    this.hitGold();
    if (f.smashCredit > 0) { f.smashCredit = 0; this.fillMeter(1); }
  }

  // Any contact (a smash, or passing through while invulnerable) ends the golden multiplier.
  hitGold() {
    const f = this.fx;
    if (this.driftS && this.driftS.level > 0) this.cashDrift();
    if (f.gold > 0) { f.gold = 0; f.goldAge = 0; this.pop("×1", { x: this.r.x, y: 1.6, z: 0 }, true); }
  }

  updateFx(dt) {
    const f = this.fx;
    for (const k of ["magnet", "drill", "hammer", "over"]) if (f[k] > 0) f[k] = Math.max(0, f[k] - dt);
    if (f.gold > 0) { f.gold = Math.max(0, f.gold - dt); f.goldAge += dt; this.stat.goldT += dt; }
    if (f.swing > 0) f.swing = Math.max(0, f.swing - dt);
    if (!f.drill && !f.hammer) f.smashCredit = 0;
    const d = this.driftS;
    if (d && d.level > 0 && this.runTime - d.last > DRIFT_CASH) this.cashDrift();
    if (this.r.landRoll > 0) this.r.landRoll = Math.max(0, this.r.landRoll - dt);
  }

  // Floating "+25" over the thing that paid it, projected to the screen. Pooled DOM.
  pop(text, at, big = false) {
    if (!this.popEls) this.popEls = [];
    let el = this.popEls.find((e) => !e._on);
    if (!el) {
      if (this.popEls.length >= 10) el = this.popEls.reduce((a, b) => (a._t < b._t ? a : b));
      else { el = document.createElement("span"); el.className = "fr__popup"; this.elPops.appendChild(el); this.popEls.push(el); }
    }
    const v = new THREE.Vector3(at.x, (at.y || 1) + 0.6, Math.min(at.z || 0, 0)).project(this.camera);
    el.textContent = text;
    el.style.left = `${((v.x + 1) / 2 * 100).toFixed(1)}%`;
    el.style.top = `${((1 - v.y) / 2 * 100).toFixed(1)}%`;
    el.classList.toggle("is-big", big);
    el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on");
    el._on = true; el._t = performance.now();
    clearTimeout(el._h); el._h = setTimeout(() => { el._on = false; el.classList.remove("is-on"); }, 750);
  }

  sfx(name, x = 0) { this.audio?.sfx(name, x / 4); }

  // Passing the old best mid-run: a 3D "New best", gear confetti, a chime, and a golden wrench soon after.
  passBest() {
    this.pbPassed = true;
    this.burst.emit("confetti", this.r.x, 1.6, -0.5, 26);
    this.buzz(35);
    this.sfx("pb");
    this.showTip("pb", 1.8, true);
    this.sr("New personal best.");
    if (this.pbGoldAt == null && !this.tutorial) this.pbGoldAt = this.runTime + PB_GOLD_DELAY;
  }

  /* ---------- Roller Mode: rails, ramps, drifts ---------- */
  makeRail() {
    const g = new THREE.Group(), M = this.M, TM = this.TM;
    const bar = new THREE.Mesh(BOX, TM.steel); bar.position.y = RAIL_H - 0.06; bar.scale.set(0.16, 0.1, 1); g.add(bar);
    const glow = new THREE.Mesh(BOX, M.strip); glow.position.y = RAIL_H - 0.13; glow.scale.set(0.2, 0.03, 1); g.add(glow);
    const posts = [];
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(BOX, TM.navy); p.scale.set(0.1, RAIL_H - 0.1, 0.1); p.position.y = (RAIL_H - 0.1) / 2; g.add(p); posts.push(p); }
    const lip = new THREE.Mesh(BOX, TM.peri); lip.scale.set(0.5, 0.06, 0.6); g.add(lip);   // entry plate at the near end
    g.userData = { bar, glow, posts, lip };
    this.scene.add(g);
    return g;
  }

  spawnRail(lane, zNear, len) {
    const g = this.pools.rail.pop() || this.makeRail(), u = g.userData;
    g.visible = true;
    g.position.set(LANES[lane], 0, zNear - len / 2);
    u.bar.scale.z = len; u.glow.scale.z = len;
    u.posts.forEach((p, i) => { p.position.z = -len / 2 + 0.3 + (i / 3) * (len - 0.6); });
    u.lip.position.set(0, 0.03, len / 2 - 0.3);
    const rail = { g, lane, x: LANES[lane], zNear, len, gears: 0 };
    this.rails.push(rail);
    // A dense gear line along the top.
    for (let z = zNear - 1.5; z > zNear - len + 1; z -= RAIL_GEAR_GAP) this.spawnGear(lane, z, RAIL_H + 0.65);
    return rail;
  }

  makeRamp() {
    const g = new THREE.Group();
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(RAMP_L, 0), new THREE.Vector2(RAMP_L, RAMP_H)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false }).translate(0, 0, -0.75).rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, this.TM.peri); m.castShadow = true; g.add(m);
    const edge = new THREE.Mesh(BOX, this.TM.navy); edge.scale.set(1.55, 0.08, 0.12); edge.position.set(0, RAMP_H + 0.02, -RAMP_L); g.add(edge);
    this.scene.add(g);
    return g;
  }

  // A ramp, and the gear constellation along the arc it throws you through.
  spawnRamp(lane, z) {
    const g = this.pools.ramp.pop() || this.makeRamp();
    g.visible = true;
    g.position.set(LANES[lane], 0, z);
    this.ramps.push({ g, lane, x: LANES[lane], z, used: false });
    // Gears along the analytic arc for the speed you'll hit it at.
    const v = this.speed * ROLL_SPEED, G = -GRAVITY, a = (RAMP_DEG * Math.PI) / 180, vy = v * Math.sin(a), vx = v * Math.cos(a);
    const T = (vy + Math.sqrt(vy * vy + 2 * G * RAMP_H)) / G;
    for (let t = 0.15; t < T - 0.1; t += 0.12) {
      const y = RAMP_H + vy * t - 0.5 * G * t * t;
      if (y > 0.9) this.spawnGear(lane, z - RAMP_L - vx * t, y + 0.3);
    }
  }

  drift() {
    const d = this.driftS, now = this.runTime;
    if (d.last != null && now - d.last <= DRIFT_CHAIN) d.level = Math.min(3, d.level + 1);
    d.last = now;
    if (d.level > 0) { this.sfx("screw", this.r.x); this.burst.emit("spark", this.r.x, 0.2, 0.2, 4); }
  }

  // Cash in the drift combo: the points earned while it ran, times its multiplier minus one.
  cashDrift() {
    const d = this.driftS;
    if (d.level > 0 && d.pool > 0) {
      const bonus = Math.round(d.pool * (DRIFT_MULT[d.level] - 1));
      d.level = 0; d.pool = 0;
      this.cashing = true;
      if (bonus > 0) { this.addScore(bonus); this.pop(`Drift +${bonus}`, { x: this.r.x, y: 2.2, z: 0 }, true); }
      this.cashing = false;
    }
    d.level = 0; d.pool = 0; d.last = null;
  }

  // Rows while rolling: one obstacle, never an arm (the roller can't slide), and a rail or a ramp.
  rollerRow(z) {
    const lanes = shuffle([0, 1, 2]);
    const left = DRIVE_T - this.pw.t;
    const nearRailEnd = (ln) => this.rails.some((r) => r.lane === ln && z > r.zNear - r.len - 12 && z < r.zNear - r.len + 2);
    const ob = lanes[0];
    if (!nearRailEnd(ob)) this.spawnObstacle(pick(["crate", "crate", "gap", "bot"]), ob, z);
    const free = lanes.slice(1).filter((ln) => !nearRailEnd(ln));
    const roll = COURSE();
    if (left > 4 && roll < 0.45) {
      // Rail over the obstacle's lane (grind over it) or a free one.
      const ln = COURSE() < 0.6 ? ob : pick(free.length ? free : [lanes[1]]);
      if (!this.rails.some((r) => r.lane === ln && r.zNear - r.len < z + 4)) this.spawnRail(ln, z + 2, 22 + COURSE() * 12);
    } else if (left > 3 && roll < 0.8 && free.length) this.spawnRamp(pick(free), z);
    else if (free.length) this.fillLane(pick(free), z, false);
    this.toNext = Math.max(18, this.speed * 0.7) + COURSE() * 8;
  }

  // Rails under the roller: snap on when in the lane (steered or hopped onto), drop off the far end.
  updateRails(dt, v) {
    const r = this.r;
    for (let i = this.rails.length - 1; i >= 0; i--) {
      const rl = this.rails[i];
      rl.zNear += v * dt;
      rl.g.position.z = rl.zNear - rl.len / 2;
      const under = rl.zNear - rl.len < 0 && rl.zNear > 0;
      if (this.state === "play" && this.driving && under && r.lane === rl.lane && !r.rail && !r.launch && r.hopRail !== rl && Math.abs(r.x - rl.x) < 0.5 && (r.vy <= 0 || r.y > RAIL_H - 0.2)) {
        r.rail = rl; r.ground = true; r.vy = 0; r.hopRail = null; r.y = Math.max(r.y, RAIL_H - 0.08); // snap
        this.sfx("tool", r.x);
      }
      if (r.rail === rl && (!under || r.lane !== rl.lane)) { r.rail = null; r.ground = false; r.vy = Math.min(r.vy, 0); r.coyote = COYOTE; }
      if (rl.zNear - rl.len > DESPAWN_Z) { rl.g.visible = false; this.pools.rail.push(rl.g); this.rails.splice(i, 1); }
    }
    if (r.rail) {
      r.y += (RAIL_H - r.y) * Math.min(1, dt * 20);
      this.grindT = (this.grindT || 0) - dt;
      if (this.grindT <= 0) { this.grindT = 0.06; this.burst.emit("spark", r.x, RAIL_H, 0.3, 2); }
    }
    for (let i = this.ramps.length - 1; i >= 0; i--) {
      const rp = this.ramps[i], zPrev = rp.z;
      rp.z += v * dt; rp.g.position.z = rp.z;
      // The lip is 3.4 ahead of the ramp's base.
      if (this.state === "play" && !rp.used && r.lane === rp.lane && Math.abs(r.x - rp.x) < 0.8 && r.y < 0.6 && zPrev - RAMP_L <= 0 && rp.z - RAMP_L >= 0) {
        // Off the lip at ground speed along a 35 degree face: vy = v sin, and the world runs at v cos in the air.
        const a = (RAMP_DEG * Math.PI) / 180;
        rp.used = true; r.launch = true; r.ground = false; r.rail = null; r.vy = v * Math.sin(a); r.y = RAMP_H; r.launchVx = v * Math.cos(a); r.launchAt = this.runTime;
        this.sfx("power", r.x); this.buzz(20);
      }
      if (rp.z - RAMP_L > DESPAWN_Z) { rp.g.visible = false; this.pools.ramp.push(rp.g); this.ramps.splice(i, 1); }
    }
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
      o.bv = BOT_SPEED; o.turn = 0; o.to = lane; o.turnIn = 0.6 + LOOT() * 1.6; o.turned = 0;
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
        o.turnIn = 1 + LOOT() * 1.5;
        const opts = [o.lane - 1, o.lane + 1].filter((l) => l >= 0 && l <= 2 && this.laneFree(l, o.z, o));
        if (opts.length && LOOT() < 0.7) { o.to = pick(opts, LOOT); o.turn = BOT_TURN_T; }
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
    if (this.driving && this.pw.t < DRIVE_T - 2.2) return this.rollerRow(z);
    const diff = (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    // Mobile robots get their own row so they never close the last open lane:
    // at most two, and every bot is low enough to jump.
    if (this.runTime >= BOT_FROM && COURSE() < 0.18 + diff * 0.32) {
      const lanes = shuffle([0, 1, 2]);
      const n = diff > 0.45 && COURSE() < 0.4 ? 2 : 1;
      for (const ln of lanes.slice(0, n)) this.spawnObstacle("bot", ln, z - COURSE() * 3);
      if (COURSE() < 0.6) { const ln = lanes[2]; this.fillLane(ln, z, false); }
      this.toNext = Math.max(16, this.speed * 0.7) + COURSE() * 10;
      return;
    }
    const n = !this.tutorial && COURSE() < 0.35 + diff * 0.35 ? 2 : 1; // never all three lanes; one at a time while learning
    const lanes = shuffle([0, 1, 2]);
    const types = diff < 0.15 ? ["crate", "gap", "arm"] : ["crate", "gap", "arm", "stack", "stack"];
    let crateLane = -1;
    for (const ln of lanes.slice(0, n)) {
      const t = pick(types);
      if (t === "crate") crateLane = ln;
      this.spawnObstacle(t, ln, z);
    }
    const roll = COURSE();
    if (crateLane >= 0 && roll < 0.35) {
      for (let i = 0; i < 5; i++) { const u = (i - 2) / 2; this.spawnGear(crateLane, z - u * 2.4, 1.0 + 1.3 * (1 - u * u)); }
    } else if (roll < 0.8) {
      const ln = pick(lanes.slice(n));
      this.fillLane(ln, z, true);
    }
    this.toNext = (Math.max(14, this.speed * 0.62) + COURSE() * 10) * (this.tutorial ? 1.35 : 1);
  }

  // What an open lane carries: a wheel token, the golden wrench, a tool, a screw line or gears.
  // Only ever lanes with nothing in them this row, so no pickup sits where you can't go.
  fillLane(ln, z, tools) {
    if (tools && this.tokenReady() && LOOT() < WHEEL_CHANCE) return this.spawnToken(ln, z);
    if (tools && this.goldReady()) return this.spawnItem("gold", ln, z);
    if (tools && this.toolReady() && LOOT() < TOOL_CHANCE) { const k = this.pickTool(); if (k) return this.spawnItem(k, ln, z); }
    if (this.runTime >= 4 && LOOT() < 0.3) return this.screwLine(ln, z);
    for (let i = 0; i < 5; i++) this.spawnGear(ln, z + 4.8 - i * 2.4, 1.0);
  }

  tokenReady() {
    return !this.token && this.pw.phase === "none" && this.runTime >= WHEEL_FROM && this.runTime - (this.lastToken ?? -1e9) >= WHEEL_GAP;
  }

  spawnToken(lane, z) {
    this.lastToken = this.runTime;
    this.token = { x: LANES[lane], y: 1.05, z, taken: false, t: 0 };
    const T = this.tokenMesh;
    T.g.visible = true;
    T.g.scale.setScalar(1);
    T.g.position.set(this.token.x, this.token.y, z);
  }

  clearWorld() {
    if (this.token) { this.token = null; this.tokenMesh.g.visible = false; }
    for (const it of this.items) { it.g.visible = false; this.pools[it.kind].push(it.g); }
    this.items.length = 0;
    for (const x of this.rails || []) { x.g.visible = false; this.pools.rail.push(x.g); }
    for (const x of this.ramps || []) { x.g.visible = false; this.pools.ramp.push(x.g); }
    if (this.rails) { this.rails.length = 0; this.ramps.length = 0; }
    this.r.rail = null; this.r.launch = false; this.r.landRoll = 0;
    this.goldOut = false;
    this.burst?.clear();
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
    if (this.ui) { this.ui.resize(w, h); this.placeTipSub(); }
  }

  // 3D hints and countdown unless quality has dropped to its last step.
  get use3d() { return this.quality < 3 && !window.__frFlatUi; }

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
    const MOVES = { arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "jump", w: "jump", " ": "jump", arrowdown: "slide", s: "slide" };
    this.onKey = (e) => {
      const t = e.target;
      const typing = t && /^(INPUT|TEXTAREA)$/.test(t.tagName);
      const onControl = t && t.closest && t.closest("button, a, input");
      const k = e.key.toLowerCase();
      if (e.key === "Tab") return this.trapFocus(e);
      if (e.key === "Escape") {
        e.preventDefault();
        if (typing) { t.blur(); return; }
        if (this.state === "play" || this.state === "count") this.pause();
        else if (this.state === "pause") this.resume();
        else if (this.view === "restore" || this.view === "claim" || this.view === "code") this.backFromSub();
        else if (!this.opts.standalone) this.close();
        return;
      }
      if (typing) return;
      if (this.state === "play") {
        if (MOVES[k]) { e.preventDefault(); if (!e.repeat) this.act(MOVES[k]); }
        else if (k === "p") this.pause();
      } else if (this.state === "count") {
        if (MOVES[k]) e.preventDefault();
        if (k === "p") this.pause();
      } else if (this.state === "pause") {
        if (k === "p" || (k === " " && !onControl)) { e.preventDefault(); this.resume(); }
      } else if ((this.view === "over" || (this.view === "menu" && this.profile && !this.switching)) && (k === "enter" || k === " ") && !onControl) {
        e.preventDefault();
        if (!e.repeat) this.tryStart();
      } else if (MOVES[k]) {
        e.preventDefault(); // arrows and space never scroll the page behind
      }
    };
    window.addEventListener("keydown", this.onKey);

    // Swipes fire as soon as the finger has moved far enough; a short, quick flick
    // that ends before the threshold still counts on release.
    this.onDown = (e) => {
      if (this.state !== "play" || e.target.closest("button, .fr__panel, .fr__wheelpad")) return;
      if (this.swipe && this.swipe.id !== e.pointerId && !this.swipe.done) return; // ignore a second finger
      this.swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), done: false };
    };
    const fire = (dx, dy) => {
      if (Math.abs(dx) > Math.abs(dy)) this.act(dx < 0 ? "left" : "right");
      else this.act(dy < 0 ? "jump" : "slide");
    };
    this.onMove = (e) => {
      const s = this.swipe;
      if (!s || s.done || e.pointerId !== s.id || this.state !== "play") return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      const th = Math.max(18, Math.min(window.innerWidth, window.innerHeight) * 0.04);
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      s.done = true;
      fire(dx, dy);
    };
    this.onUp = (e) => {
      const s = this.swipe;
      if (s && !s.done && e && e.type === "pointerup" && e.pointerId === s.id && this.state === "play") {
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 10 && performance.now() - s.t < 180) fire(dx, dy);
      }
      if (!e || !s || e.pointerId === s.id) this.swipe = null;
    };
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);

    // No page scroll, pull-to-refresh, pinch zoom, long-press menus or stray text selection.
    const free = (t) => t.closest && t.closest("input, .fr__code");
    this.onTouchMove = (e) => { if (!e.target.closest(".fr__panel") || e.touches.length > 1) e.preventDefault(); };
    this.root.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.onGesture = (e) => e.preventDefault();
    document.addEventListener("gesturestart", this.onGesture);
    this.root.addEventListener("dblclick", this.onGesture);
    this.root.addEventListener("contextmenu", (e) => { if (!free(e.target)) e.preventDefault(); });
    this.root.addEventListener("selectstart", (e) => { if (!free(e.target)) e.preventDefault(); });

    // Thumb wheel: the quarter you press is the move (by angle from the centre, so the whole
    // disc is live, hub included), with a press flash and a tick of vibration.
    this.onWheel = (e) => {
      const w = this.wheelPad, r = w.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) > r.width * 0.62) return;
      e.preventDefault();
      e.stopPropagation();
      const move = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "jump" : "slide");
      const b = w.querySelector(`[data-move="${move}"]`);
      b.classList.remove("is-press"); void b.offsetWidth; b.classList.add("is-press");
      clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("is-press"), 160);
      if (this.state === "play") { this.act(move); this.buzz(6); }
    };
    this.wheelPad.addEventListener("pointerdown", this.onWheel);
    this.pad.addEventListener("click", (e) => e.preventDefault());
    this.root.querySelector(".fr__corner").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "close") this.close();
      if (b.dataset.act === "pause") this.state === "pause" ? this.resume() : this.pause();
    });
    // A tap anywhere on the game-over screen (outside its buttons) runs again.
    this.layer.addEventListener("click", (e) => {
      if (this.view === "over" && !e.target.closest("button, a, input, form, .fr__board, .fr__save")) this.tryStart();
    });
    this.panel.addEventListener("click", (e) => { if (e.target.closest("button")) this.sfx("tap"); this.onPanelClick(e); });
    this.panel.addEventListener("submit", (e) => this.onPanelSubmit(e));
    this.panel.addEventListener("input", (e) => this.onPanelInput(e));
    this.panel.addEventListener("focusin", (e) => {
      if (e.target.tagName === "INPUT") setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: this.reduceMotion ? "auto" : "smooth" }), 300);
    });

    // GPU reset (context loss): stop, keep the run paused, and pick up again when the context is back.
    this.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.ctxLost = true; this.autoPause(); });
    this.canvas.addEventListener("webglcontextrestored", () => { this.ctxLost = false; this.drawn = false; this.applyQuality(); });
    this.onVis = () => { if (document.hidden) { this.autoPause(); this.audio?.suspend(); } else this.audio?.resume(); };
    document.addEventListener("visibilitychange", this.onVis);
    this.onBlur = () => this.autoPause();
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pagehide", this.onBlur);
    this.onOnline = () => { if (this.board.status !== "ok") this.refreshBoard(); };
    window.addEventListener("online", this.onOnline);

    this.onResize = () => { this.resize(); this.drawn = false; };
    this.onTurn = () => { this.autoPause(); this.onResize(); };
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onTurn);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", this.onResize);
    if ("ResizeObserver" in window) { this.ro = new ResizeObserver(this.onResize); this.ro.observe(this.root); }

    // Back button closes the overlay instead of leaving the page.
    if (!this.opts.standalone) {
      history.pushState({ factoryRun: true }, "");
      this.onPop = () => this.close(true);
      window.addEventListener("popstate", this.onPop);
    }
  }

  // Keep Tab inside the game while it is open.
  trapFocus(e) {
    const els = [...this.root.querySelectorAll("button, input, a[href]")].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1], a = document.activeElement;
    if (!this.root.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }

  autoPause() {
    if (this.state === "play" || this.state === "count") this.pause();
  }

  buzz(ms) {
    if (this.settings.haptics && this.canBuzz) { try { navigator.vibrate(ms); } catch { /* ignore */ } }
  }

  act(move) {
    const r = this.r;
    if (move === "left" || move === "right") {
      const to = move === "left" ? Math.max(0, r.lane - 1) : Math.min(2, r.lane + 1);
      if (to !== r.lane) { r.lane = to; this.buzz(8); if (this.driving && this.state === "play") this.drift(); }
      this.learned("lanes");
    } else if (move === "jump" && this.driving) {
      // The roller only hops (a rail hop lands back on the rail).
      if (r.ground || r.rail || r.coyote > 0) { r.coyote = 0; r.vy = HOP_V; r.ground = false; r.hopRail = r.rail; r.rail = null; this.sfx("jump", r.x); if (this.stat) this.stat.jumps++; }
      this.learned("jump");
    } else if (move === "slide" && this.driving) {
      // No slide in Roller Mode (the wheel already rolls under the arms).
    } else if (move === "jump") {
      if (r.ground) { r.vy = JUMP_V; r.ground = false; r.slideT = 0; r.jumpBuf = 0; this.buzz(10); this.sfx("jump", r.x); if (this.stat) this.stat.jumps++; }
      else { r.jumpBuf = JUMP_BUF; r.queueSlide = false; } // buffered: fires on landing
      this.learned("jump");
    } else if (move === "slide") {
      if (r.ground) { r.slideT = SLIDE_T; this.sfx("slide", r.x); }
      else { r.vy = Math.min(r.vy, -16); r.queueSlide = true; r.jumpBuf = 0; }
      this.learned("slide");
    }
  }

  /* ---------- first-run tips ---------- */
  tipLines(id) {
    const t = TIPS[id];
    return t.all || (this.coarse ? t.touch : t.keys);
  }
  tipText(id) { return this.tipLines(id).join(" "); }

  showTip(id, secs = 2.6, again = false) {
    if ((this.tips[id] && !again) || this.tipNow === id) return;
    this.tipNow = id;
    this.tipLeft = secs;
    this.tipAt = this.realT || 0;
    const ic = TIPS[id].icon, [title, sub] = this.tipLines(id);
    const flat = !this.use3d;
    this.tipEl.classList.toggle("is-3d", !flat);
    this.tipEl.querySelector(".fr__tip-icon").innerHTML = ic === "lr" ? ICON.left + ICON.right : ic === "wheel" ? ICON.wheel : ICON[ic];
    this.tipEl.querySelector(".fr__tip-title").textContent = title;
    this.tipEl.querySelector(".fr__tip-text").textContent = sub;
    this.tipEl.dataset.tip = id;
    if (!flat) { this.ui.showHint(id, title, ic); this.placeTipSub(); }
    this.tipEl.classList.remove("is-on");
    void this.tipEl.offsetWidth;
    this.tipEl.classList.add("is-on");
    if (!again) this.sr(this.tipText(id));
    // First sight of a jump, slide or wheel hint: time eases down so there's a moment to read it.
    if (!again && !NO_SLOW.has(id) && !this.reduceMotion) this.slowT = SLOW_T;
  }

  // The 3D title lives in the overlay scene; its quieter line is crisp DOM text under it.
  placeTipSub() {
    if (!this.tipNow || !this.use3d || !this.ui.hint.on) return;
    this.tipEl.style.setProperty("--fr-tip-y", `${this.ui.hint.subY.toFixed(1)}px`);
  }

  hideTip() {
    this.tipNow = null;
    this.tipEl.classList.remove("is-on");
    this.ui?.hideHint();
  }

  // A tip is done once the player has done the thing it teaches.
  learned(id) {
    if (this.tips[id]) return;
    this.tips[id] = 1;
    P.setSetting("tips", this.tips);
    if (this.tipNow === id) this.tipLeft = Math.min(this.tipLeft, 0.5);
  }

  updateTips(dt) {
    if (this.tipNow) {
      this.tipLeft -= dt;
      if (this.tipLeft <= 0) this.hideTip();
    }
    // The first time something needs a jump or a slide, say so while it's still well ahead
    // (a jump or slide hint takes over from the lanes hint; it's the one that matters now).
    if (!this.tipNow || this.tipNow === "lanes") {
      for (const o of this.obstacles) {
        if (o.passed || o.z < -48 || o.z > -11 || Math.abs(o.x - this.r.x) > 1.2) continue;
        const need = o.type === "arm" ? "slide" : o.type === "stack" ? null : "jump";
        if (need && !this.tips[need]) return this.showTip(need, 2.4);
      }
    }
    if (this.tipNow) return;
    if (!this.tips.lanes && this.runTime > 0.8 && this.runTime < 30) return this.showTip("lanes", 3);
    const tk = this.token;
    if (tk && !tk.taken && tk.z > -56 && tk.z < -8 && !this.tips.wheel) return this.showTip("wheel", 2.6);
    // First sight of each tool, while it's still well ahead.
    for (const it of this.items) if (!it.taken && it.z > -56 && it.z < -8 && !this.tips[it.kind]) return this.showTip(it.kind, 2.6);
  }

  /* ---------- run lifecycle ---------- */
  // Keys and taps on the game-over screen wait a beat, so a last frantic swipe can't restart by accident.
  // Run modes: "free" (a fresh seed), "daily" (today's shared course), "challenge" (a friend's seed).
  tryStart(mode = this.mode || "free") {
    if (this.view === "over" && performance.now() - (this.overAt || 0) < OVER_LOCK) return;
    if (this.view === "menu" && !this.profile) return;
    this.startRun(mode);
  }

  startRun(mode = this.mode || "free") {
    if (!this.profile) return this.showMenu();
    this.mode = mode === "challenge" && !this.challenge ? "free" : mode;
    this.day = MT.vanDay();
    this.seed = this.mode === "daily" ? MT.dailySeed(this.day) : this.mode === "challenge" ? this.challenge.seed : (Math.random() * 4294967296) >>> 0;
    COURSE = MT.rng(this.seed);
    LOOT = MT.rng(this.seed ^ 0x9e3779b9);
    this.stat = { smash: 0, goldT: 0, screws: 0, gearsRun: 0, tools: 0, over: 0, daily: this.mode === "daily" ? 1 : 0, jumps: 0, score: 0 };
    const fromMenu = this.view === "menu";
    this.clearWorld();
    this.hideTip();
    Object.assign(this.r, { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false, jumpBuf: 0, rail: null, hopRail: null, launch: false, landRoll: 0 });
    const R = this.robot;
    R.root.rotation.set(0, 0, 0);
    R.root.position.set(0, 0, 0);
    this.resetPower();
    this.lastToken = null;
    this.rate.b.fill(0); this.rate.i = -1;
    this.speed = START_SPEED;
    this.runTime = 0;
    this.score = 0;
    this.gearsRun = 0;
    this.screwsRun = 0; this.toolsRun = 0; this.smashRun = 0;
    this.fx = this.freshFx();
    this.driftS = { level: 0, pool: 0, last: null };
    this.runDist = 0; this.bestMult = 1;
    this.lastTool = null; this.lastKind = {};
    this.nextGold = GOLD_MIN + LOOT() * (GOLD_MAX - GOLD_MIN);
    this.pbGoldAt = null;
    this.pbFrom = this.profile.best;
    this.pbPassed = false;
    this.rawScore = 0;
    this.toNext = 10;
    this.slowT = 0;
    // First run (until lanes, jump and slide are learned): a gentler start and roomier rows.
    this.tutorial = !(this.tips.lanes && this.tips.jump && this.tips.slide);
    this.deathT = 0;
    this.fps.frames = 0; this.fps.acc = 0;
    this.shown = { score: -1, gears: -1, mult: -1, meter: -1, chips: "", pb: -1 };
    this.elPb.hidden = !(this.pbFrom > 0);
    this.elPb.classList.remove("is-past");
    this.elPbLabel.textContent = `PB ${fmt(this.pbFrom)}`;
    this.elBest.textContent = fmt(this.profile.best);
    this.state = "play";
    this.view = "play";
    this.deathKind = null;
    this.hidePanel();
    this.hud.hidden = false;
    this.btnPause.hidden = false;
    this.btnPause.setAttribute("aria-label", "Pause");
    this.pad.hidden = !this.settings.pad;
    this.elPower.classList.remove("is-ending");
    this.root.classList.add("is-playing");
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    // From the menu: 3-2-1-GO. A quick retry from game over: just the GO beat.
    if (fromMenu) this.startCount(["3", "2", "1", "GO"]);
    else this.startCount(["GO"]);
  }

  /* ---------- wheel power-up ---------- */
  resetPower() {
    this.pw = { phase: "none", t: 0 };
    const R = this.robot;
    R.form = "runner";
    R.runner.root.visible = true; R.runner.root.scale.setScalar(1); R.runner.root.rotation.set(0, 0, 0);
    R.roller.root.visible = false; R.roller.root.scale.setScalar(1);
    R.flash.visible = false;
    this.elPower.hidden = true;
    this.shownRing = -1;
  }

  startDrive() {
    this.pw = { phase: "in", t: 0 };
    this.elPower.hidden = false;
    this.elPower.classList.remove("is-ending");
    this.shownRing = -1;
    this.buzz(25);
    this.sfx("power");
    this.fillMeter(2);
    if (this.stat) this.stat.tools++;
    if (this.tipNow === "wheel") this.hideTip();
    this.learned("wheel");
    if (!this.tips.rolling && this.state === "play") {
      this.showTip("rolling", 2.4);
      this.tips.rolling = 1;
      P.setSetting("tips", this.tips);
    }
  }

  // in -> drive -> out -> grace -> none. Morphs and grace are invulnerable.
  updatePower(dt) {
    const pw = this.pw;
    if (pw.phase === "none") return;
    pw.t += dt;
    if (pw.phase === "in" && pw.t >= MORPH_T) pw.phase = "drive";
    if (pw.phase === "drive" && pw.t >= DRIVE_T - MORPH_T) { pw.phase = "out"; pw.outAt = pw.t; }
    if (pw.phase === "out" && pw.t >= DRIVE_T) { this.cashDrift(); pw.phase = "grace"; pw.graceAt = pw.t; this.elPower.hidden = true; }
    if (pw.phase === "grace" && pw.t >= DRIVE_T + GRACE_T) this.resetPower();
    if (pw.phase === "in" || pw.phase === "drive" || pw.phase === "out") {
      const left = Math.max(0, 1 - pw.t / DRIVE_T);
      const q = Math.round(left * 200);
      if (q !== this.shownRing) { this.shownRing = q; this.elRing.style.strokeDashoffset = ((1 - left) * 119.38).toFixed(2); }
      this.elPower.classList.toggle("is-ending", pw.t > DRIVE_T - 1.6);
      const dl = this.driftS ? this.driftS.level : 0, lab = dl ? `Drift ×${DRIFT_MULT[dl]}` : this.r.rail ? "Grinding" : this.r.launch ? "Airborne" : "Roller Mode";
      if (lab !== this.shownPw) { this.shownPw = lab; this.elPower.querySelector(".fr__power-label").textContent = lab; this.elPower.classList.toggle("is-combo", dl > 0); }
    }
  }

  get driving() { return this.pw.phase === "in" || this.pw.phase === "drive" || this.pw.phase === "out"; }
  get invulnerable() { const p = this.pw.phase; return p === "in" || p === "out" || p === "grace" || this.r.launch || this.r.landRoll > 0; }

  // Every point goes through here: at most RATE_CAP in any one-second window, and never more
  // than AVG_CAP per second of run plus BURST (the leaderboard Worker checks the same line).
  // `at`: where it was earned, for the floating "+25".
  addScore(pts, at) {
    this.rawScore += pts;
    // 0.1 s buckets; the cap holds over the current one plus the ten before it
    // (1.0 to 1.1 s), so every one-second window stays under it.
    const R = this.rate, n = R.b.length, i = Math.floor(this.runTime * 10);
    if (i !== R.i) { if (i - R.i >= n || i < R.i) R.b.fill(0); else for (let k = R.i + 1; k <= i; k++) R.b[k % n] = 0; R.i = i; }
    let sum = 0;
    for (let k = 0; k < n; k++) sum += R.b[k];
    const room = allowedScore(this.runTime) - this.score;
    const add = Math.max(0, Math.min(pts, RATE_CAP - sum, room));
    R.b[i % n] += add;
    this.score += add;
    if (this.driftS && this.driftS.level > 0 && !this.cashing) this.driftS.pool += add;
    if (at && add >= 1) {
      this.pop(`+${Math.round(add)}`, at, add >= 60);
      this.elScoreBox.classList.remove("is-tick"); void this.elScoreBox.offsetWidth; this.elScoreBox.classList.add("is-tick");
    }
  }

  pause() {
    if (this.state !== "play" && this.state !== "count") return;
    this.saveUi = { open: "", msg: "", busy: false, code: "" };
    this.state = "pause";
    this.view = "pause";
    this.audio?.mood("pause");
    this.swipe = null;
    this.drawn = false;
    this.stopCount();
    this.btnPause.setAttribute("aria-label", "Resume");
    this.pad.hidden = true;
    this.root.classList.remove("is-playing");
    this.renderPanel(`
      <h2 class="fr__title">Paused</h2>
      <p class="fr__lede"><b class="fr__num">${fmt(this.score)}</b> <span class="fr__soft">at ${clock(this.runTime)} · ${fmt((this.runDist || 0) * M_PER_U)} m</span></p>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid fr__btn--wide" type="button" data-panel="resume">Resume</button>
        <button class="fr__btn" type="button" data-panel="restart">Restart</button>
        <button class="fr__btn" type="button" data-panel="menu">Quit run</button>
      </div>
      <div data-slot="save">${this.saveHtml("pause")}</div>
      ${this.settingsHtml()}`);
  }

  // Resume after a short 3-2-1 so nobody comes back straight into a crate.
  resume() {
    if (this.state !== "pause") return;
    this.view = "play";
    this.startCount(["3", "2", "1", "GO"]);
    this.btnPause.setAttribute("aria-label", "Pause");
    this.pad.hidden = !this.settings.pad;
    this.root.classList.add("is-playing");
    this.hidePanel();
    this.last = performance.now();
  }

  // The numbers hold the run still; play starts on GO while GO itself plays out.
  startCount(seq) {
    this.countSeq = seq;
    this.countT = 0;
    this.shownCount = "";
    this.countHold = (seq.length - 1) * COUNT_BEAT;
    this.state = this.countHold > 0 ? "count" : "play";
    this.countFlat = !this.use3d;
    this.audio?.mood("run");
    this.audio?.countIn(seq.length, COUNT_BEAT);
    if (this.countFlat) this.ui.stopCount(); else this.ui.startCount(seq);
    this.countOn = true;
    this.tickCount(0);
  }

  stopCount() {
    this.countOn = false;
    this.ui?.stopCount();
    this.countEl.classList.remove("is-on");
    this.countEl.dataset.n = "";
  }

  // Runs on real time in every state, so GO finishes even after play resumes.
  tickCount(dt) {
    if (!this.countOn) return;
    this.countT += dt;
    const n = this.countSeq.length, i = Math.min(n - 1, Math.floor(this.countT / COUNT_BEAT));
    const label = this.countSeq[i];
    if (label !== this.shownCount) {
      this.shownCount = label;
      if (this.countFlat) {
        this.countEl.querySelector(".fr__count-num").textContent = label;
        this.countEl.dataset.n = label;
        this.countEl.classList.remove("is-on");
        void this.countEl.offsetWidth; // restart the punch
        this.countEl.classList.add("is-on");
      }
    }
    if (this.state === "count" && this.countT >= this.countHold) this.state = "play";
    if (this.countT >= this.countHold + 0.5) this.stopCount();
  }

  updateCount() { /* kept for the old test harness: the countdown now ticks in loop() */ }

  die(kind, type) {
    if (this.state !== "play") return;
    this.state = "dying";
    this.deathKind = kind;
    this.deathType = type;
    this.deathT = 0;
    this.deathSpeed = this.speed;
    this.shake = this.reduceMotion ? 0 : 0.35;
    this.btnPause.hidden = true;
    this.pad.hidden = true;
    this.hideTip();
    this.root.classList.remove("is-playing");
    this.pbLine.visible = false;
    this.buzz(60);
    this.sfx("hit", this.r.x);
    this.audio?.mood("over");
  }

  endRun() {
    this.state = "over";
    this.hud.hidden = true;
    const score = Math.floor(this.score);
    const prevBest = this.profile.best;
    P.recordRun(this.profile, score, this.gearsRun);
    const durationMs = Math.round(this.runTime * 1000);
    const post = !P.online() ? "local" : durationMs < 3000 || score <= 0 ? "short" : "posting";
    const best = score > prevBest && score > 0;
    // Personal-best streak: consecutive runs that each beat the one before.
    const streak = best && prevBest > 0 ? (this.settings.pbStreak || 0) + 1 : best ? 1 : 0;
    this.settings.pbStreak = streak; P.setSetting("pbStreak", streak);
    const newBadge = MILESTONES.filter((m) => score >= m.at && prevBest < m.at).pop() || null;
    // Missions, Daily Run streak, the shop wallet and the teaser's summary.
    const st = this.stat;
    Object.assign(st, { smash: this.smashRun, screws: this.screwsRun, gearsRun: this.gearsRun, tools: this.toolsRun, score, goldT: Math.floor(st.goldT) });
    const ms = MT.missionsApply(MT.missionsFill(this.settings.missions), st);
    this.settings.missions = ms.list; P.setSetting("missions", ms.list);
    const reward = ms.done.reduce((a, m) => a + m.reward, 0);
    if (reward) { this.profile.gears += reward; P.save(this.profile); }
    if (this.mode === "daily" && this.runTime >= 3) {
      this.settings.streak = MT.bumpStreak(this.settings.streak, this.day); P.setSetting("streak", this.settings.streak);
      const db = this.settings.dailyBest || {};
      if (db.day !== this.day || score > db.score) { this.settings.dailyBest = { day: this.day, score }; P.setSetting("dailyBest", this.settings.dailyBest); }
    }
    // Where and how: the nearest bay and the speed (real scale) for the headline.
    const slot = this.factory.slots.reduce((a, b) => (Math.abs(b.z) < Math.abs(a.z) ? b : a), this.factory.slots[0]);
    const bay = (slot && BAY[slot.type]) || "the line", mps = Math.round((this.deathSpeed || this.speed) * M_PER_U);
    const late = (this.deathType === "stack" && this.fx.hammer <= 0 && this.lastToolKind === "hammer") ? "hammer" : (this.deathType === "arm" && this.lastToolKind === "drill" && this.fx.drill <= 0) ? "drill" : this.deathType;
    const pool = HEADLINES[late] || ["Run over"];
    let headline = pool[(Math.random() * pool.length) | 0].replace("{v}", mps).replace("{bay}", bay);
    headline = headline[0].toUpperCase() + headline.slice(1);
    const prevRank = this.settings.rank || null;
    this.lastRun = { mode: this.mode, seed: this.seed, headline, prevRank, dist: Math.round((this.runDist || 0) * M_PER_U), bestMult: this.bestMult || 1, missionsDone: ms.done, reward, challenge: this.mode === "challenge" ? this.challenge : null,
      score, gears: this.gearsRun, time: this.runTime, best, prevBest, delta: score - prevBest, streak, badge: newBadge,
      screws: this.screwsRun, tools: this.toolsRun, smashes: this.smashRun, rank: null, post, cause: CAUSE[this.deathType] || "Run over" };
    this.showOver();
    this.sr(`Run over. ${fmt(score)} points.${this.lastRun.best ? " New best." : ""}`);
    this.publish();
    this.submitRun(score, durationMs);
  }

  // Read-only summary for the portfolio's teaser (game/README.md).
  publish() {
    const p = this.profile;
    if (!p) return;
    const db = this.settings.dailyBest, day = MT.vanDay();
    MT.writePublic({ name: p.username, best: p.best, rank: this.settings.rank || null, streak: MT.liveStreak(this.settings.streak).n, dailyBest: db && db.day === day ? db.score : 0 });
  }

  async submitRun(score, durationMs) {
    if (!P.online()) return;
    const p = this.profile;
    if (this.lastRun.post === "posting") {
      const run = this.lastRun;
      const res = await P.postScore(p, score, durationMs, { mode: this.lastRun.mode, ...(this.lastRun.mode === "daily" ? { day: this.day, seed: this.seed } : {}) });
      run.post = res.ok ? "ok" : res.status === 403 ? "claimed" : res.status === 429 ? "busy" : res.offline && navigator.onLine === false ? "offline" : "error";
      if (res.ok && res.data && res.data.rank) { run.rank = res.data.rank; this.settings.rank = res.data.rank; P.setSetting("rank", this.settings.rank); this.publish(); }
      if (res.ok && res.data && res.data.dailyRank) run.dailyRank = res.data.dailyRank;
      if (res.status === 403) { p.claimed = true; p.code = ""; p.token = ""; }
      // Not posted: keep it (the best one) for when the board can take it.
      if (!res.ok) P.hold(p, score, durationMs);
      else if (p.held && p.held.score <= score) { p.held = null; P.save(p); }
      if (run === this.lastRun) { this.updateOverStatus(); this.refreshSave(); }
      if (res.ok && p.held) await this.postHeld();
    }
    if (P.linked(p)) {
      const s = await P.sync(p);
      if (s.ok && s.data && s.data.profile) P.merge(p, s.data.profile);
    }
    this.refreshBoard();
  }

  // Post the held run (the best one the board missed). Updates the game-over card if it's that run.
  async postHeld() {
    const p = this.profile, h = p && p.held;
    if (!h) return null;
    const res = await P.postScore(p, h.score, h.durationMs);
    if (res.ok) {
      p.held = null; P.save(p);
      const run = this.lastRun;
      if (run && run.score === h.score && run.post !== "ok") { run.post = "ok"; run.rank = res.data && res.data.rank; this.updateOverStatus(); }
    } else if (res.status === 403) { p.claimed = true; P.save(p); }
    return res;
  }

  async refreshBoard() {
    if (!P.online()) { this.board = { status: "soon", rows: [] }; return; }
    const tab = this.boardTab || "all";
    if (this.board.status !== "ok" || this.board.tab !== tab) { this.board = { status: "loading", rows: [], tab }; this.paintBoard(); }
    const res = await P.topScores(tab);
    if ((this.boardTab || "all") !== tab) return;
    this.board = res.ok && res.data && Array.isArray(res.data.scores)
      ? { status: "ok", rows: res.data.scores.slice(0, 10), tab, resetAt: res.data.resetAt || null }
      : { status: "error", rows: this.board.rows || [], tab };
    this.paintBoard();
  }

  paintBoard() {
    const b = this.panel.querySelector(".fr__board");
    if (b) b.outerHTML = this.boardHtml();
  }

  /* ---------- panels ---------- */
  renderPanel(html, view) {
    if (view) this.view = view;
    this.layer.hidden = false;
    this.panel.innerHTML = html;
    this.panel.scrollTop = 0;
    this.panel.dataset.view = this.view;
    this.layer.dataset.view = this.view;
    const f = this.panel.querySelector("[autofocus], .fr__btn--solid");
    if (f && !(this.coarse && f.tagName === "INPUT")) f.focus({ preventScroll: true });
  }

  hidePanel() {
    this.layer.hidden = true;
    this.layer.dataset.view = "";
    this.layer.classList.remove("is-arming");
    this.panel.innerHTML = "";
  }

  sr(msg) {
    this.srEl.textContent = "";
    setTimeout(() => { this.srEl.textContent = msg; }, 30);
  }

  boardHtml() {
    const tab = this.boardTab || "all";
    const tabs = P.online() ? `<div class="fr__tabs" role="tablist">${[["daily", "Daily"], ["weekly", "Weekly"], ["all", "All-time"]].map(([k, n]) =>
      `<button class="fr__tab" type="button" role="tab" data-panel="board" data-board="${k}" aria-selected="${k === tab}">${n}</button>`).join("")}</div>` : "";
    const inner = this.boardInner();
    const reset = tab !== "all" ? `<p class="fr__muted fr__reset">Resets ${tab === "daily" ? "at midnight" : "Monday 00:00"} Pacific · in ${this.until(tab === "daily" ? MT.nextMidnight() : MT.nextMonday())}</p>` : "";
    return inner.replace('<div class="fr__board"', `<div class="fr__board" data-tab="${tab}"`).replace(/^(<div class="fr__board"[^>]*>)/, `$1${tabs}`).replace(/<\/div>$/, `${reset}</div>`);
  }

  until(t) {
    const m = Math.max(0, Math.round((t - Date.now()) / 60000));
    return m >= 1440 ? `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  boardInner() {
    const s = this.board.status;
    if (s === "loading") return `<div class="fr__board" aria-busy="true"><h3 class="fr__h3">Leaderboard</h3><p class="fr__muted">Loading…</p></div>`;
    if (s === "soon") return `<div class="fr__board"><p class="fr__muted">Global leaderboard coming soon. Runs are saved on this device.</p></div>`;
    if (s === "error") return `<div class="fr__board"><h3 class="fr__h3">Leaderboard</h3><p class="fr__muted">${navigator.onLine === false ? "You're offline." : "Couldn't reach the board."} Runs are saved on this device.</p><div class="fr__links"><button class="fr__link" type="button" data-panel="retryboard">Try again</button></div></div>`;
    if (!this.board.rows.length) return `<div class="fr__board"><h3 class="fr__h3">Leaderboard</h3><p class="fr__muted">${this.board.tab === "daily" ? "Nobody's run today's course yet. First place is open." : "No runs yet. First place is open."}</p></div>`;
    const me = this.profile && this.profile.username.toLowerCase();
    return `<div class="fr__board"><h3 class="fr__h3">Leaderboard</h3><ol>${this.board.rows.map((r, i) =>
      `<li class="${i < 3 ? `is-top is-top${i + 1}` : ""}${me && r.username.toLowerCase() === me ? " is-me" : ""}"${me && r.username.toLowerCase() === me ? ' aria-current="true"' : ""}><span class="fr__pos">${i + 1}</span><span>${esc(r.username)}</span><span class="fr__num">${fmt(r.score)}</span></li>`).join("")}</ol></div>`;
  }

  challengeHtml() {
    const c = this.challenge;
    if (!c) return "";
    return `<p class="fr__challenge"><span class="fr__badge fr__badge--pb">Challenge</span>${c.name ? `${esc(c.name)} scored` : "Beat"} <b>${fmt(c.score)}</b> on this course.</p>`;
  }

  dailyHtml() {
    const ls = MT.liveStreak(this.settings.streak), db = this.settings.dailyBest, today = MT.vanDay();
    const best = db && db.day === today ? ` · today's best ${fmt(db.score)}` : "";
    const streak = ls.n ? `<b>${ls.n}-day streak</b>${ls.playedToday ? " · done today" : " · run today to keep it"}${ls.freeLeft ? "" : " · free miss used this week"}` : "Run the Daily Run on consecutive days to build a streak (one free miss a week).";
    return `<p class="fr__muted fr__daily">${streak}${best} · new course in ${this.until(MT.nextMidnight())}</p>`;
  }

  missionsHtml() {
    const list = MT.missionsFill(this.settings.missions);
    if (!this.settings.missions) { this.settings.missions = list; P.setSetting("missions", list); }
    return `<div class="fr__missions"><p class="fr__label">Missions</p><ul>${list.map((m) => {
      const d = MT.missionInfo(m), q = Math.min(1, d.prog / d.goal);
      return `<li><span>${esc(d.text)}</span><span class="fr__mbar"><i style="transform:scaleX(${q.toFixed(3)})"></i></span><span>+${d.reward}</span></li>`;
    }).join("")}</ul></div>`;
  }

  /* ---------- gear shop ---------- */
  showShop() {
    this.view = "shop";
    const p = this.profile, cos = MT.cosClean(p.cos), w = MT.wallet(p);
    const row = (it) => {
      const own = cos.owned.includes(it.id), on = cos.eq[it.kind] === it.id;
      const sw = `<span class="fr__swatch" style="background:#${(it.color ?? it.light).toString(16).padStart(6, "0")}"></span>`;
      const btn = own ? `<button class="fr__btn fr__btn--sm" type="button" data-panel="buy" data-id="${it.id}" aria-pressed="${on}">${on ? "Wearing" : "Wear"}</button>`
        : `<button class="fr__btn fr__btn--sm" type="button" data-panel="buy" data-id="${it.id}"${w < it.price ? " disabled" : ""}>${fmt(it.price)} gears</button>`;
      return `<li>${sw}<span>${esc(it.name)}</span>${btn}</li>`;
    };
    const kinds = [["trim", "Robot trims"], ["trail", "Run trails"], ["hammer", "Hammer skins"]];
    this.renderPanel(`
      <h2 class="fr__title">Garage</h2>
      <p class="fr__sub">Trims, trails and hammer finishes. Looks only: nothing here touches the score.</p>
      <p class="fr__lede fr__wallet"><span class="fr__sicon">${OVER_ICON.gears}</span><b>${fmt(w)}</b> gears to spend</p>
      ${kinds.map(([k, n]) => `<div class="fr__shop"><p class="fr__label">${n}</p><ul>${MT.SHOP.filter((x) => x.kind === k).map(row).join("")}</ul></div>`).join("")}
      <div class="fr__actions"><button class="fr__btn" type="button" data-panel="menu">Back</button></div>`, "shop");
  }

  buy(id) {
    const p = this.profile, it = MT.SHOP.find((x) => x.id === id);
    if (!p || !it) return;
    const cos = MT.cosClean(p.cos);
    if (!cos.owned.includes(id)) {
      if (MT.wallet(p) < it.price) return;
      cos.owned.push(id); cos.spent += it.price;
      cos.eq[it.kind] = id;
      this.sfx("tool");
    } else cos.eq[it.kind] = cos.eq[it.kind] === id ? "" : id;
    p.cos = cos; P.save(p);
    if (it.kind === "trim") { this.settings.trim = cos.eq.trim || ""; P.setSetting("trim", this.settings.trim); }
    this.applyTrim(); this.applyCos();
    if (P.linked(p)) P.sync(p).then((s) => { if (s.ok && s.data && s.data.profile) P.merge(p, s.data.profile); });
    this.showShop();
  }

  // Trail colour and hammer skin from what's worn.
  applyCos() {
    const eq = MT.cosClean(this.profile && this.profile.cos).eq;
    const tr = MT.SHOP.find((x) => x.id === eq.trail), hm = MT.SHOP.find((x) => x.id === eq.hammer);
    this.trailOn = !!tr;
    if (tr && this.trail) this.trail.mat.color.setHex(tr.color);
    if (this.hammerMat) this.hammerMat.color.setHex(hm ? hm.color : 0xc9cfde);
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
      b.t = 0; b.m.visible = true; b.m.position.set(this.r.x + (Math.random() - 0.5) * 0.1, Math.max(0.03, this.r.y + 0.04), 0.3);
      b.m.material.color.copy(T.mat.color);
    }
    for (const b of T.bits) {
      if (b.t > 0.5) { b.m.visible = false; continue; }
      b.t += dt; b.m.position.z += v * dt;
      b.m.material.opacity = 0.55 * (1 - b.t / 0.5); b.m.scale.set(1 - b.t, 1, 1);
    }
  }

  // Milestone badges: 1,000 / 2,500 / 5,000. Each one unlocked is a light-strip trim to pick.
  badgesHtml() {
    const best = this.profile ? this.profile.best : 0, cur = this.settings.trim || "";
    const b = (id, name, at, ok) => `<button class="fr__medalbtn" type="button" data-panel="trim" data-trim="${id}" aria-pressed="${cur === id ? "true" : "false"}"${ok ? "" : " disabled"}
        title="${ok ? esc(name) : `Reach ${fmt(at)}`}"><span class="fr__medal is-${id || "base"}${ok ? "" : " is-locked"}" aria-hidden="true"></span><span>${at ? (ok ? esc(name) : fmt(at)) : "Classic"}</span></button>`;
    return `<div class="fr__medals" aria-label="Badges and robot trim">${b("", "Classic", 0, true)}${MILESTONES.map((m) => b(m.id, m.name, m.at, best >= m.at)).join("")}</div>`;
  }

  controlsHtml() {
    const row = (keys, what) => `<li><span class="fr__keys">${keys}</span><span>${what}</span></li>`;
    const list = this.coarse
      ? [row("Swipe ‹ ›", "lanes"), row("Swipe up", "jump"), row("Swipe down", "slide")]
      : [row("<kbd>←</kbd><kbd>→</kbd>", "lanes"), row("<kbd>↑</kbd><kbd>Space</kbd>", "jump"), row("<kbd>↓</kbd>", "slide"), row("<kbd>P</kbd>", "pause")];
    return `<ul class="fr__controls" aria-label="Controls">${list.join("")}</ul>
      <p class="fr__muted fr__wheel-note"><span class="fr__mini-wheel">${ICON.wheel}</span>Wheel tokens: Roller Mode for 8&nbsp;s. Faster, grinds rails, launches off ramps, chains drifts for a combo. No slide, just a low hop.</p>
      <p class="fr__muted fr__wheel-note"><span class="fr__mini-wheel">${ICON.tool}</span>Screws +25. Wrench: magnet. Drill: bores arms. Hammer: smashes crates and robots. Five tools fill the toolbox for Overdrive ×2.</p>`;
  }

  settingsHtml() {
    const t = (key, label) => `<button class="fr__toggle" type="button" data-panel="toggle" data-key="${key}" aria-pressed="${this.settings[key] ? "true" : "false"}"><span class="fr__switch" aria-hidden="true"></span>${label}</button>`;
    const items = [t("pad", "Control wheel"), t("lefty", "Wheel on the left")];
    if (this.canBuzz) items.push(t("haptics", "Vibration"));
    const vol = (key, label) => `<label class="fr__vol"><span>${label}</span><input type="range" min="0" max="100" step="5" data-vol="${key}" value="${Math.round((this.settings[key] ?? (key === "musicVol" ? 0.7 : 0.8)) * 100)}" aria-label="${label} volume" /></label>`;
    items.push(t("music", "Music"), vol("musicVol", "Music"), t("sfx", "Sound effects"), vol("sfxVol", "Effects"));
    return `<div class="fr__settings">${items.join("")}</div>`;
  }

  showMenu(error = "") {
    this.state = "menu";
    this.view = "menu";
    this.audio?.mood("menu"); this.audio?.setEnergy(false);
    this.hud.hidden = true;
    this.btnPause.hidden = true;
    this.pad.hidden = true;
    this.root.classList.remove("is-playing");
    this.stopCount();
    this.hideTip();
    this.clearWorld();
    Object.assign(this.r, { lane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, queueSlide: false, jumpBuf: 0, rail: null, hopRail: null, launch: false, landRoll: 0 });
    this.resetPower();
    const p = this.profile;
    if (p) this.publish();
    const links = [];
    let body;
    if (p && !this.switching) {
      body = `
        <p class="fr__lede">Welcome back, <b class="fr__name">${esc(p.username)}</b>.</p>
        <p class="fr__muted">Best ${fmt(p.best)} · ${fmt(p.games)} ${p.games === 1 ? "run" : "runs"} · ${fmt(p.gears)} gears</p>
        ${this.badgesHtml()}
        ${this.challengeHtml()}
        <div class="fr__actions">
          <button class="fr__btn fr__btn--solid fr__btn--wide" type="button" data-panel="start">${this.challenge ? "Take the challenge" : this.dailyLink ? "Start the Daily Run" : "Start"}</button>
          <button class="fr__btn" type="button" data-panel="daily">Daily Run</button>
        </div>
        ${this.dailyHtml()}
        ${this.missionsHtml()}
        <div class="fr__links"><button class="fr__link" type="button" data-panel="shop">Garage · ${fmt(MT.wallet(p))} gears</button></div>`;
      links.push(`<button class="fr__link" type="button" data-panel="switch">Not you?</button>`);
    } else {
      body = `
        <form class="fr__form" data-form="name" novalidate>
          <label class="fr__label" for="fr-name">Pick a name</label>
          <input id="fr-name" class="fr__input" name="username" type="text" inputmode="text" autocomplete="nickname"
            autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" minlength="3" maxlength="16"
            pattern="[A-Za-z0-9_]{3,16}" placeholder="robot_fan" aria-describedby="fr-name-hint"${error ? ' aria-invalid="true"' : ""}
            value="${esc(this.switching ? "" : (p ? p.username : ""))}" autofocus />
          <p class="fr__hint${error ? " is-error" : ""}" id="fr-name-hint">${esc(error || (this.switching ? "A new name starts a new save on this device." : "3 to 16 letters, numbers or _. Shown on the board."))}</p>
          <div class="fr__actions">
            <button class="fr__btn fr__btn--solid fr__btn--wide" type="submit">Start</button>
            ${this.switching ? '<button class="fr__btn" type="button" data-panel="unswitch">Back</button>' : ""}
          </div>
        </form>`;
    }
    const fresh = !p || this.switching;
    if (P.online() && fresh) {
      // No name on this device yet: sign in with a passkey that synced here, or (tucked away) a backup code.
      if (P.passkeysOk()) links.push(`<button class="fr__link fr__link--key" type="button" data-panel="pk-login">${ICON.key}Sign in with passkey</button>`);
      links.push(`<button class="fr__link fr__link--quiet" type="button" data-panel="restore">${P.passkeysOk() ? "No passkey? Use a backup code" : "Load a backup code"}</button>`);
    }
    if (!this.saveUi || this.saveUi.ctx !== "menu") this.saveUi = { open: "", msg: "", busy: false, code: "", ctx: "menu" };
    this.renderPanel(`
      <h2 class="fr__title">Factory Run</h2>
      <p class="fr__sub">Sprint the line. Bank the gears. Don't meet the machines.</p>
      ${body}
      ${!fresh ? `<div data-slot="save">${this.saveHtml("menu")}</div>` : ""}
      <div class="fr__links">${links.join("")}</div>
      ${this.controlsHtml()}
      ${this.settingsHtml()}
      ${this.boardHtml()}`, "menu");
    if (error) this.panel.querySelector("#fr-name")?.focus({ preventScroll: true });
  }

  overStatusHtml() {
    const r = this.lastRun, rows = this.board.tab === "all" || !this.board.tab ? this.board.rows : [];
    const lines = [];
    if (r.best && r.score > 0) lines.push(`<p class="fr__moment"><span class="fr__star" aria-hidden="true"></span>New best${r.prevBest > 0 ? ` <b>+${fmt(r.delta)}</b>` : ""}${r.streak >= 2 ? `<span class="fr__soft"> · ${r.streak} in a row</span>` : ""}</p>`);
    // Rank: where you stand, and what's next.
    if (r.post === "ok" && r.rank) {
      const up = r.prevRank && r.prevRank > r.rank ? `<span class="fr__up" aria-label="up from #${r.prevRank}">↑ from #${r.prevRank}</span>` : "";
      let tail = "";
      if (r.rank === 1 && rows[1]) tail = ` · ${fmt(r.score - rows[1].score)} ahead of #2`;
      else if (r.rank > 1 && rows[r.rank - 2]) tail = ` · ${fmt(rows[r.rank - 2].score - r.score + 1)} to pass #${r.rank - 1}`;
      lines.push(`<p class="fr__rank"><b>#${r.rank}</b> worldwide${tail} ${up}</p>`);
    } else {
      const msg = {
        posting: "Sending to the board…",
        claimed: "Held on this device: this name is signed in elsewhere. Sign in and it posts.",
        offline: "You're offline. The run is saved here and posts when you're back.",
        busy: "The board is busy. Saved here; it'll post on your next run.",
        error: "The board didn't answer. Saved here; it'll try again.",
      }[r.post];
      if (msg) lines.push(`<p class="fr__post" data-slot="post">${msg}</p>`);
    }
    if (!r.best) {
      const nm = MT.nearMiss({ score: r.score, prevBest: r.prevBest, missions: this.settings.missions, board: rows, me: this.profile.username });
      lines.push(`<p class="fr__nudge">${nm ? esc(nm.text) : `Best ${fmt(this.profile.best)}`}</p>`);
    }
    if (r.badge) lines.push(`<p class="fr__unlock"><span class="fr__medal is-${r.badge.id}" aria-hidden="true"></span>${fmt(r.badge.at)} reached: ${esc(r.badge.name)} unlocked in the Garage</p>`);
    return lines.join("");
  }

  statsHtml() {
    const r = this.lastRun, I = OVER_ICON;
    const st = [["gears", fmt(r.gears), "Gears"], ["time", clock(r.time), "Time"], ["dist", r.dist >= 1000 ? `${(r.dist / 1000).toFixed(r.dist >= 10000 ? 0 : 1)} km` : `${fmt(r.dist)} m`, "Distance"],
      ["tools", fmt(r.tools), "Tools"], ["mult", `×${(Math.round(r.bestMult * 10) / 10).toString()}`, "Top multiplier"], ["smash", fmt(r.smashes), "Smashed"]];
    return `<ul class="fr__stats">${st.map(([k, v, n], i) => `<li style="--i:${i}"><span class="fr__sicon">${I[k]}</span><b>${v}</b><span>${n}</span></li>`).join("")}</ul>`;
  }

  progressHtml() {
    const r = this.lastRun, out = [];
    const ls = MT.liveStreak(this.settings.streak);
    if (r.mode === "daily") out.push(`<li><b>Daily Run</b><span>${r.dailyRank ? `#${r.dailyRank} today` : "today's course"}${ls.n ? ` · day ${ls.n}` : ""}</span></li>`);
    else if (ls.n) out.push(`<li><b>Streak · day ${ls.n}</b><span>${ls.playedToday ? "kept today" : "run the Daily Run to keep it"}</span></li>`);
    if (r.challenge) out.push(`<li><b>${r.score > r.challenge.score ? "Challenge beaten" : "Challenge"}</b><span>${r.score > r.challenge.score ? `by ${fmt(r.score - r.challenge.score)}` : `${fmt(r.challenge.score - r.score + 1)} short of ${r.challenge.name ? esc(r.challenge.name) : "their score"}`}</span></li>`);
    for (const m of r.missionsDone || []) out.push(`<li class="is-done"><b>${esc(m.text)}</b><span>+${m.reward} gears</span></li>`);
    for (const m of (this.settings.missions || []).slice(0, Math.max(0, 3 - (r.missionsDone || []).length))) {
      const d = MT.missionInfo(m);
      out.push(`<li><b>${esc(d.text)}</b><span class="fr__mbar"><i style="transform:scaleX(${Math.min(1, d.prog / d.goal).toFixed(3)})"></i></span></li>`);
    }
    return out.length ? `<ul class="fr__progress">${out.join("")}</ul>` : "";
  }

  overExtrasHtml() {
    const r = this.lastRun, out = [];
    if (r.mode === "daily") { const ls = MT.liveStreak(this.settings.streak); out.push(`<p class="fr__muted"><b>Daily Run</b>${ls.n ? ` · ${ls.n}-day streak` : ""}${r.dailyRank ? ` · #${r.dailyRank} today` : ""}</p>`); }
    if (r.challenge) out.push(`<p class="fr__muted">${r.score > r.challenge.score ? "<b>Challenge beaten.</b>" : `Challenge: ${fmt(r.challenge.score - r.score + 1)} short.`}</p>`);
    for (const m of r.missionsDone || []) out.push(`<p class="fr__unlock"><span class="fr__medal is-deep" aria-hidden="true"></span>Mission done: ${esc(m.text)} · +${m.reward} gears</p>`);
    const nm = !r.best && MT.nearMiss({ score: r.score, prevBest: r.prevBest, missions: this.settings.missions, board: this.board.tab === "all" || !this.board.tab ? this.board.rows : null, me: this.profile.username });
    if (nm) out.push(`<p class="fr__nudge">${esc(nm.text)}</p>`);
    return out.join("");
  }

  async share() {
    const r = this.lastRun;
    if (!r) return;
    this.renderer.render(this.scene, this.camera); // a fresh frame to copy (the buffer isn't kept)
    const link = r.mode === "daily" ? "https://auamai.dev/game/?daily=1" : MT.challengeUrl("https://auamai.dev/", r.seed, r.score, this.profile.username);
    const card = await MT.shareCard({ canvas: this.canvas, score: r.score, rank: r.dailyRank || r.rank, best: r.best, daily: r.mode === "daily", name: this.profile.username, link });
    this.lastCard = card;
    const how = await MT.shareOrDownload(card, `I scored ${fmt(r.score)} in Factory Run.`, link);
    if (how === "downloaded") this.toast("Card saved");
  }

  async dare() {
    const r = this.lastRun;
    if (!r) return;
    const link = MT.challengeUrl("https://auamai.dev/", r.seed, r.score, this.profile.username);
    try {
      if (navigator.share) await navigator.share({ text: `Beat my ${fmt(r.score)} in Factory Run`, url: link });
      else { await navigator.clipboard.writeText(link); this.toast("Challenge link copied"); }
    } catch (e) { if (!e || e.name !== "AbortError") this.toast(link); }
  }

  updateOverStatus() {
    if (this.view !== "over") return;
    const s = this.panel.querySelector('[data-slot="status"]');
    if (s) s.innerHTML = this.overStatusHtml();
  }

  showOver() {
    const r = this.lastRun;
    this.saveUi = { open: "", msg: "", busy: false, code: "" };
    // The save offer opens itself once, after a first good run. Later it's a quiet link.
    const p = this.profile;
    if (P.online() && !P.linked(p) && !p.claimed && !this.settings.savePrompted && (r.score >= 300 || (r.best && p.games >= 2))) {
      this.saveUi.open = "offer";
      this.settings.savePrompted = 1; P.setSetting("savePrompted", 1);
    }
    this.renderPanel(`
      <h2 class="fr__headline">${esc(r.headline)}</h2>
      <p class="fr__big${r.best ? " is-best" : ""}" data-count="${r.score}">${this.reduceMotion ? fmt(r.score) : "0"}</p>
      <div class="fr__status" data-slot="status">${this.overStatusHtml()}</div>
      ${this.statsHtml()}
      ${this.progressHtml()}
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid fr__btn--wide" type="button" data-panel="start" autofocus>Run again${this.coarse ? "" : ' <kbd class="fr__kc" aria-hidden="true">Space</kbd>'}</button>
        <button class="fr__btn" type="button" data-panel="garage">Garage</button>
      </div>
      <div class="fr__links fr__links--center"><button class="fr__link" type="button" data-panel="share">${OVER_ICON.share}Share card</button><button class="fr__link" type="button" data-panel="dare">${OVER_ICON.dare}Challenge a friend</button>${r.mode !== "daily" ? `<button class="fr__link" type="button" data-panel="daily">${OVER_ICON.daily}Daily Run</button>` : ""}</div>
      <div data-slot="save">${this.saveHtml("over")}</div>
      ${this.boardHtml()}`, "over");
    this.overAt = performance.now();
    this.countUp();
    this.layer.classList.add("is-arming");
    clearTimeout(this.armT);
    this.armT = setTimeout(() => this.layer.classList.remove("is-arming"), OVER_LOCK);
  }

  // The score counts up with ticks, then settles with a small punch (and a chime on a new best).
  countUp() {
    const el = this.panel.querySelector(".fr__big[data-count]");
    if (!el || this.reduceMotion) return;
    const to = +el.dataset.count, dur = Math.min(1.4, 0.5 + to / 6000), t0 = performance.now();
    let lastTick = 0;
    const tick = (now) => {
      if (!el.isConnected) return;
      const u = Math.min(1, (now - t0) / (dur * 1000)), e = 1 - Math.pow(1 - u, 3);
      el.textContent = fmt(to * e);
      if (now - lastTick > 70 && u < 1) { lastTick = now; this.sfx("screw"); }
      if (u < 1) requestAnimationFrame(tick);
      else { el.classList.add("is-settled"); if (this.lastRun && this.lastRun.best) this.sfx("pb"); }
    };
    requestAnimationFrame(tick);
  }

  showRestore(error = "") {
    this.state = "menu";
    this.renderPanel(`
      <h2 class="fr__title">Use a backup code</h2>
      <p class="fr__sub">Enter your name and the 10-character backup code.</p>
      <form class="fr__form" data-form="restore" novalidate>
        <label class="fr__label" for="fr-rname">Name</label>
        <input id="fr-rname" class="fr__input" name="username" type="text" autocomplete="username" autocapitalize="off"
          autocorrect="off" spellcheck="false" enterkeyhint="next" maxlength="16" autofocus />
        <label class="fr__label" for="fr-code">Backup code</label>
        <input id="fr-code" class="fr__input fr__input--code" name="code" type="text" autocomplete="off" autocapitalize="characters"
          autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="11" placeholder="ABCDE 23456" aria-describedby="fr-code-hint" />
        <p class="fr__hint${error ? " is-error" : ""}" id="fr-code-hint" role="${error ? "alert" : "note"}">${esc(error || "Letters and numbers. Spaces don't matter.")}</p>
        <div class="fr__actions">
          <button class="fr__btn fr__btn--solid" type="submit">Load</button>
          <button class="fr__btn" type="button" data-panel="menu">Back</button>
        </div>
      </form>`, "restore");
  }

  showClaim(error = "") {
    if (this.view === "over" || this.view === "menu") this.claimFrom = this.view;
    this.renderPanel(`
      <h2 class="fr__title">Save across devices</h2>
      <p class="fr__sub">Claim <b class="fr__name">${esc(this.profile.username)}</b> and get a save code. Use it to load this profile on another device.</p>
      <p class="fr__hint${error ? " is-error" : ""}"${error ? ' role="alert"' : ""}>${esc(error || "No email or password. Just the code.")}</p>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid" type="button" data-panel="doclaim">Claim name</button>
        <button class="fr__btn" type="button" data-panel="back">Back</button>
      </div>`, "claim");
  }

  showCode(code) {
    const pretty = `${code.slice(0, 5)} ${code.slice(5)}`;
    this.renderPanel(`
      <p class="fr__label">Your backup code</p>
      <p class="fr__code">${esc(pretty)}</p>
      <p class="fr__sub">For a device without passkeys. Write it down: it loads ${esc(this.profile.username)} anywhere, and it won't be shown again.</p>
      <div class="fr__actions">
        <button class="fr__btn fr__btn--solid" type="button" data-panel="back">I've saved it</button>
        <button class="fr__btn" type="button" data-panel="copy" data-code="${esc(code)}">Copy</button>
      </div>`, "code");
  }

  backFromSub(fromButton = false) {
    if (this.view === "code" && !fromButton) return; // the code screen asks for an explicit "I've saved it"
    if (this.claimFrom === "over" && this.lastRun && (this.view === "claim" || this.view === "code")) { this.state = "over"; this.showOver(); this.layer.classList.remove("is-arming"); }
    else { this.switching = false; this.showMenu(); }
  }

  /* ---------- saving across devices ---------- */
  // What the passkey prompt will look like on this device.
  keyName() {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Face ID";
    if (/Macintosh/.test(ua)) return "Touch ID";
    if (/Android/.test(ua)) return "fingerprint";
    if (/Windows/.test(ua)) return "Windows Hello";
    return "a passkey";
  }

  // One block, used inline on the menu, the pause card and the game-over card.
  // ctx: "menu" | "pause" | "over". Nothing here ever leaves the run.
  saveHtml(ctx) {
    const p = this.profile, u = this.saveUi || {};
    if (!P.online() || !p) return "";
    const keys = P.passkeysOk(), name = esc(p.username);
    const msg = u.msg ? `<p class="fr__hint is-error" role="alert">${esc(u.msg)}</p>` : "";
    const busy = u.busy ? " disabled" : "";
    const codeForm = (btn) => `
      <form class="fr__inline" data-form="inlinecode" novalidate>
        <label class="fr__sr" for="fr-icode">Backup code for ${name}</label>
        <input id="fr-icode" class="fr__input fr__input--code" name="code" type="text" autocomplete="one-time-code" autocapitalize="characters"
          autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="11" placeholder="ABCDE 23456" />
        <button class="fr__btn" type="submit"${busy}>${btn}</button>
      </form>`;
    const renameForm = `
      <form class="fr__inline" data-form="rename" novalidate>
        <label class="fr__sr" for="fr-newname">New name</label>
        <input id="fr-newname" class="fr__input" name="username" type="text" autocomplete="nickname" autocapitalize="off"
          autocorrect="off" spellcheck="false" enterkeyhint="go" minlength="3" maxlength="16" placeholder="new_name" />
        <button class="fr__btn" type="submit"${busy}>Use name</button>
      </form>`;

    // Saved and signed in on this device.
    if (P.linked(p)) {
      if (u.code) {
        return `<div class="fr__save is-done"><p class="fr__label">Backup code</p><p class="fr__code fr__code--sm">${esc(u.code.slice(0, 5) + " " + u.code.slice(5))}</p>
          <p class="fr__muted">For a device without passkeys. It replaces any older code.</p>
          <div class="fr__links"><button class="fr__link" type="button" data-panel="copy" data-code="${esc(u.code)}">Copy</button><button class="fr__link" type="button" data-panel="save-close">Done</button></div></div>`;
      }
      if (u.open === "done") {
        // Signed in with a backup code: offer the passkey so the code isn't needed next time.
        if (keys && !p.passkey) {
          return `<div class="fr__save is-done"><p class="fr__note">Signed in as ${name}.</p>
            <button class="fr__btn fr__btn--accent" type="button" data-panel="pk-save"${busy}>${ICON.key}Add ${this.keyName()}</button>${msg}</div>`;
        }
        return `<div class="fr__save is-done"><p class="fr__note">Saved. ${name} and your best score load on any device: choose Sign in with passkey.</p></div>`;
      }
      if (ctx !== "menu") return "";
      const extra = keys && !p.passkey
        ? `<button class="fr__link" type="button" data-panel="pk-save"${busy}>Add ${this.keyName()}</button>`
        : p.token ? `<button class="fr__link fr__link--quiet" type="button" data-panel="backup-new"${busy}>Backup code</button>` : "";
      return `<div class="fr__links"><span class="fr__note">Saved across devices</span>${extra}</div>${msg}`;
    }

    // This name is saved on another device: sign in right here.
    if (p.claimed) {
      return `<div class="fr__save" data-open="${u.open || ""}">
        ${ctx === "over" ? "" : `<p class="fr__save-lede"><b class="fr__name">${name}</b> is saved to another device. Sign in to keep your runs on the board.</p>`}
        ${keys ? `<button class="fr__btn fr__btn--accent" type="button" data-panel="pk-login"${busy}>${ICON.key}Sign in as ${name}</button>` : ""}
        ${u.open === "code" || !keys ? codeForm(u.busy ? "Signing in…" : "Sign in") : ""}
        ${u.open === "rename" ? renameForm : ""}
        ${msg}
        <div class="fr__links">
          ${keys && u.open !== "code" ? `<button class="fr__link fr__link--quiet" type="button" data-panel="save-code">Use a backup code</button>` : ""}
          ${u.open !== "rename" ? `<button class="fr__link fr__link--quiet" type="button" data-panel="save-rename">Use a different name</button>` : ""}
        </div></div>`;
    }

    // Not saved yet: offer it. Opened on the menu, once after a good run, or from the quiet link.
    const open = ctx === "menu" || u.open === "offer" || u.open === "codeclaim";
    if (!open) {
      return `<div class="fr__links"><button class="fr__link" type="button" data-panel="save-offer">Save across devices</button></div>`;
    }
    return `<div class="fr__save">
      <p class="fr__save-lede">Save your name and best score across devices</p>
      <p class="fr__muted">${keys ? `${this.keyName() === "a passkey" ? "A passkey" : `With ${this.keyName()}, a passkey that`} syncs through iCloud Keychain or Google Password Manager. No email, no password.` : "Get a backup code to load this name on another device."}</p>
      ${keys ? `<button class="fr__btn fr__btn--accent" type="button" data-panel="pk-save"${busy}>${ICON.key}${u.busy ? "Saving…" : `Save with ${this.keyName()}`}</button>` : `<button class="fr__btn fr__btn--accent" type="button" data-panel="code-claim"${busy}>Get a backup code</button>`}
      ${msg}
      ${keys ? `<div class="fr__links"><button class="fr__link fr__link--quiet" type="button" data-panel="code-claim"${busy}>No passkey? Use a backup code</button></div>` : ""}
    </div>`;
  }

  refreshSave() {
    const slot = this.panel.querySelector('[data-slot="save"]');
    if (!slot) return;
    const ctx = this.view === "over" ? "over" : this.view === "pause" ? "pause" : "menu";
    slot.innerHTML = this.saveHtml(ctx);
    const f = slot.querySelector("input");
    if (f && this.saveUi.focus) { f.focus({ preventScroll: true }); this.saveUi.focus = false; }
  }

  saveMsg(res, what) {
    if (res.cancelled) return "";
    if (res.status === 409) return what === "save" ? "That name is already saved by someone. Sign in if it's yours, or use a different name." : "That didn't work. Try again.";
    if (res.status === 401) return what === "login" ? "That passkey isn't saved for Factory Run." : "That name and code don't match.";
    if (res.status === 429) return "Too many tries. Give it a minute.";
    if (res.offline) return "Couldn't reach the server. Check your connection.";
    if (res.exists) return "This device already has a passkey for this name.";
    return "That didn't work. Try again.";
  }

  // Signed in or saved: post what the board missed, sync the best score, update the card in place.
  async afterLink() {
    const p = this.profile;
    p.claimed = false;
    P.save(p);
    if (this.lastRun && this.lastRun.post === "claimed" && !p.held && this.lastRun.score > 0 && this.lastRun.time >= 3) {
      P.hold(p, this.lastRun.score, Math.round(this.lastRun.time * 1000));
    }
    if (this.lastRun && this.lastRun.post === "claimed") { this.lastRun.post = "posting"; this.updateOverStatus(); }
    await this.postHeld();
    if (this.lastRun && this.lastRun.post === "posting") { this.lastRun.post = "error"; this.updateOverStatus(); }
    const s = await P.sync(p);
    if (s.ok && s.data && s.data.profile) P.merge(p, s.data.profile);
    if (this.view === "over") this.updateOverStatus();
    if (this.elBest) this.elBest.textContent = fmt(p.best);
    this.refreshSave();
    this.refreshBoard();
  }

  async saveAction(a, b) {
    const u = this.saveUi || (this.saveUi = { open: "", msg: "", busy: false, code: "" });
    if (u.busy) return;
    u.msg = "";
    if (a === "save-offer") { u.open = "offer"; return this.refreshSave(); }
    if (a === "save-code") { u.open = "code"; u.focus = true; return this.refreshSave(); }
    if (a === "save-rename") { u.open = "rename"; u.focus = true; return this.refreshSave(); }
    if (a === "save-close") { u.code = ""; u.open = ""; return this.refreshSave(); }
    u.busy = true; this.refreshSave();
    let res;
    if (a === "pk-save") {
      res = await P.passkeyRegister(this.profile);
      u.busy = false;
      if (res.ok) {
        P.save(this.profile);
        u.open = "done";
        this.toast(`Saved with ${this.keyName()}`);
        return this.afterLink();
      }
      if (res.status === 409) { this.profile.claimed = true; P.save(this.profile); }
      u.msg = this.saveMsg(res, "save");
    } else if (a === "pk-login") {
      res = await P.passkeyLogin();
      u.busy = false;
      if (res.ok) {
        const rp = res.profile, cur = this.profile;
        const same = cur && cur.username.toLowerCase() === rp.username.toLowerCase();
        const base = same ? cur : P.create(rp.username);
        // A run held under the old name on this device goes with the account you signed in to.
        if (!same && cur && cur.held) base.held = cur.held;
        Object.assign(base, { username: rp.username, token: res.token, passkey: true, claimed: false });
        this.profile = P.merge(base, rp);
        this.switching = false;
        this.toast(`Signed in as ${rp.username}`);
        if (this.view === "menu") { this.showMenu(); }
        else u.open = "done";
        return this.afterLink();
      }
      u.msg = this.saveMsg(res, "login");
    } else if (a === "code-claim") {
      res = await P.claim(this.profile);
      u.busy = false;
      if (res.ok && res.data && res.data.code) {
        this.profile.code = res.data.code;
        u.code = res.data.code;
        P.save(this.profile);
        return this.afterLink();
      }
      if (res.status === 409) { this.profile.claimed = true; P.save(this.profile); }
      u.msg = this.saveMsg(res, "save");
    } else if (a === "backup-new") {
      res = await P.newBackupCode(this.profile);
      u.busy = false;
      if (res.ok && res.data && res.data.code) { this.profile.code = res.data.code; P.save(this.profile); u.code = res.data.code; }
      else u.msg = this.saveMsg(res, "code");
    }
    u.busy = false;
    this.refreshSave();
    // The fresh menu has no save block to hold the message.
    if (u.msg && !this.panel.querySelector('[data-slot="save"]')) this.toast(u.msg);
  }

  onPanelInput(e) {
    const el = e.target;
    if (el.dataset.vol) {
      this.settings[el.dataset.vol] = el.value / 100; P.setSetting(el.dataset.vol, el.value / 100);
      this.audio.applyVolumes();
      if (el.dataset.vol === "sfxVol") this.sfx("gear");
      return;
    }
    if (el.id === "fr-code" || el.id === "fr-icode") {
      // Upper-case as you type and group 5 + 5, like the code was shown.
      const raw = el.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
      const v = raw.length > 5 ? `${raw.slice(0, 5)} ${raw.slice(5)}` : raw;
      if (v !== el.value) el.value = v;
    } else if (el.id === "fr-name" || el.id === "fr-rname") {
      const bad = /[^A-Za-z0-9_]/.test(el.value);
      const hint = this.panel.querySelector(el.id === "fr-name" ? "#fr-name-hint" : "#fr-code-hint");
      el.toggleAttribute("aria-invalid", bad);
      if (hint && el.id === "fr-name") {
        hint.classList.toggle("is-error", bad);
        hint.textContent = bad ? "Only letters, numbers and _" : (this.switching ? "A new name starts a new save on this device." : "3 to 16 letters, numbers or _. Shown on the board.");
      }
    }
  }

  async onPanelClick(e) {
    const b = e.target.closest("[data-panel]");
    if (!b) return;
    const a = b.dataset.panel;
    if (a === "start") this.tryStart(b.dataset.mode || (this.view === "menu" ? (this.challenge ? "challenge" : this.dailyLink ? "daily" : "free") : this.mode));
    else if (a === "daily") this.tryStart("daily");
    else if (a === "shop" || a === "garage") this.showShop();
    else if (a === "buy") this.buy(b.dataset.id);
    else if (a === "board") { this.boardTab = b.dataset.board; this.refreshBoard(); }
    else if (a === "share") this.share();
    else if (a === "dare") this.dare();
    else if (a === "resume") this.resume();
    else if (a === "restart") this.startRun();
    else if (a === "menu") { this.switching = false; this.showMenu(); }
    else if (a === "switch") { this.switching = true; this.showMenu(); }
    else if (a === "unswitch") { this.switching = false; this.showMenu(); }
    else if (a === "restore") this.showRestore();
    else if (a === "claim") this.showClaim();
    else if (a === "back") this.backFromSub(true);
    else if (/^(save-|pk-|code-claim|backup-new)/.test(a)) this.saveAction(a, b);
    else if (a === "retryboard") this.refreshBoard();
    else if (a === "trim") {
      this.settings.trim = b.dataset.trim; P.setSetting("trim", b.dataset.trim);
      this.applyTrim();
      this.panel.querySelectorAll("[data-panel=trim]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    }
    else if (a === "toggle") {
      const k = b.dataset.key;
      this.settings[k] = !this.settings[k];
      P.setSetting(k, this.settings[k]);
      b.setAttribute("aria-pressed", this.settings[k] ? "true" : "false");
      if (k === "haptics" && this.settings[k]) this.buzz(15);
      if (k === "lefty") this.root.classList.toggle("is-lefty", !!this.settings.lefty);
      if (k === "music" || k === "sfx") { this.audio.applyVolumes(); if (k === "sfx" && this.settings[k]) this.sfx("tap"); }
    } else if (a === "copy") {
      try { await navigator.clipboard.writeText(b.dataset.code); this.toast("Copied"); } catch { this.toast("Couldn't copy. Write it down instead."); }
    } else if (a === "doclaim") {
      b.disabled = true;
      b.textContent = "Claiming…";
      const res = await P.claim(this.profile);
      if (res.ok && res.data && res.data.code) {
        this.profile.code = res.data.code;
        P.save(this.profile);
        this.showCode(res.data.code);
      } else {
        const msg = res.status === 409 ? "That name is already claimed. Load its code, or start a new name."
          : res.status === 429 ? "Too many tries. Give it a minute."
          : res.offline ? "Couldn't reach the server. Check your connection and try again."
          : (res.data && res.data.error) || "That didn't work. Try again.";
        this.showClaim(msg);
      }
    }
  }

  async onPanelSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.form === "name") {
      const name = form.username.value.trim();
      const err = name ? P.checkName(name) : "Pick a name to start";
      if (err) return this.showMenu(err);
      document.activeElement?.blur?.();
      if (!this.profile || this.profile.username !== name) this.profile = P.create(name);
      this.switching = false;
      this.startRun();
    } else if (form.dataset.form === "inlinecode") {
      const u = this.saveUi, p = this.profile, code = form.code.value;
      if (!P.isCode(code)) { u.msg = "The code is 10 letters and numbers."; u.open = "code"; return this.refreshSave(); }
      u.busy = true; u.msg = ""; this.refreshSave();
      const res = await P.restore(p.username, code);
      u.busy = false;
      if (res.ok && res.data && res.data.profile) {
        p.code = P.cleanCode(code);
        P.merge(p, res.data.profile);
        u.open = "done";
        this.toast(`Signed in as ${p.username}`);
        return this.afterLink();
      }
      u.msg = this.saveMsg(res, "code"); u.open = "code";
      this.refreshSave();
    } else if (form.dataset.form === "rename") {
      const u = this.saveUi, name = form.username.value.trim();
      const err = P.checkName(name);
      if (err) { u.msg = err; u.open = "rename"; return this.refreshSave(); }
      const old = this.profile;
      // A fresh name for this device. This run comes along so it can still post.
      const np = P.create(name);
      if (this.lastRun && this.view === "over") { np.best = this.lastRun.score; np.games = 1; np.gears = this.lastRun.gears; np.lastPlayed = Date.now(); }
      if (old && old.held && this.view === "over" && this.lastRun && old.held.score === this.lastRun.score) np.held = old.held;
      else if (this.view === "over" && this.lastRun && this.lastRun.post === "claimed") P.hold(np, this.lastRun.score, Math.round(this.lastRun.time * 1000));
      P.save(np);
      this.profile = np;
      u.open = ""; u.msg = "";
      this.toast(`Playing as ${name}`);
      if (this.view === "menu") return this.showMenu();
      if (this.lastRun && this.lastRun.post === "claimed") { this.lastRun.post = "posting"; this.updateOverStatus(); }
      this.refreshSave();
      const r = await this.postHeld();
      if (this.lastRun && this.lastRun.post === "posting") { this.lastRun.post = r && r.status === 403 ? "claimed" : "error"; this.updateOverStatus(); this.refreshSave(); }
      this.refreshBoard();
    } else if (form.dataset.form === "restore") {
      const name = form.username.value.trim();
      const code = form.code.value;
      if (P.checkName(name) || !P.isCode(code)) return this.showRestore(P.checkName(name) ? "Check the name: 3 to 16 letters, numbers or _." : "The code is 10 letters and numbers.");
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Loading…";
      const res = await P.restore(name, code);
      if (res.ok && res.data && res.data.profile) {
        const rp = res.data.profile;
        const same = this.profile && this.profile.username.toLowerCase() === rp.username.toLowerCase();
        const base = same ? this.profile : P.create(rp.username);
        base.username = rp.username;
        base.code = P.cleanCode(code);
        base.claimed = false;
        this.profile = P.merge(base, rp);
        this.switching = false;
        document.activeElement?.blur?.();
        this.toast(`Loaded ${rp.username}`);
        this.showMenu();
        this.afterLink();
      } else {
        this.showRestore(res.status === 401 ? "That name and code don't match."
          : res.status === 429 ? "Too many tries. Give it a minute."
          : "Couldn't reach the server. Check your connection and try again.");
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
    this.step(dt);
    if (this.ctxLost) return;
    // A paused frame doesn't change: draw it once, then let the GPU rest.
    if (this.state === "pause" && this.drawn) return;
    this.renderer.render(this.scene, this.camera);
    this.ui.render();
    this.drawn = this.state === "pause";
    this.measure(dt);
  }

  // One real-time frame: countdown and hint animation on real time, the run itself on game time.
  step(dt) {
    this.realT = (this.realT || 0) + dt;
    if (this.state !== "pause") this.tickCount(dt);
    // Fixed 120 Hz sub-steps (frame time carried over), so physics and scoring don't depend on frame rate.
    const H = 1 / PHYS_HZ;
    this.acc = Math.min(0.1, (this.acc || 0) + dt);
    let n = 0;
    while (this.acc >= H - 1e-7 && n < 12) { this.update(H); this.acc -= H; n++; }
    if (this.state !== "pause") this.ui.update(dt);
  }

  // Slow-mo factor for this frame: eases to SLOW_K, holds, eases back.
  timeScale(dt) {
    if (!(this.slowT > 0) || this.state !== "play") return 1;
    this.slowT = Math.max(0, this.slowT - dt);
    const u = 1 - this.slowT / SLOW_T; // 0 -> 1 across the slow-mo
    const k = u < 0.12 ? u / 0.12 : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    const e = k * k * (3 - 2 * k);
    return 1 - (1 - SLOW_K) * e;
  }

  update(dt) {
    const st = this.state;
    if (st === "pause") return;
    if (st === "count") {
      if (!this.countOn) this.state = "play"; // old harness path: no countdown running
      else { this.animateRobot(0, 0, false); return; }
    }
    // Hit-stop: on a smash the world holds for a few real milliseconds.
    if (st === "play" && this.fx.stop > 0) { this.fx.stop -= dt; dt = 0; }
    dt *= this.timeScale(dt);
    this.t += dt;
    const r = this.r, R = this.robot, fx = this.fx;

    let v = 0;
    if (st === "play") {
      this.runTime += dt;
      const base = Math.min(MAX_SPEED, START_SPEED + ACCEL * this.runTime);
      // First run: start slower and ease onto the normal curve.
      if (this.tutorial) { const u = Math.min(1, this.runTime / TUT_EASE), e = u * u * (3 - 2 * u); this.speed = TUT_SPEED + (base - TUT_SPEED) * e; }
      else this.speed = base;
      v = this.speed * (this.driving ? ROLL_SPEED : 1);
      if (this.r.launch && this.r.launchVx) v = this.r.launchVx; // horizontal speed in the air: v cos(angle)
    } else if (st === "dying") {
      this.deathT += dt;
      v = this.deathSpeed * Math.max(0, 1 - this.deathT * 3);
      if (this.deathT > 0.95) this.endRun();
    } else if (st === "menu") {
      v = 4;
    }

    this.dist += v * dt;
    if (st === "play") { this.runDist = (this.runDist || 0) + v * dt; const mm = this.mult * (this.driftS && this.driftS.level ? DRIFT_MULT[this.driftS.level] : 1); if (mm > (this.bestMult || 1)) this.bestMult = mm; }
    this.scenery.position.z = this.dist % PERIOD;
    this.factory.update(dt, v, this.t);
    this.ceiling.update(dt, v, this.t);
    if (st === "play") { this.updatePower(dt); this.updateFx(dt); }
    const mult = this.mult;
    if (st === "play") this.addScore(v * dt * DIST_POINTS * mult);

    this.updateRails(dt, v);
    // Robot physics
    if (st === "play") {
      // Rolling switches lanes faster.
      // Lane change: a critically damped spring on the body (x'' = w²(target - x) - 2w x').
      const w = this.driving ? LANE_W_ROLL : LANE_W;
      const ax = w * w * (LANES[r.lane] - r.x) - 2 * w * (r.vx || 0);
      r.vx = (r.vx || 0) + ax * dt; r.x += r.vx * dt; r.ax = ax;
      if (r.coyote > 0) r.coyote -= dt;
      if (r.landT > 0) r.landT -= dt;
      if (!r.ground && !r.rail) {
        r.vy += GRAVITY * dt;
        r.y += r.vy * dt;
        // A hop off a rail lands back on it while it still runs under you.
        if (r.hopRail && r.vy < 0 && r.y <= RAIL_H && r.lane === r.hopRail.lane && r.hopRail.zNear > 0 && r.hopRail.zNear - r.hopRail.len < 0) {
          r.y = RAIL_H; r.vy = 0; r.rail = r.hopRail; r.hopRail = null; r.ground = true;
        }
        if (r.y <= 0) {
          // Landing: absorb and camera shake scale with the impact speed.
          r.impact = -r.vy; r.landT = 0.22;
          if (!this.reduceMotion && r.impact > 7) this.shake = Math.max(this.shake, Math.min(0.25, (r.impact - 7) * 0.03));
          if (r.launch) { r.launch = false; r.landRoll = LAND_ROLL; this.addScore(50, { x: r.x, y: 1, z: 0 }); this.sfx("slide", r.x); }
          r.hopRail = null;
          r.y = 0; r.vy = 0; r.ground = true;
          if (r.jumpBuf > 0) { r.jumpBuf = 0; r.queueSlide = false; r.vy = JUMP_V; r.ground = false; r.slideT = 0; }
          else if (r.queueSlide) { r.slideT = SLIDE_T; r.queueSlide = false; }
        }
      }
      if (r.jumpBuf > 0) r.jumpBuf = Math.max(0, r.jumpBuf - dt);
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
          const ty = o.type;
          // The roller passes under the arms' laser; a stack stands 2.2 tall.
          const crash = (ty === "crate" && r.y < 1.05) || (ty === "stack" && r.y < 2.1) || (ty === "bot" && r.y < 0.95) || (ty === "arm" && !sliding && !this.driving);
          const fall = ty === "gap" && r.y < 0.06 && Math.abs(o.z) < o.h - 0.35;
          if (crash && fx.hammer > 0 && (ty === "crate" || ty === "stack" || ty === "bot")) { this.smash(o, i); continue; }
          if (crash && fx.drill > 0 && ty === "arm") { this.smash(o, i); continue; }
          if (crash || fall) {
            if (this.invulnerable) { if (!o.touched) { o.touched = true; this.hitGold(); } }
            else this.die(fall ? "fall" : "crash", ty);
          }
        }
      }
      if (o.z - o.h > 0.5) o.passed = true;
      if (o.z > DESPAWN_Z) { o.g.visible = false; this.pools[o.type].push(o.g); this.obstacles.splice(i, 1); }
    }

    // Gears
    const top = r.y + (sliding ? 0.8 : this.driving ? 1.25 : 1.9);
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
        if (st === "play" && this.magnetize(g, zPrev, dt)) {
          if (this.pulled(g)) { g.taken = true; this.gearsRun++; this.addScore(GEAR_POINTS * mult, g); this.sfx("gear", g.x); }
          g.m.position.x = g.x; g.m.position.y = g.y;
        } else if (st === "play" && Math.abs(r.x - g.x) < 0.9 && zPrev - 0.6 <= 0 && g.z + 0.6 >= 0 && g.y + 0.4 > r.y && g.y - 0.4 < top) {
          g.taken = true;
          this.gearsRun++;
          this.addScore(GEAR_POINTS * mult, g);
          this.sfx("gear", g.x);
        }
      }
      g.m.position.z = g.z;
      if (g.z > DESPAWN_Z) { g.m.visible = false; this.pools.gear.push(g.m); this.gears.splice(i, 1); }
    }

    // Tool pickups and screws
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i], g = it.g, sp = g.userData.spin;
      const zPrev = it.z;
      it.z += v * dt;
      if (it.taken) {
        it.t += dt;
        g.position.y += dt * 6;
        g.scale.setScalar(Math.max(0.01, 1 - it.t * 4));
        if (it.t > 0.25) { g.visible = false; this.pools[it.kind].push(g); this.items.splice(i, 1); continue; }
      } else {
        sp.rotation.y = this.t * (it.kind === "gold" ? 3.4 : 2.4) + it.x;
        const bob = it.kind === "screw" ? 0 : Math.sin(this.t * 3 + it.x) * 0.08;
        if (g.userData.halo) g.userData.halo.scale.setScalar((it.kind === "screw" ? 0.55 : 1) * (1 + Math.sin(this.t * 6) * 0.07));
        if (g.userData.floor) g.userData.floor.position.y = -it.y - bob + 0.02;
        if (st === "play" && it.kind === "screw" && this.magnetize(it, zPrev, dt)) {
          if (this.pulled(it)) { this.collect(it); this.sfx("screw", it.x); }
        } else {
          g.position.y = it.y + bob;
          if (st === "play" && Math.abs(r.x - it.x) < 0.9 && zPrev - 0.65 <= 0 && it.z + 0.65 >= 0 && it.y + 0.45 > r.y && it.y - 0.45 < top) {
            this.collect(it);
            this.sfx({ screw: "screw", wrench: "magnet", drill: "drill" }[it.kind] || "tool", it.x);
          }
        }
        if (!it.mag) g.position.x = it.x;
        else { g.position.x = it.x; g.position.y = it.y; }
      }
      g.position.z = it.z;
      if (it.z > DESPAWN_Z) { if (it.kind === "gold") this.goldOut = false; g.visible = false; this.pools[it.kind].push(g); this.items.splice(i, 1); }
    }
    this.burst.update(dt, v);
    this.updateTrail(dt, v);

    // Wheel token
    const tk = this.token;
    if (tk) {
      const T = this.tokenMesh;
      const zPrev = tk.z;
      tk.z += v * dt;
      T.g.position.z = tk.z;
      T.wheel.rotation.y = this.t * 2.4;
      T.g.position.y = tk.y + Math.sin(this.t * 3) * 0.08;
      T.floorRing.position.y = -T.g.position.y + 0.02;
      T.halo.scale.setScalar(1 + Math.sin(this.t * 6) * 0.07);
      if (tk.taken) {
        tk.t += dt;
        T.g.scale.setScalar(Math.max(0.01, 1 - tk.t * 4));
        if (tk.t > 0.25) { T.g.visible = false; this.token = null; }
      } else if (st === "play" && Math.abs(r.x - tk.x) < 0.95 && zPrev - 0.7 <= 0 && tk.z + 0.7 >= 0 && tk.y + 0.5 > r.y && tk.y - 0.5 < top) {
        tk.taken = true;
        this.startDrive();
      } else if (tk.z > DESPAWN_Z) { T.g.visible = false; this.token = null; }
    }

    if (st === "play") {
      this.toNext -= v * dt;
      if (this.toNext <= 0) this.spawnRow();
      this.updateTips(dt);
    }

    this.animateRobot(dt, v, sliding);
    this.updateCamera(dt);

    if (this.audio && this.audio.started) {
      this.audio.setEnergy(st === "play" && (fx.over > 0 || fx.gold > 0));
      this.ambT = (this.ambT || 0) - dt;
      if (this.ambT <= 0) { this.ambT = 0.2; this.audio.ambient(this.factory.slots); }
    }
    if (st === "play") {
      if (!this.pbPassed && this.pbFrom > 0 && this.score > this.pbFrom) this.passBest();
      this.updateHud(mult, v);
    }
  }

  // Magnet: anything within reach ahead, in any lane, flies to the runner. Returns true while pulled.
  magnetize(g, zPrev, dt) {
    if (!g.mag) {
      if (!(this.fx.magnet > 0) || g.z < -MAGNET_R || g.z > 1.5) return false;
      g.mag = true;
      g.z = zPrev;
    }
    // Attraction ~ 1/d² (softened, capped), plus drag so things arrive instead of orbiting.
    const r = this.r, dx = r.x - g.x, dy = r.y + 1.0 - g.y, dz = -g.z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1;
    const acc = Math.min(420, 3000 / Math.max(d2, 2));
    const drag = 1 - Math.min(1, dt * 2.5);
    g.vx = (g.vx || 0) * drag + (dx / d) * acc * dt;
    g.vy = (g.vy || 0) * drag + (dy / d) * acc * dt;
    g.vz = (g.vz || 0) * drag + (dz / d) * acc * dt;
    const sp = Math.hypot(g.vx, g.vy, g.vz), cap = 45;
    if (sp > cap) { g.vx *= cap / sp; g.vy *= cap / sp; g.vz *= cap / sp; }
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    return true;
  }
  pulled(g) { return Math.abs(g.x - this.r.x) < 0.6 && Math.abs(g.z) < 0.8; }

  updateHud(mult, v) {
    const sh = this.shown, f = this.fx, s = Math.floor(this.score);
    if (s !== sh.score) { sh.score = s; this.elScore.textContent = fmt(s); }
    if (this.gearsRun !== sh.gears) { sh.gears = this.gearsRun; this.elGears.textContent = this.gearsRun; }
    const m = Math.round(mult * 10) / 10;
    if (m !== sh.mult) {
      sh.mult = m;
      this.elMult.hidden = m <= 1;
      this.elMult.textContent = `×${m % 1 ? m.toFixed(1) : m}`;
      this.elMult.classList.toggle("is-hot", m >= 4);
      if (m > 1) { this.elMult.classList.remove("is-bump"); void this.elMult.offsetWidth; this.elMult.classList.add("is-bump"); }
    }
    const seg = f.over > 0 ? -1 : Math.floor(f.meter / 2);
    if (seg !== sh.meter) {
      sh.meter = seg;
      this.elMeter.forEach((el, i) => el.classList.toggle("is-on", seg < 0 || i < seg));
      this.elMeter[0].parentNode.classList.toggle("is-over", seg < 0);
    }
    // Active tool chips: name and a ring that empties; the golden one shows its multiplier.
    const act = [["magnet", MAGNET_T, "Magnet"], ["drill", DRILL_T, "Drill"], ["hammer", HAMMER_T, "Hammer"], ["gold", GOLD_T, "Gold"], ["over", OVER_T, "Overdrive"]].filter(([k]) => f[k] > 0);
    const key = act.map(([k]) => k).join();
    if (key !== sh.chips) {
      sh.chips = key;
      this.elChips.innerHTML = act.map(([k, , n]) => `<span class="fr__chip is-${k}" data-k="${k}"><svg viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9.5"/><circle class="fg" cx="12" cy="12" r="9.5"/></svg><b>${n}</b></span>`).join("");
      this.chipEls = [...this.elChips.children];
    }
    for (const el of this.chipEls || []) {
      const k = el.dataset.k, T = { magnet: MAGNET_T, drill: DRILL_T, hammer: HAMMER_T, gold: GOLD_T, over: OVER_T }[k];
      const left = f[k] / T;
      el.firstChild.lastChild.style.strokeDashoffset = ((1 - left) * 59.69).toFixed(1);
      if (k === "gold") el.lastChild.textContent = `Gold ×${Math.min(5, 2 + Math.floor(f.goldAge))}`;
      el.classList.toggle("is-ending", f[k] < 1.5);
    }
    // Personal best: the HUD bar fills toward it, and a floor line marks where it falls at this pace.
    if (this.pbFrom > 0) {
      const q = Math.min(1, this.score / this.pbFrom), qi = Math.round(q * 200);
      if (qi !== sh.pb) { sh.pb = qi; this.elPbBar.style.transform = `scaleX(${q.toFixed(3)})`; }
      if (this.pbPassed && !this.elPb.classList.contains("is-past")) { this.elPb.classList.add("is-past"); this.elPbLabel.textContent = "New best"; }
      const left = this.pbFrom - this.score, pace = DIST_POINTS * mult;
      const z = -left / pace;
      this.pbLine.visible = left > 0 && z > -90;
      if (this.pbLine.visible) this.pbLine.position.z = z;
    } else this.pbLine.visible = false;
    // Held props
    const R = this.robot;
    this.props.hammer.visible = f.hammer > 0 && R.form === "runner";
    this.props.drill.visible = f.drill > 0 && !(f.hammer > 0) && R.form === "runner";
    if (this.props.drill.visible) this.props.drill.userData.spin.children[4].rotation.x += 0.6;
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
    }

    const f = this.fx;
    const S = { mode: "run", t: this.t, speed: v, vy: r.vy, lean: LANES[r.lane] - r.x, ax: r.ax || 0, impact: r.landT > 0 ? r.impact : 0, hammer: f.hammer > 0, drill: f.drill > 0, swing: f.swing };
    if (st === "menu") {
      // Faces the camera and idles.
      R.root.rotation.y += (Math.PI - R.root.rotation.y) * Math.min(1, dt * 4);
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

    R.root.position.y = r.y;
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
    window.removeEventListener("orientationchange", this.onTurn);
    window.removeEventListener("online", this.onOnline);
    clearTimeout(this.armT); clearTimeout(this.toastT);
    if (window.visualViewport) window.visualViewport.removeEventListener("resize", this.onResize);
    this.ro?.disconnect();
    if (this.onPop) window.removeEventListener("popstate", this.onPop);

    this.scene.traverse((o) => { if (o.geometry && o.geometry !== BOX) o.geometry.dispose(); });
    Object.values(this.M).forEach((m) => m.dispose());
    this.gearGeo.dispose();
    this.ui.dispose();
    this.audio?.dispose();
    this.robot.runner.dispose(); this.robot.roller.dispose();
    this.kit.dispose();
    this.factory.dispose();
    this.ceiling.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.root.remove();
    document.documentElement.style.overflow = this.savedOverflow[0];
    document.body.style.overflow = this.savedOverflow[1];
    document.documentElement.classList.remove("fr-open");
    for (const el of this.inerted || []) el.inert = false;
    current = null;

    if (this.opts.standalone) { location.href = this.opts.exitUrl || "../"; return; }
    if (!fromPop && history.state && history.state.factoryRun) history.back();
    this.prevFocus?.focus?.({ preventScroll: true });
  }
}
