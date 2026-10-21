// DOM shell and every panel: menu, game over, board, settings, save/claim/restore.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261021r10";
import * as MT from "../../meta.js?v=20261021r10";
import { Factory } from "../../factory.js?v=20261021r10";
import { FactoryAudio } from "../../audio.js?v=20261021r10";
import { OVER_LOCK, ICON, OVER_ICON } from "../core/constants.js?v=20261021r10";
import { toolboxHtml } from "../meta/garage.js?v=20261021r10";
import { fmt, esc, clock } from "../core/util.js?v=20261021r10";
import { WORDMARK } from "./brand.js?v=20261021r10";
const MANUAL_URL = "https://github.com/auamai/auamai.github.io/blob/robot-game/docs/MANUAL.md";

export class Panels {
  /* ---------- DOM ---------- */
  buildDom() {
    const root = document.createElement("div");
    root.className = "fr";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Servo Sprint");
    root.innerHTML = `
      <canvas class="fr__canvas" aria-hidden="true"></canvas>
      <div class="fr__pops" aria-hidden="true"></div>
      <div class="fr__fxflash" aria-hidden="true"></div>
      <div class="fr__hud" hidden>
        <div class="fr__scorebox"><span class="fr__score">0</span><span class="fr__mult" hidden>×1</span></div>
        <div class="fr__pb" aria-hidden="true"><span class="fr__pb-bar"><i></i></span><span class="fr__pb-label">PB</span></div>
        <span class="fr__meta"><span class="fr__gears">0</span> gears · best <span class="fr__best">0</span><span class="fr__servo" hidden title="Spare Servo armed"><span class="fr__sicon">${OVER_ICON.servo}</span><span class="fr__sr">Spare Servo armed</span></span></span>
        <div class="fr__meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="fr__chips" aria-hidden="true"></div>
        <span class="fr__ghost" hidden aria-hidden="true"><i></i><span class="fr__ghost-name">PB ghost</span><b class="fr__ghost-gap">±0</b></span>
        <span class="fr__power" hidden>
          <svg class="fr__ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="fr__ring-bg" cx="22" cy="22" r="19"/><circle class="fr__ring-fg" cx="22" cy="22" r="19"/>
            <g class="fr__wheel"><circle cx="22" cy="22" r="9"/><circle cx="22" cy="22" r="2.4"/><path d="M22 13.6v6M22 24.4v6M14.7 26.2l5.2-3M24.1 20.8l5.2-3M14.7 17.8l5.2 3M24.1 23.2l5.2 3"/></g></svg>
          <span class="fr__power-label">Roller Mode</span>
        </span>
      </div>
      <div class="fr__corner">
        <div class="fr__soundwrap">
          <button class="fr__icon" type="button" data-act="sound" aria-pressed="false" aria-label="Mute music" aria-keyshortcuts="M" title="Music (M) · hold for volume">${ICON.sound}</button>
          <div class="fr__volpop" role="group" aria-label="Volume" hidden></div>
        </div>
        <button class="fr__icon" type="button" data-act="pause" aria-label="Pause" hidden>${ICON.pause}</button>
        ${this.opts.standalone && !this.opts.exitUrl ? "" : `<button class="fr__icon" type="button" data-act="close" aria-label="Close game">${ICON.close}</button>`}
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
    this.elServo = root.querySelector(".fr__servo");
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
    this.elGhost = root.querySelector(".fr__ghost");
    this.elGhostName = root.querySelector(".fr__ghost-name");
    this.elGhostGap = root.querySelector(".fr__ghost-gap");
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
    // iOS guard: older Safari only treats touchend/click as an unlock gesture, and a call or Siri can leave the
    // context "interrupted"; every gesture retries until it is running. mood() runs only on a real (re)start, so
    // ordinary taps never cancel a running sweep.
    const unlock = () => {
      const was = this.audio.started && this.audio.ctx && this.audio.ctx.state === "running";
      this.audio.unlock();
      if (!was) this.audio.mood(this.state === "play" || this.state === "count" ? "run" : this.state === "pause" ? "pause" : this.state === "over" || this.state === "dying" ? "over" : "menu");
    };
    root.addEventListener("pointerdown", unlock, { capture: true });
    root.addEventListener("touchend", unlock, { capture: true });
    root.addEventListener("click", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true, once: true });

    this.savedOverflow = [document.documentElement.style.overflow, document.body.style.overflow];
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("fr-open");
    // Everything behind the overlay is out of reach for focus and screen readers.
    this.inerted = [...document.body.children].filter((el) => el !== root && !el.inert && el.tagName !== "SCRIPT");
    for (const el of this.inerted) el.inert = true;
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

  // Swap part of a panel without dropping keyboard focus: if focus was inside, it lands back on the same
  // control (matched by its data attributes), or on the region's first control if that one is gone.
  // Without this a keyboard player who switched a board tab was left on <body>, where Space starts a run.
  keepFocus(region, swap) {
    const a = document.activeElement, inside = !!(region && a && a !== region && region.contains(a));
    const d = inside ? a.dataset : null;
    const el = swap() || region;
    if (!inside || !this.panel.contains(el)) return;
    const sel = ["panel", "board", "key", "trim", "id", "vol"].filter((k) => d[k] != null).map((k) => `[data-${k}="${CSS.escape(d[k])}"]`).join("");
    const t = (sel && el.querySelector(sel)) || el.querySelector("button:not([disabled]):not([tabindex='-1']), input, a[href]");
    if (t) t.focus({ preventScroll: true });
  }

  // Reduce motion, live: no camera shake, hit-stop, hint slow-mo, count-up, 3D hint bob or CSS motion.
  setStill(on) {
    this.reduceMotion = !!on;
    this.settings.still = this.reduceMotion; P.setSetting("still", this.reduceMotion);
    this.root.classList.toggle("is-still", this.reduceMotion);
    if (this.ui) this.ui.still = this.reduceMotion;
    if (this.reduceMotion) this.shake = 0;
  }

  hidePanel() {
    this.layer.hidden = true;
    this.layer.dataset.view = "";
    this.layer.classList.remove("is-arming");
    this.panel.innerHTML = "";
  }

  boardHtml() {
    const tab = this.boardTab || "all";
    const tabs = P.online() ? `<div class="fr__tabs" role="tablist" aria-label="Leaderboard period">${[["daily", "Daily"], ["weekly", "Weekly"], ["all", "All-time"]].map(([k, n]) =>
      `<button class="fr__tab" type="button" role="tab" data-panel="board" data-board="${k}" aria-selected="${k === tab}"${k === tab ? "" : ' tabindex="-1"'}>${n}</button>`).join("")}</div>` : "";
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
      `<li class="${i < 3 ? `is-top is-top${i + 1}` : ""}${me && r.username.toLowerCase() === me ? " is-me" : ""}"${me && r.username.toLowerCase() === me ? ' aria-current="true"' : ""}><span class="fr__pos">${i + 1}</span><span>${esc(r.username)}${typeof r.robot === "string" && r.robot && !MT.checkRobotName(r.robot) ? `<span class="fr__brow">${esc(r.robot)}</span>` : ""}</span><span class="fr__num">${fmt(r.score)}</span></li>`).join("")}</ol></div>`;
  }

