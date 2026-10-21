// Servo Sprint tuning and content tables. Pure data: no DOM, no three.js.

/* ---------- tuning ---------- */
export const LANES = [-2.2, 0, 2.2];
export const SPAWN_Z = -100;
export const DESPAWN_Z = 14;
export const START_SPEED = 13;
export const MAX_SPEED = 38;
export const ACCEL = 0.32;          // units/s gained per second
// World scale (round 6): 1 unit = 0.85 m, so the UL-H1 (1.9 units) stands 1.6 m and lanes (2.2) sit 1.9 m apart.
// All ballistic motion uses real gravity, 9.81 m/s², in those units.
export const M_PER_U = 0.85;
export const GRAVITY = -9.81 / M_PER_U; // -11.54 u/s²
export const JUMP_H = 1.65;             // same apex as before (1.4 m)
export const JUMP_V = Math.sqrt(2 * -GRAVITY * JUMP_H); // 6.17 u/s (5.25 m/s): hang time 2v/g = 1.07 s
export const PHYS_HZ = 120;             // fixed physics step: the same course and score on every device
export const LANE_W = 22, LANE_W_ROLL = 34; // critically damped lane spring (rad/s): ~0.2 s / ~0.13 s to settle
export const COYOTE = 0.1;              // a jump this soon after leaving a rail still counts
export const MU_SLIDE = 0.5;            // kinetic friction for the slide's entry skid
export const SLIDE_T = 0.72;
export const GEAR_POINTS = 10;
export const DIST_POINTS = 0.5;     // per unit travelled
export const PERIOD = 12;           // scenery repeat length

// Wheel power-up: turns the runner into the UL-W1 roller for a few seconds.
export const WHEEL_FROM = 14;       // seconds into a run before a token can appear
export const WHEEL_GAP = 28;        // at least this long between tokens
export const WHEEL_CHANCE = 0.16;   // per eligible row
export const MORPH_T = 0.45;        // transform animation, each way (invulnerable)
export const DRIVE_T = 8;           // total time as the roller, morph-in included
export const GRACE_T = 1.2;         // blinking grace after changing back
export const DRIVE_MULT = 1;        // Roller Mode has no flat multiplier any more: it earns through its own moves
// Roller Mode (round 6): its own abilities.
export const ROLL_SPEED = 1.2;       // world speed (and so distance points) while rolling
export const RAIL_H = 1.2;           // grind height
export const RAIL_GEAR_GAP = 2.0;    // gears along a rail
export const RAMP_DEG = 35, RAMP_H = 1.4, RAMP_L = 2.0;  // kicker: a 35 degree lip 1.4 high; a true projectile off it
export const RAMP_G = 1;             // (real gravity in the air)
// Drawn height of things in a ramp arc. The sim keeps the true projectile (scores, Daily Run and replays
// unchanged), but a fast kicker throws it far above the 9-unit roof; above AIR_SOFT the drawn height eases
// toward AIR_MAX so the robot (and the gear arc it collects) stays under the trusses and in frame.
export const AIR_SOFT = 4.0, AIR_MAX = 6.3;
export const visY = (y) => (y <= AIR_SOFT ? y : AIR_SOFT + (AIR_MAX - AIR_SOFT) * (1 - Math.exp(-(y - AIR_SOFT) / (AIR_MAX - AIR_SOFT))));
export const LAND_ROLL = 0.5;        // invulnerable roll after a ramp landing
export const HOP_V = Math.sqrt(2 * 9.81 / 0.85 * 0.75); // the roller's jump: a low hop, 0.75 units
export const DRIFT_CHAIN = 0.6, DRIFT_CASH = 1.5;
export const DRIFT_MULT = [1, 1.2, 1.4, 1.6];
export const RATE_CAP = 1200;       // points in any one-second window (the sim's best was 1,014)
export const JUMP_BUF = 0.16;       // a jump pressed this close before landing still fires on landing
export const OVER_LOCK = 450;       // ms after game over before a key or tap can restart
export const COUNT_BEAT = 0.42;    // countdown: three numbers of this length, then a GO beat while play starts
// Tools (round 6). Every point still goes through addScore and its caps.
export const SCREW_POINTS = 25;
export const DRILL_POINTS = 50;      // per machine bored through
export const HAMMER_POINTS = 75;     // per crate, stack or robot smashed
export const MAGNET_T = 6, DRILL_T = 5, HAMMER_T = 6, GOLD_T = 10, OVER_T = 8;
export const MAGNET_R = 10;          // magnet reach: this far ahead, every lane
export const MULT_CAP = 6;           // all multipliers together never go past this
export const TOOL_FROM = 10;         // seconds into a run before tool pickups (tutorial runs: 25)
export const TOOL_GAP = 8;           // at least this long between tool pickups
export const TOOL_KIND_GAP = 20;     // and this long between two of the same kind
export const TOOL_CHANCE = 0.3;      // per eligible row
export const GOLD_MIN = 60, GOLD_MAX = 120; // the golden torque wrench: once in this window, then again
export const METER_N = 10;           // toolbox meter: 5 segments of 2; a tool fills one, smashes half (one per tool)
export const HIT_STOP = 0.06;        // real seconds the world holds on a smash
export const PB_GOLD_DELAY = 2.5;    // passing your best brings a golden wrench this soon after
// Score caps, mirrored exactly by the leaderboard Worker (allowedScore() there):
// no one-second window over RATE_CAP, and never more than allowedScore(seconds of run).
// A perfect bot measured ~112/s on average and 1,014 in its best one-second window (r6 sim).
export const AVG_CAP = 180;          // per second of run
export const GRACE = 50;
export const BURST = 8000;           // room for one multiplier streak, opening at 800/s after 10 s
export const BURST_FROM = 10, BURST_RATE = 800;
export const allowedScore = (secs) => secs * AVG_CAP + GRACE + Math.min(BURST, Math.max(0, secs - BURST_FROM) * BURST_RATE);
export const SLOW_T = 1.2;          // first-run hint slow-mo: real seconds, eased in and out
export const SLOW_K = 0.4;          // game speed at the bottom of the slow-mo
export const TUT_SPEED = 9.5;       // first-run start speed, easing up to the normal curve
export const TUT_EASE = 16;         // seconds to reach the normal curve

