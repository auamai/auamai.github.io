// Factory Run teaser, "the line": the hero's bottom edge as a conveyor in profile. The UL-H1
// (pre-rendered from the game's own model, assets/teaser/robot-run.webp) runs in place while the
// belt, gears and the odd crate pass under it. The copy is personal: a first visit sees the top
// score; a returning player sees their own best, rank and the gap to the next place, all on a
// rolling mechanical odometer. Reads the game's local save only; never writes to it.
//
// ---------------------------------------------------------------------------------------------
// Daily Run & streak hook (ROB-121). The slot under the caption stays hidden until the game says
// the feature exists. Feature-detected, read-only, bad or stale values are ignored:
//
//   localStorage "au_factory_public_v1"  (written by the game after each run, game/meta.js writePublic)
//     { v: 1,
//       name, best, rank,        // used as a fallback when the board can't be read
//       streak:       3,         // live Daily Run streak (days) at the time of writing
//       dailyDay:     "2026-10-20",   // America/Vancouver day it was written
//       dailyResetAt: 1761030000000,  // epoch ms of the next Daily Run reset (Vancouver midnight)
//       dailyBest, weeklyResetAt, updatedAt }
//     -> "Daily Run · new course in 5h 12m" whenever the summary exists (v >= 1); the countdown
//        uses dailyResetAt while it is in the future, else the next Vancouver midnight
//     -> small gear mark with the day count ("3-day streak") when streak >= 1 and dailyDay is
//        today or yesterday on the Vancouver calendar (an older summary may be a broken streak)
//
//   GET https://api.auamai.dev/scores may also carry  daily: { endsAt: epoch ms | ISO }
//     -> lights the Daily Run countdown for visitors who have never played (no summary yet)
// ---------------------------------------------------------------------------------------------
(() => {
  const el = document.querySelector("[data-line]");
  if (!el) return;
  const $ = (s) => el.querySelector(s);
  const canvas = $(".line__stage");
  const ctx = canvas && canvas.getContext && canvas.getContext("2d");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
  const API = "https://api.auamai.dev/scores";

  /* ---------- odometer ---------- */
  // Each digit is a drum (a strip of 0-9 cells). The value rolls in from zero, low digits
  // turning more laps than high ones, the way a real counter wheel train does.
  function odometer(host, { mini = false } = {}) {
    host.classList.toggle("odo--mini", mini);
    let cells = [], value = null;
    const build = (str, laps) => {
      host.textContent = "";
      cells = [];
      const digits = str.replace(/\D/g, "").length;
      let di = 0;
      for (const ch of str) {
        if (!/\d/.test(ch)) { const s = document.createElement("span"); s.className = "odo__sep"; s.textContent = ch; host.appendChild(s); continue; }
        const fromRight = digits - 1 - di++;
        const n = (laps ? Math.min(3, fromRight) === fromRight ? 3 - fromRight : 0 : 0) + 1; // right drum: most laps
        const drum = document.createElement("span"); drum.className = "odo__drum";
        const strip = document.createElement("span"); strip.className = "odo__strip";
        for (let k = 0; k < n * 10 + 1; k++) { const c = document.createElement("span"); c.textContent = k % 10; strip.appendChild(c); }
        drum.appendChild(strip); host.appendChild(drum);
        cells.push({ strip, d: +ch, laps: n - 1, fromRight });
      }
    };
    return {
      // roll: animate from zero; else jump straight to the value
      set(v, roll) {
        const str = fmt(v);
        value = v;
        build(str, roll);
        cells.forEach((c) => {
          const to = c.laps * 10 + c.d;
          if (!roll) { c.strip.style.transform = `translateY(${-to * 1.5}em)`; return; }
          c.strip.style.transform = "translateY(0)";
          c.strip.getBoundingClientRect(); // commit the start position
          const dur = 1.1 + c.laps * 0.35 + c.fromRight * 0.05;
          c.strip.style.transition = `transform ${dur.toFixed(2)}s cubic-bezier(.22,.8,.18,1) ${(0.08 * (cells.length - 1 - c.fromRight)).toFixed(2)}s`;
          c.strip.style.transform = `translateY(${-to * 1.5}em)`;
        });
      },
      // tick: count up by one, the changed drums rolling forward a cell (mini tally)
      tick(v) {
        const str = fmt(v);
        if (value === null || str.length !== fmt(value).length) { this.set(v, false); return; }
        let ci = 0;
        for (const ch of str) {
          if (!/\d/.test(ch)) continue;
          const c = cells[ci++], d = +ch;
          if (c.d === d) continue;
          const wrap = d === 0 && c.d === 9;
          c.strip.style.transition = "transform .32s cubic-bezier(.3,1.4,.5,1)";
          c.strip.style.transform = `translateY(${-(wrap ? 10 : d) * 1.5}em)`;
          if (wrap) setTimeout(() => { c.strip.style.transition = "none"; c.strip.style.transform = "translateY(0)"; }, 340);
          c.d = d;
        }
        value = v;
      },
    };
  }

  /* ---------- data: the game's local save + the board ---------- */
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const rawProfile = readJSON("au_factory_profile_v1");
  const int = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);
  const pub = readJSON("au_factory_public_v1"); // the game's read-only summary (see the top)
  const fromSave = rawProfile && typeof rawProfile.username === "string" && NAME_RE.test(rawProfile.username)
    ? { name: rawProfile.username, best: Math.max(int(rawProfile.best), int(rawProfile.held && rawProfile.held.score)) } : null;
  const fromPub = pub && typeof pub.name === "string" && NAME_RE.test(pub.name) ? { name: pub.name, best: int(pub.best) } : null;
  const profile = fromSave || fromPub;
  if (profile && fromPub && fromPub.name === profile.name) profile.best = Math.max(profile.best, fromPub.best);
  const pubRank = profile && fromPub && fromPub.name === profile.name && int(pub.rank) >= 1 ? int(pub.rank) : 0;

  const titleEl = $("[data-line-title]"), capEl = $("[data-line-cap]"), rankEl = $("[data-line-rank]");
  const odoEl = $("[data-line-odo]");
  const odo = odoEl ? odometer(odoEl) : null;
  let seen = false, pending = null, odoVal = 0; // the odometer rolls on first view
  const showOdo = (v) => {
    if (!odo || !(v > 0) || v === odoVal) return;
    odoVal = v; odoEl.hidden = false;
    if (still.matches) { odo.set(v, false); return; }
    if (seen) odo.set(v, true);
    else { pending = v; odo.set(0, false); }
  };
  const rollNow = () => { seen = true; if (pending !== null) { odo.set(pending, !still.matches); pending = null; } };
  let relayout = () => {}; // set once the canvas is ready

  function render(list, ok) {
    // list: [{ username, score }] best first; ok: false when the board could not be read
    let label = "Play Factory Run, a 60-second robot runner, in your browser.";
    if (rankEl) rankEl.hidden = true;
    const top = list[0];
    if (profile) {
      const me = profile.name.toLowerCase();
      const i = list.findIndex((s) => String(s.username).toLowerCase() === me);
      const best = Math.max(profile.best, i >= 0 ? list[i].score : 0);
      titleEl.textContent = profile.name;
      if (best > 0) {
        let cap = "Your best · play again", rank = null;
        if (i >= 0) {
          rank = i + 1;
          cap = rank === 1 ? "Your best · top of the board" : `Your best · ${fmt(list[i - 1].score - best + 1)} to beat #${rank - 1}`;
        } else if (ok && list.length >= 10 && best < list[list.length - 1].score) {
          cap = `Your best · ${fmt(list[list.length - 1].score - best + 1)} to reach the top 10`;
        } else if (ok) {
          cap = "Your best · not on the board yet";
        } else if (pubRank) {
          rank = pubRank; // last rank the game saw; the board is unreachable right now
        }
        capEl.textContent = cap;
        if (rank) { rankEl.textContent = "#" + rank; rankEl.hidden = false; }
        showOdo(best);
        label = `Play Factory Run. Welcome back, ${profile.name}. Your best is ${fmt(best)}${rank ? `, rank ${rank}` : ""}. ${cap.replace(/^Your best · /, "").replace(/#(\d+)/, "rank $1")}.`;
      } else {
        capEl.textContent = top ? "Top score · play in your browser" : "Play in your browser · 60 seconds";
        if (top) showOdo(top.score);
        label = `Play Factory Run, ${profile.name}.${top ? ` Top score ${fmt(top.score)}.` : ""}`;
      }
    } else if (top) {
      capEl.textContent = "Top score · play in your browser";
      showOdo(top.score);
      label = `Play Factory Run in your browser. Top score ${fmt(top.score)}.`;
    } else {
      capEl.textContent = "Play in your browser · 60 seconds";
    }
    el.setAttribute("aria-label", label);
    relayout();
  }

  /* Daily Run & streak (see the contract at the top) */
  const TZ = "America/Vancouver";
  let vanFmt = null;
  try { vanFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); } catch { /* old engine */ }
  const vanParts = (ms) => Object.fromEntries(vanFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const vanDay = (ms) => { const p = vanParts(ms); return `${p.year}-${p.month}-${p.day}`; };
  const nextVanMidnight = (ms) => { const p = vanParts(ms); let t = ms + ((24 - +p.hour) * 3600 - +p.minute * 60 - +p.second) * 1000; const d = vanDay(ms); while (vanDay(t) === d) t += 3600e3; while (vanDay(t - 3600e3) !== d) t -= 3600e3; return t; };
  function renderDaily(payload) {
    const slot = $("[data-line-daily]");
    if (!slot || !vanFmt) return;
    const now = Date.now();
    const hasPub = !!(pub && int(pub.v) >= 1);
    const api = payload && payload.daily;
    let ends = 0;
    if (hasPub && int(pub.dailyResetAt) > now && int(pub.dailyResetAt) - now < 26 * 3600e3) ends = int(pub.dailyResetAt);
    else if (api) { const e = typeof api.endsAt === "number" ? api.endsAt : Date.parse(api.endsAt); if (e > now && e - now < 48 * 3600e3) ends = e; }
    if (!ends && hasPub) ends = nextVanMidnight(now);
    const streak = hasPub ? int(pub.streak) : 0;
    const day = hasPub ? String(pub.dailyDay || "") : "";
    const live = streak >= 1 && (day === vanDay(now) || day === vanDay(now - 864e5));
    const mark = $("[data-line-streak]"), text = $("[data-line-daily-text]");
    if (!ends && !live) { slot.hidden = true; return; }
    if (live) { $("[data-line-streak-n]").textContent = streak; mark.title = `${streak}-day streak`; mark.hidden = false; }
    const tick = () => {
      let left = ends - Date.now();
      if (left <= 0) { ends = nextVanMidnight(Date.now()); left = ends - Date.now(); } // a new course just dropped
      const h = Math.floor(left / 3600e3), m = Math.floor((left % 3600e3) / 60e3);
      const left2 = `${h ? h + "h " : ""}${m}m`;
      text.textContent = el.getBoundingClientRect().width < 641 ? `New course in ${left2}` : `Daily Run · new course in ${left2}`;
    };
    if (ends) { tick(); setInterval(() => { if (!document.hidden) tick(); }, 30e3); }
    else text.textContent = "day streak";
    slot.hidden = false;
    el.setAttribute("aria-label", el.getAttribute("aria-label") + (live ? ` ${streak}-day streak.` : "") + (ends ? ` Daily Run: ${text.textContent.replace(/^Daily Run · /, "").replace(/^N/, "n")}.` : ""));
    relayout();
  }

  render([], false);
  if (window.fetch) {
    const ctl = "AbortController" in window ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 5000);
    fetch(API, { credentials: "omit", signal: ctl ? ctl.signal : undefined })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d && Array.isArray(d.scores) ? d.scores : [])
          .filter((s) => s && typeof s.username === "string" && Number.isFinite(+s.score) && +s.score > 0)
          .map((s) => ({ username: s.username.slice(0, 16), score: Math.round(+s.score) }))
          .sort((a, b) => b.score - a.score);
        render(list, !!d);
        renderDaily(d);
      })
      .catch(() => { render([], false); renderDaily(null); })
      .finally(() => clearTimeout(timer));
  } else renderDaily(null);

  /* ---------- the line (canvas) ---------- */
  if (!ctx) return;
  const CELL_W = 120, CELL_H = 160, COLS = 6, RUN = 20, UP = 20, TUCK = 21, DOWN = 22, STILL = 6, GROUND = 151;
  const sheet = new Image();
  sheet.decoding = "async";
  sheet.src = "assets/teaser/robot-run.webp?v=1";
  let ready = false;
  sheet.onload = () => { ready = true; draw(0); };

  const gearsEl = $("[data-line-gears]");
  let tally = null, collected = 0;

  // Unit gear outline: 8 teeth, a hub hole.
  const gear = new Path2D();
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2, r = i % 2 ? 0.78 : 1;
    if (i === 0) gear.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    gear.arc(0, 0, r, a0, a1);
    gear.lineTo(Math.cos(a1) * (i % 2 ? 1 : 0.78), Math.sin(a1) * (i % 2 ? 1 : 0.78));
  }
  gear.closePath();
  gear.moveTo(0.3, 0); gear.arc(0, 0, 0.3, 0, Math.PI * 2);

  let W = 0, H = 0, dpr = 1, belt = 26, scale = 0.5, fade = null, mobile = false;
  let rx = 0, rxTarget = 0, endX = 0;
  function layout() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    belt = parseFloat(getComputedStyle(el).getPropertyValue("--belt")) || 26;
    mobile = W < 641;
    const robotH = mobile ? 74 : W < 981 ? 82 : H < 140 ? 84 : 94;
    scale = robotH / CELL_H;
    const copy = $(".line__copy").getBoundingClientRect(), end = $(".line__end").getBoundingClientRect();
    const left = copy.right - r.left, right = mobile ? W - 12 : end.left - r.left;
    rxTarget = Math.max(left + 50, Math.min(W - 60, left + (right - left) * (mobile ? 0.52 : 0.42)));
    if (!rx) rx = rxTarget;
    endX = end.left - r.left + (end.width / 2);
    fade = ctx.createLinearGradient(0, 0, W, 0);
    const f = Math.min(0.12, 48 / W);
    fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(f, "#000"); fade.addColorStop(1 - f, "#000"); fade.addColorStop(1, "rgba(0,0,0,0)");
    if (still.matches || !running) draw(0);
  }

  // World state
  let off = 0, speedK = 1, hover = false, phase = 0, t = 0;
  let nextGear = 2.2, nextCrate = 0.3, hop = null, dash = null, shift = 0;
  const items = [], sparks = [];
  const BASE = 64; // belt px/s at rest; the stride is matched to it
  const reset = () => {
    items.length = 0; sparks.length = 0; hop = null; dash = null; speedK = 1; nextGear = 1.2; shift = 0;
    // Fill the line ahead of the robot so it reads as already running from the first frame
    const gap = BASE * 6;
    for (let x = rxTarget + 250; x < W + 24; x += gap * (0.92 + Math.random() * 0.16)) items.push({ k: "crate", x });
    for (let x = rxTarget + 80; x < W; x += 70 + Math.random() * 60) {
      if (!items.some((o) => o.k === "crate" && Math.abs(o.x - x) < 34)) items.push({ k: "gear", x, y: 0, a: Math.random() * 6 });
    }
    nextCrate = Math.max(0.3, (rxTarget + 250 + gap - (W + 24)) / BASE); // keep the crate rhythm going
  };

  function step(dt) {
    t += dt;
    const target = dash ? 3.2 : hover ? 2.1 : 1;
    speedK += (target - speedK) * (1 - Math.exp(-dt * (dash ? 9 : 3.5)));
    const v = BASE * speedK * (mobile ? 0.85 : 1);
    off += v * dt;
    phase = (phase + dt * 1.25 * speedK * RUN) % RUN; // 1.25 strides/s at rest
    rx += (rxTarget - rx) * (1 - Math.exp(-dt * 6));

    // Spawns: gears every second or two, a crate about every six seconds, never on top of each other
    if ((nextGear -= dt * speedK) <= 0) {
      nextGear = 1 + Math.random() * 1.4;
      if (!items.some((o) => o.x > W - 50)) items.push({ k: "gear", x: W + 16, y: 0, a: Math.random() * 6 });
    }
    if ((nextCrate -= dt) <= 0 && !dash) {
      nextCrate = 5.4 + Math.random() * 1.4;
      if (!items.some((o) => o.x > W - 70)) items.push({ k: "crate", x: W + 24 });
    }
    // A hop carries the robot a little forward over the crate; it drifts back to its spot after.
    const T = Math.max(0.5, 0.7 / Math.sqrt(speedK)), fwd = mobile ? 22 : 30;
    if (hop) { const u = Math.min(1, (hop.t + dt) / hop.T); shift = hop.s0 + (fwd - hop.s0) * u * u * (3 - 2 * u); }
    else shift *= Math.exp(-dt * 1.4);
    const bx = rx + shift;
    for (const o of items) {
      if (o.fly !== undefined) { o.fly += dt; continue; }
      o.x -= v * dt;
      if (o.k === "gear") {
        o.a += dt * 1.6;
        if (!dash && Math.abs(o.x - bx) < 9 * scale * 2) { o.fly = 0; o.fx = o.x; collect(o); }
      } else if (!hop && !o.jumped && o.x > bx && o.x - bx < (v * T + fwd - shift) / 2 + 2) { hop = { t: 0, T, s0: shift }; o.jumped = true; }
    }
    for (let i = items.length - 1; i >= 0; i--) { const o = items[i]; if (o.x < -40 || (o.fly !== undefined && o.fly > 0.7)) items.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) if ((sparks[i].t += dt) > 0.32) sparks.splice(i, 1);
    if (hop && (hop.t += dt) >= hop.T) hop = null;
    if (dash && (dash.t += dt) > 2.5) { reset(); rx = rxTarget; } // navigation didn't happen: back on the line
  }

  function collect(o) {
    sparks.push({ x: o.x, y: 0, t: 0 });
    collected = (collected + 1) % 1000;
    if (!gearsEl) return;
    if (!tally) {
      const mark = $("[data-line-streak] svg");
      gearsEl.innerHTML = (mark ? mark.outerHTML : "") + '<span class="odo"></span>';
      tally = odometer(gearsEl.querySelector(".odo"), { mini: true });
      tally.set(0, false);
    }
    const n = collected;
    setTimeout(() => tally.tick(n), 420); // lands as the gear arrives
  }

  function draw(dt) {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const y = Math.round(H - belt) + 0.5;
    c.lineCap = "round";

    // Return run underneath, moving the other way
    c.strokeStyle = "rgba(169,188,255,.13)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, y + 17); c.lineTo(W, y + 17); c.stroke();
    // Rollers: fixed axles, spinning with the belt
    const pitch = mobile ? 38 : 46, rr = 4.5;
    for (let x = (W % pitch) / 2; x < W + pitch; x += pitch) {
      c.strokeStyle = "rgba(169,188,255,.30)";
      c.beginPath(); c.arc(x, y + 8.5, rr, 0, Math.PI * 2); c.stroke();
      const a = off / rr, dx = Math.cos(a) * (rr - 1.5), dy = Math.sin(a) * (rr - 1.5);
      c.strokeStyle = "rgba(169,188,255,.38)";
      c.beginPath(); c.moveTo(x - dx, y + 8.5 - dy); c.lineTo(x + dx, y + 8.5 + dy); c.stroke();
    }
    // Belt with cleats
    c.strokeStyle = "rgba(169,188,255,.58)";
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    c.strokeStyle = "rgba(169,188,255,.26)";
    c.beginPath();
    for (let x = -(off % 18); x < W; x += 18) { c.moveTo(x, y + 1); c.lineTo(x, y + 3.5); }
    for (let x = (off % 30) - 30; x < W; x += 30) { c.moveTo(x, y + 15); c.lineTo(x, y + 17); }
    c.stroke();
    // Light pooled on the belt under the robot
    const glow = c.createRadialGradient(rx + shift, y, 0, rx + shift, y, 60);
    glow.addColorStop(0, "rgba(196,209,255,.55)"); glow.addColorStop(1, "rgba(196,209,255,0)");
    c.fillStyle = glow; c.fillRect(rx + shift - 60, y - 1, 120, 2);

    // Items
    const gr = mobile ? 5 : 5.5;
    for (const o of items) {
      if (o.k === "crate") {
        const s = mobile ? 15 : 17, x = Math.round(o.x - s / 2) + 0.5, top = y - s - 0.5;
        c.fillStyle = "rgba(18,24,52,.92)"; c.fillRect(x, top, s, s);
        c.strokeStyle = "rgba(232,236,248,.62)"; c.strokeRect(x, top, s, s);
        c.strokeStyle = "rgba(232,236,248,.28)";
        c.beginPath(); c.moveTo(x + 3, top + 3); c.lineTo(x + s - 3, top + s - 3); c.moveTo(x, top + 4); c.lineTo(x + s, top + 4); c.stroke();
      } else {
        let gx = o.x, gy = y - gr - 13 - Math.sin(t * 2.4 + o.a) * 1.5, al = 0.85;
        if (o.fly !== undefined) { // clink: hop up and away toward the tally
          const u = o.fly / 0.7, ease = 1 - Math.pow(1 - u, 3);
          const tx = mobile || !tally ? o.fx + 30 : endX - 30;
          gx = o.fx + (tx - o.fx) * ease;
          gy = gy - Math.sin(u * Math.PI) * 26 - ease * 8;
          al = 0.9 * (1 - u * u);
        }
        c.save(); c.translate(gx, gy); c.rotate(o.a); c.scale(gr, gr);
        c.lineWidth = 1 / gr; c.strokeStyle = `rgba(169,188,255,${al})`; c.stroke(gear); c.restore();
      }
    }
    for (const s of sparks) {
      const u = s.t / 0.32, r0 = 7 + u * 6, r1 = r0 + 4 * (1 - u);
      c.strokeStyle = `rgba(232,236,248,${0.7 * (1 - u)})`;
      c.beginPath();
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.55; c.moveTo(s.x + Math.cos(a) * r0, y - gr - 13 + Math.sin(a) * r0); c.lineTo(s.x + Math.cos(a) * r1, y - gr - 13 + Math.sin(a) * r1); }
      c.stroke();
    }

    // Robot
    if (ready) {
      let f = still.matches ? STILL : Math.floor(phase), lift = 0, x = rx + shift;
      if (hop) {
        const u = hop.t / hop.T;
        lift = (mobile ? 26 : 32) * 4 * u * (1 - u);
        f = u < 0.3 ? UP : u < 0.72 ? TUCK : DOWN;
      }
      if (dash) x += Math.pow(Math.min(1, dash.t / 0.5), 2) * (W - rx + 90);
      const dw = CELL_W * scale, dh = CELL_H * scale;
      c.imageSmoothingQuality = "high";
      c.drawImage(sheet, (f % COLS) * CELL_W, Math.floor(f / COLS) * CELL_H, CELL_W, CELL_H,
        x - dw / 2, y - 0.5 - GROUND * scale - lift, dw, dh);
    }

    // Fade both ends into the page
    c.globalCompositeOperation = "destination-in";
    c.fillStyle = fade; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
  }

  /* ---------- loop: only while on screen, tab visible and motion allowed ---------- */
  let visible = false, running = false, raf = 0, last = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    step(dt); draw(dt);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    const go = visible && !document.hidden && !still.matches;
    if (go && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    else if (!go && running) { running = false; cancelAnimationFrame(raf); }
    if (!go) draw(0);
  };
  relayout = layout;
  layout(); reset();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => es.forEach((e) => {
      visible = e.isIntersecting;
      if (visible) rollNow();
      sync();
    }), { threshold: 0.15 }).observe(el);
  } else { visible = true; rollNow(); sync(); }
  document.addEventListener("visibilitychange", sync);
  if (still.addEventListener) still.addEventListener("change", () => { layout(); sync(); });
  if ("ResizeObserver" in window) new ResizeObserver(() => layout()).observe(el);
  else window.addEventListener("resize", layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  // Hover or focus wakes the line up
  const on = () => { hover = true; }, offH = () => { hover = false; };
  el.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") on(); });
  el.addEventListener("pointerleave", offH);
  el.addEventListener("focus", on); el.addEventListener("blur", offH);

  // Click: the robot dashes off to the right, then the game opens
  el.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (still.matches || !running || dash) return;
    e.preventDefault();
    dash = { t: 0 }; // a hop in progress finishes on the way out
    const go = () => { location.href = el.href; };
    setTimeout(go, 480);
  });
  // Coming back with the browser's back button: put the robot back on the line
  window.addEventListener("pageshow", (e) => { if (e.persisted) { reset(); rx = rxTarget; draw(0); } });
})();