  challengeHtml() {
    const c = this.challenge;
    if (!c) return "";
    return `<p class="fr__challenge"><span class="fr__badge fr__badge--pb">Challenge</span>${c.name ? `${esc(c.name)} scored` : "Beat"} <b>${fmt(c.score)}</b> on this course.${c.v === 1 ? `<span class="fr__muted"> Classic straight hall, as it was when they ran it.</span>` : c.v === 2 ? `<span class="fr__muted"> Factory zones before the machines, as it was when they ran it.</span>` : ""}</p>`;
  }

  dailyHtml() {
    const ls = MT.liveStreak(this.settings.streak), db = this.settings.dailyBest, today = MT.vanDay();
    const best = db && db.day === today ? ` · today's best ${fmt(db.score)}` : "";
    const streak = ls.n ? `<b>${ls.n}-day streak</b>${ls.playedToday ? " · done today" : " · run today to keep it"}${ls.freeLeft ? "" : " · free miss used this week"}` : "Run the Daily Run on consecutive days to build a streak (one free miss a week).";
    const tw = MT.twistOf(today), twDone = this.settings.twist && this.settings.twist.day === today && this.settings.twist.done;
    return `<p class="fr__muted fr__daily">${streak}${best} · new course in ${this.until(MT.nextMidnight())}</p>
      <p class="fr__muted fr__twist"><span class="fr__badge">Today's twist</span>${esc(tw.text)} in the Daily Run${twDone ? " · <b>done</b>" : ` · +${MT.TWIST_REWARD} gears`}</p>`;
  }

