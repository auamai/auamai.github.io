// Course generation from the seeded COURSE stream, pickups from LOOT, pooling.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { buildTool } from "../../tools.js?v=20261021r7";
import { LANES, SPAWN_Z, START_SPEED, MAX_SPEED, GRAVITY, WHEEL_FROM, WHEEL_GAP, WHEEL_CHANCE, DRIVE_T, ROLL_SPEED, RAIL_H, RAIL_GEAR_GAP, RAMP_DEG, RAMP_H, RAMP_L, TOOL_FROM, TOOL_GAP, TOOL_KIND_GAP, TOOL_CHANCE, BOT_SPEED, BOT_FROM, BOT_TURN_T, BOT_TURN_MIN_Z, visY } from "../core/constants.js?v=20261021r7";
import { COURSE, LOOT, pick, shuffle } from "../core/util.js?v=20261021r7";
import { BOX, mergeParts } from "../render/geometry.js?v=20261021r7";

const IDENT = new THREE.Matrix4();

export class WorldGen {
  spawnItem(kind, lane, z, y = 1.05) {
    const g = this.pools[kind].pop() || (kind === "screw" ? this.screwProxy() : buildTool(kind, this.TM, this.TG));
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
      // Rigid machined gantry (render/arm.js); the laser line is the part you slide under.
      const j = this.armKit.build(g);
      g.add(this.mesh(M.laser, 2.1, 0.035, 0.035, 0, 1.22, 0, false)); // duck under this
      parts.pivot = j.pivot;
      parts.elbow = j.elbow;
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
    this.collapse(g, type, parts);
    g.userData = { type, h, parts };
    this.scene.add(g);
    return g;
  }

  // Draw-call diet: an obstacle's static boxes and outlines become one mesh per material and one line
  // set per outline material, baked in the group's own frame (a crate goes from 6 draws to 4, a bot from
  // 22 to 8). Animated joints (arm pivot/elbow) stay live; bot blinkers stay their own meshes because their
  // material flips, but their outlines join the merged lines. Same geometry, same materials, so it looks
  // identical. Merged geometry is built once per type and shared by every pooled copy.
  collapse(g, type, parts) {
    const live = new Set([parts.pivot, parts.elbow].filter(Boolean)), keep = new Set(parts.blink || []);
    const buckets = new Map(), drop = [];
    g.updateMatrixWorld(true);
    const walk = (o) => {
      for (const c of o.children) {
        if (live.has(c)) continue;
        if ((c.isMesh || c.isLineSegments) && !keep.has(c)) {
          const key = c.material;
          if (!buckets.has(key)) buckets.set(key, { line: !!c.isLineSegments, mat: c.material, list: [], shadow: false, recv: false });
          const b = buckets.get(key); b.list.push(c); b.shadow ||= c.castShadow; b.recv ||= c.receiveShadow; drop.push(c);
        }
        walk(c);
      }
    };
    walk(g);
    const cache = (this._merged ||= {})[type] ||= [];
    let i = 0;
    for (const b of buckets.values()) {
      const geo = cache[i] ||= b.list.length === 1 && !b.list[0].parent?.isMesh && b.list[0].parent === g && b.list[0].matrix.equals(IDENT)
        ? b.list[0].geometry : mergeParts(b.list.map((m) => ({ geo: m.geometry, mx: m.matrixWorld })));
      i++;
      const m = b.line ? new THREE.LineSegments(geo, b.mat) : new THREE.Mesh(geo, b.mat);
      m.castShadow = b.shadow; m.receiveShadow = b.recv;
      g.add(m);
    }
    for (const c of drop) c.parent.remove(c);
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
    // A bare transform: every gear is drawn by one InstancedMesh (render.js syncInstances).
    if (!m) { m = new THREE.Object3D(); this.scene.add(m); }
    m.visible = true;
    m.scale.setScalar(1);
    m.position.set(LANES[lane], visY(y), z); // drawn height only; the sim keeps y
    this.gears.push({ m, x: LANES[lane], y, z, taken: false, t: 0 });
  }

  spawnRow() {
    const z = SPAWN_Z;
    if (this.driving && this.pw.t < DRIVE_T - 2.2) return this.rollerRow(z);
    const diff = (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    // Factory Zones (course v2, track.js): each zone teaches its signature obstacle alone on roomy rows
    // (first quarter), tests the full mix, then twists it with extra pairs (last quarter). Classic courses
    // (old challenge links, v1) skip all of this and lay out exactly as before.
    const Z = this.zoneRow(), f = this.zoneF, teach = !!Z && f < 0.25, twist = !!Z && f >= 0.75;
    const botK = !Z ? 1 : teach && Z.sig === "bot" ? 2.6 : Z.bot;
    // Mobile robots get their own row so they never close the last open lane:
    // at most two, and every bot is low enough to jump.
    if (this.runTime >= BOT_FROM && COURSE() < (0.18 + diff * 0.32) * botK) {
      const lanes = shuffle([0, 1, 2]);
      const n = diff > 0.45 && COURSE() < 0.4 ? 2 : 1;
      for (const ln of lanes.slice(0, n)) this.spawnObstacle("bot", ln, z - COURSE() * 3);
      if (COURSE() < 0.6) { const ln = lanes[2]; this.fillLane(ln, z, false); }
      this.toNext = (Math.max(16, this.speed * 0.7) + COURSE() * 10) * (Z ? Z.gap : 1);
      return;
    }
    const extra = !Z ? 0 : twist ? 0.15 + Z.pair : Z.pair;
    const n = !this.tutorial && !teach && COURSE() < 0.35 + diff * 0.35 + extra ? 2 : 1; // never all three lanes; one at a time while learning
    const lanes = shuffle([0, 1, 2]);
    const types = Z ? Z.mix[(teach ? 2 : 0) + (diff < 0.15 ? 1 : 0)] : diff < 0.15 ? ["crate", "gap", "arm"] : ["crate", "gap", "arm", "stack", "stack"];
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
    this.toNext = (Math.max(14, this.speed * 0.62) + COURSE() * 10) * (this.tutorial ? 1.35 : 1) * (Z ? Z.gap * (teach ? 1.15 : 1) : 1);
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
}