// Light factory built from the portfolio's own palette (styles.css):
// --ink #f4f6fb is the white of the hall, the page navy #10162f is the ink,
// --accent #a9bcff is the periwinkle. Cool tones only, no orange.
export const SITE = { paper: 0xf4f6fb, navy: 0x10162f, accent: 0xa9bcff };
export const COL = {
  bg: SITE.paper, fog: SITE.paper,
  floor: 0xe9ecf4, lane: 0xdfe3ee, dash: SITE.accent,
  wall: 0xf1f3f9, ceiling: 0xe8ebf3, pillar: 0xe2e6f0, beam: 0xe6e9f2, light: SITE.accent,
  rail: 0xd5dae6, roller: 0xbcc3d5,
  robot: 0x5a6488, robotMid: 0x454e72, robotDark: 0x262d4d, accent: SITE.accent,
  crate: 0xa4aaba, crateTop: 0xb9bfcc, arm: 0x949bad, armDark: 0x6c7389,
  gap: 0x262d4d, gear: 0x8fa2f0, edge: 0x262d4d,
  bot: 0xb0b6c5, botTop: 0xc9ced9, botDark: 0x3a4262,
};

export const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>',
  key: '<svg class="fr__key" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H21M17.5 12v3.2M20.2 12v2.4"/></svg>',
  tool: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.6-8.6zM16 4.8l3.2 3.2"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.4 5.3 5.6.6-4.2 3.8 1.2 5.6L12 16l-5 2.8 1.2-5.6L4 9.4l5.6-.6z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>',
  wheel: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 4.5v5.9M12 13.6v5.9M5.5 15.8l5.1-2.9M13.4 11.1l5.1-2.9M5.5 8.2l5.1 2.9M13.4 12.9l5.1 2.9"/></svg>',
};

// Short, in-context first-run tips. Touch copy, key copy.
// Each is a short 3D title and a quieter line under it.
export const TIPS = {
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
export const NO_SLOW = new Set(["lanes", "rolling", "over", "pb", "screw"]);
export const TOOL_NAME = { wrench: "Magnet", drill: "Drill", hammer: "Hammer", gold: "Golden" };
export const MILESTONES = [
  { at: 1000, id: "pearl", name: "Cyan halo trim", light: 0xe9edff, deep: 0xc3cdff },
  { at: 2500, id: "deep", name: "Deep cyan", light: 0x6f84e0, deep: 0x4f63c4 },
  { at: 5000, id: "star", name: "Starlight", light: 0xf4f6fb, deep: 0x8fa2f0 },
];
export const OVER_ICON = {
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
export const CAUSE = { crate: "Clipped a crate", stack: "Into the stack", arm: "Caught by the arm", bot: "Rear-ended a robot", gap: "Fell through the line" };
// Game-over headlines, per hazard: {v} speed in m/s, {bay} the bay you went down in. Picked at random.
export const HEADLINES = {
  crate: ["Clipped a crate at {v} m/s", "That crate wasn't moving. You were, at {v} m/s", "Boxed in at {bay}", "Crate 1, robot 0"],
  stack: ["Ran into a wall of crates at {bay}", "The stack won at {v} m/s", "Two crates high, one jump short", "Stacked up at {bay}"],
  arm: ["Swept by the arm at {bay}", "The arm saw you first", "Should have slid under that one", "Picked up by the line at {bay}"],
  bot: ["Rear-ended a rover at {v} m/s", "Right of way: the rover at {bay}", "Robot traffic at {bay}", "Met a rover head-on at {v} m/s"],
  gap: ["Dropped through the line at {bay}", "Missed the floor by a jump", "Down the gap at {v} m/s", "The belt ran out at {bay}"],
  drill: ["Drill cooled, wall didn't"], hammer: ["Hammer's down, the stack wasn't"],
};
export const BAY = { weld: "the weld cell", laser: "the laser cutters", test: "the test bay", inventory: "inventory", window: "the windows", assembly: "final assembly", door: "the loading door" };

export const BOT_SPEED = 3.2;       // own speed of mobile robots, on top of the belt
export const BOT_FROM = 20;         // seconds into a run before mobile robots appear
export const BOT_TURN_T = 0.6;      // telegraph before a lane change
export const BOT_TURN_MIN_Z = -46;  // never start a lane change closer than this