  controlsHtml() {
    const row = (keys, what) => `<li><span class="fr__keys">${keys}</span><span>${what}</span></li>`;
    const list = this.coarse
      ? [row("Swipe ‹ ›", "lanes"), row("Swipe up", "jump"), row("Swipe down", "slide")]
      : [row("<kbd>←</kbd><kbd>→</kbd>", "lanes"), row("<kbd>↑</kbd><kbd>Space</kbd>", "jump"), row("<kbd>↓</kbd>", "slide"), row("<kbd>P</kbd>", "pause")];
    const desk = this.coarse ? "" : `<p class="fr__muted fr__desk-line">Made for the keyboard: arrows or WASD, Space to jump. A gamepad works too.</p>`;
    return `<ul class="fr__controls" aria-label="Controls">${list.join("")}</ul>${desk}
      <p class="fr__muted fr__wheel-note"><span class="fr__mini-wheel">${ICON.wheel}</span>Wheel tokens: Roller Mode for 8&nbsp;s. Faster, grinds rails, launches off ramps, chains drifts for a combo. No slide, just a low hop.</p>
      <p class="fr__muted fr__wheel-note"><span class="fr__mini-wheel">${ICON.tool}</span>Screws +25. Wrench: magnet. Drill: bores arms. Hammer: smashes crates and robots. Five tools fill the toolbox for Overdrive ×2.</p>`;
  }

  settingsHtml() {
    const t = (key, label) => `<button class="fr__toggle" type="button" data-panel="toggle" data-key="${key}" aria-pressed="${(key === "still" ? this.reduceMotion : this.settings[key]) ? "true" : "false"}"><span class="fr__switch" aria-hidden="true"></span>${label}</button>`;
    const items = [t("pad", "Control wheel"), t("lefty", "Wheel on the left")];
    if (this.canBuzz) items.push(t("haptics", "Vibration"));
    const vol = (key, label) => `<label class="fr__vol"><span>${label}</span><input type="range" min="0" max="100" step="5" data-vol="${key}" value="${Math.round((this.settings[key] ?? (key === "musicVol" ? 0.7 : 0.8)) * 100)}" aria-label="${label} volume" /></label>`;
    items.push(t("music", "Music"), vol("musicVol", "Music"), t("sfx", "Sound effects"), vol("sfxVol", "Effects"), t("still", "Reduce motion"), t("ghost", "Ghost racer"));
    // Player manual (docs/MANUAL.md on GitHub): a plain link, so it needs no script and no CSP change.
    items.push(`<a class="fr__link fr__link--quiet" href="${MANUAL_URL}" target="_blank" rel="noopener">Player manual</a>`);
    // Courtesy credit (the track is CC0, so none is required): see music/CREDITS.txt.
    items.push(`<p class="fr__muted fr__credit">Music: Rhythm Factory by Zane Little Music (CC0)</p>`);
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
    const rname = p ? (MT.cosClean(p.cos).d || {}).name : "";
    if (p && !this.switching) {
      body = `
        <p class="fr__lede">Welcome back, <b class="fr__name">${esc(p.username)}</b>.${rname ? ` <span class="fr__robotname">${esc(rname)}</span> is ready.` : ""}</p>
        <p class="fr__muted fr__tbline">Best ${fmt(p.best)} · ${fmt(p.games)} ${p.games === 1 ? "run" : "runs"} ${toolboxHtml(MT.wallet(p))}${this.settings.servoArm && MT.servoCount(p) ? `<span class="fr__servo" title="Spare Servo armed"><span class="fr__sicon">${OVER_ICON.servo}</span><span class="fr__sr">Spare Servo armed</span></span>` : ""}</p>
        ${this.badgesHtml()}
        ${this.challengeHtml()}
        <div class="fr__actions">
          <button class="fr__btn fr__btn--solid fr__btn--wide" type="button" data-panel="start">${this.challenge ? "Take the challenge" : this.dailyLink ? "Start the Daily Run" : "Start"}</button>
          <button class="fr__btn" type="button" data-panel="daily">Daily Run</button>
        </div>
        ${this.dailyHtml()}
        ${this.missionsHtml()}
        <div class="fr__links"><button class="fr__link" type="button" data-panel="shop">Garage</button></div>`;
      links.push(`<button class="fr__link" type="button" data-panel="switch">Not you?</button>`);
    } else {
      // Arriving from a friend's link: say what the link is before asking for a name, and keep the one Start button.
      const invite = this.switching ? "" : this.challenge ? this.challengeHtml()
        : this.dailyLink ? `<p class="fr__challenge"><span class="fr__badge fr__badge--pb">Daily Run</span>Today's course, the same for everyone until midnight Pacific.</p>` : "";
      body = `${invite}
        <form class="fr__form" data-form="name" novalidate>
          <label class="fr__label" for="fr-name">Pick a name</label>
          <input id="fr-name" class="fr__input" name="username" type="text" inputmode="text" autocomplete="nickname"
            autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" minlength="3" maxlength="16"
            pattern="[A-Za-z0-9_]{3,16}" placeholder="robot_fan" aria-describedby="fr-name-hint"${error ? ' aria-invalid="true"' : ""}
            value="${esc(this.switching ? "" : (p ? p.username : ""))}" autofocus />
          <p class="fr__hint${error ? " is-error" : ""}" id="fr-name-hint">${esc(error || (this.switching ? "A new name starts a new save on this device." : "3 to 16 letters, numbers or _. Shown on the board."))}</p>
          <div class="fr__actions">
            <button class="fr__btn fr__btn--solid fr__btn--wide" type="submit">${!this.switching && this.challenge ? "Take the challenge" : !this.switching && this.dailyLink ? "Start the Daily Run" : "Start"}</button>
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
      <h2 class="fr__title fr__brand"><span class="fr__sr-only">Servo Sprint</span>${WORDMARK}</h2>
      <p class="fr__sub">Outrun the Foreman.</p>
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
      const up = r.prevRank && r.prevRank > r.rank ? `<span class="fr__up"><span aria-hidden="true">↑</span><span class="fr__sr-only">up</span> from #${r.prevRank}</span>` : "";
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
    // Peak-end: the best progression moment of the run, last on the status block (grade, then weekly, then twist).
    const g = (r.grades || []).slice(-1)[0];
    if (g) { const un = (r.grades || []).flatMap((x) => x.unlocks); lines.push(`<p class="fr__moment fr__gradeup"><span class="fr__star" aria-hidden="true"></span>Grade <b>${g.n}</b><span class="fr__soft"> · +${fmt(r.grades.reduce((a, x) => a + x.reward, 0))} gears${un.length ? ` · ${esc(un.join(", "))} unlocked` : ""}</span></p>`); }
    if (r.weekPay) lines.push(`<p class="fr__unlock"><span class="fr__medal is-deep" aria-hidden="true"></span>Weekly goal done · +${fmt(r.weekPay)} gears</p>`);
    if (r.twist && r.twist.pay) lines.push(`<p class="fr__unlock"><span class="fr__medal is-star" aria-hidden="true"></span>Twist done: ${esc(r.twist.text)} · +${fmt(r.twist.pay)} gears</p>`);
    return lines.join("");
  }

  statsHtml() {
    const r = this.lastRun, I = OVER_ICON;
    const st = [["gears", fmt(r.gears), "Gears"], ["time", clock(r.time), "Time"], ["dist", r.dist >= 1000 ? `${(r.dist >= 100000 ? Math.round(r.dist / 1000) : r.dist >= 10000 ? Math.round(r.dist / 100) / 10 : Math.round(r.dist / 10) / 100).toFixed(r.dist >= 100000 ? 0 : r.dist >= 10000 ? 1 : 2)}<small>km</small>` : `${fmt(r.dist)}<small>m</small>`, "Distance"],
      ["tools", fmt(r.tools), "Tools"], ["mult", `×${(Math.round(r.bestMult * 10) / 10).toString()}`, "Multiplier"], ["smash", fmt(r.smashes), "Smashed"]];
    return `<ul class="fr__stats">${st.map(([k, v, n], i) => `<li style="--i:${i}"><span class="fr__sicon">${I[k]}</span><b>${v}</b><span>${n}</span></li>`).join("")}</ul>`;
  }

  progressHtml() {
    const r = this.lastRun, out = [];
    const ls = MT.liveStreak(this.settings.streak);
    // First run: one line on where the gears went (the Toolbox counts up just above).
    if (this.profile.games === 1) out.push(`<li><b>Gears bank in your Toolbox</b><span>spend them in the Garage</span></li>`);
    if (r.mode === "daily") out.push(`<li><b>Daily Run${ls.n ? ` · day ${ls.n}` : ""}</b><span>${r.dailyRank ? `#${r.dailyRank} today · ` : ""}new course in ${this.until(MT.nextMidnight())}</span></li>`);
    else if (ls.n) out.push(`<li><b>Streak · day ${ls.n}</b><span>${ls.playedToday ? "kept today" : "run the Daily Run to keep it"}</span></li>`);
    if (r.zone) out.push(`<li><b>Reached ${esc(r.zone)}</b><span>zone ${r.zoneN} of the line</span></li>`);
    if (r.challenge) out.push(`<li><b>${r.score > r.challenge.score ? "Challenge beaten" : "Challenge"}</b><span>${r.score > r.challenge.score ? `by ${fmt(r.score - r.challenge.score)}` : `${fmt(r.challenge.score - r.score + 1)} short of ${r.challenge.name ? esc(r.challenge.name) : "their score"}`}</span></li>`);
    for (const m of r.missionsDone || []) out.push(`<li class="is-done"><b>${esc(m.text)}</b><span>+${m.reward} gears</span></li>`);
    for (const m of (this.settings.missions || []).slice(0, Math.max(0, 3 - (r.missionsDone || []).length))) {
      const d = MT.missionInfo(m);
      out.push(`<li><b>${esc(d.text)}<small class="fr__mprog">${MT.missionProg(m)}</small></b><span class="fr__mbar"><i style="transform:scaleX(${Math.min(1, d.prog / d.goal).toFixed(3)})"></i></span></li>`);
    }
    if (r.twist && !r.twist.done) out.push(`<li><b>Twist: ${esc(r.twist.text)}</b><span>try again today</span></li>`);
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

  updateOverStatus() {
    if (this.view !== "over") return;
    const s = this.panel.querySelector('[data-slot="status"]');
    if (s) s.innerHTML = this.overStatusHtml();
  }

  // Game over: this run's gears (up to 8 tokens) fly from the Gears stat into the Toolbox, then
  // the balance ticks up. CSS transforms only, under 0.9 s; skipped with reduced motion.
  toolboxFly() {
    const r = this.lastRun, tb = this.panel.querySelector(".fr__tbover .fr__toolbox"), n = tb && tb.querySelector(".fr__tbn");
    if (!tb || this.reduceMotion) return;
    const add = r.gears + r.reward, end = MT.wallet(this.profile);
    if (add <= 0) { n.textContent = fmt(end); return; }
    const from = this.panel.querySelector(".fr__stats li .fr__sicon") || this.panel, a = from.getBoundingClientRect(), b = tb.getBoundingClientRect();
    const k = Math.min(8, Math.max(1, Math.round(add / 10)));
    for (let i = 0; i < k; i++) {
      const el = document.createElement("i");
      el.className = "fr__tbfly";
      el.style.left = `${a.left + a.width / 2}px`; el.style.top = `${a.top + a.height / 2}px`;
      document.body.appendChild(el);
      setTimeout(() => { el.style.transform = `translate(${b.left + 14 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.6)`; el.style.opacity = "0.2"; }, 120 + i * 45);
      setTimeout(() => el.remove(), 720 + i * 45);
    }
    const t0 = performance.now() + 380, from0 = r.wallet0;
    const tick = (now) => {
      if (!n.isConnected) return;
      const q = Math.min(1, Math.max(0, (now - t0) / 420));
      n.textContent = fmt(Math.round(from0 + (end - from0) * q));
      if (q < 1) requestAnimationFrame(tick); else { tb.classList.add("is-pulse"); this.sfx("gear"); }
    };
    requestAnimationFrame(tick);
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
      <p class="fr__tbover">${toolboxHtml(this.reduceMotion ? MT.wallet(p) : r.wallet0)}${r.gears + r.reward ? `<span class="fr__muted">+${fmt(r.gears + r.reward)} this run</span>` : ""}${r.revive ? `<span class="fr__muted">Spare Servo used</span>` : ""}${r.ghost ? `<span class="fr__muted fr__ghostres">${r.ghost.beat ? (r.ghost.kind === "pb" ? "Ghost beaten" : `Beat ${esc(r.ghost.name)}’s ghost`) : (r.ghost.kind === "pb" ? "Ghost held on" : `${esc(r.ghost.name)}’s ghost held on`)}</span>` : ""}</p>
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
    this.prepareCard();
    this.toolboxFly();
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
    this.keepFocus(slot, () => { slot.innerHTML = this.saveHtml(ctx); });
    const f = slot.querySelector("input");
    if (f && this.saveUi.focus) { f.focus({ preventScroll: true }); this.saveUi.focus = false; }
  }

  saveMsg(res, what) {
    if (res.cancelled) return "";
    if (res.status === 409) return what === "save" ? "That name is already saved by someone. Sign in if it's yours, or use a different name." : "That didn't work. Try again.";
    if (res.status === 401) return what === "login" ? "That passkey isn't saved for Servo Sprint." : "That name and code don't match.";
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
    if (el.dataset.g) return this.garageInput(el);
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
    else if (a === "g") this.garageAct(b);
    else if (a === "reroll") this.rerollMission(b.dataset.i);
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
    else if (a === "toggle" && b.dataset.key === "still") {
      this.setStill(!this.reduceMotion);
      b.setAttribute("aria-pressed", this.reduceMotion ? "true" : "false");
    }
    else if (a === "toggle") {
      const k = b.dataset.key;
      this.settings[k] = !this.settings[k];
      P.setSetting(k, this.settings[k]);
      b.setAttribute("aria-pressed", this.settings[k] ? "true" : "false");
      if (k === "haptics" && this.settings[k]) this.buzz(15);
      if (k === "lefty") this.root.classList.toggle("is-lefty", !!this.settings.lefty);
      if (k === "ghost" && !this.settings.ghost) this.ghostHide();
      if (k === "music" || k === "sfx") { this.audio.applyVolumes(); this.paintSound(); if (k === "sfx" && this.settings[k]) this.sfx("tap"); }
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
}
