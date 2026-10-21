// Servo Sprint: a small endless runner. Loaded only when someone presses Play.
// Entry point: builds the Game from its modules (src/). See README.md for the module map.
import * as P from "./profile.js?v=20261021r11";
import * as MT from "./meta.js?v=20261021r11";
import { START_SPEED } from "./src/core/constants.js?v=20261021r11";
import { BOX } from "./src/render/geometry.js?v=20261021r11";
import { Loop } from "./src/core/loop.js?v=20261021r11";
import { Run } from "./src/core/run.js?v=20261021r11";
import { Physics } from "./src/sim/physics.js?v=20261021r11";
import { Input } from "./src/input/input.js?v=20261021r11";
import { WorldGen } from "./src/world/worldgen.js?v=20261021r11";
import { Track } from "./src/world/track.js?v=20261021r11";
import { Render } from "./src/render/render.js?v=20261021r11";
import { Sound } from "./src/audio/sound.js?v=20261021r11";
import { Hud } from "./src/ui/hud.js?v=20261021r11";
import { Panels } from "./src/ui/panels.js?v=20261021r11";
import { Garage } from "./src/meta/garage.js?v=20261021r11";
import { Net } from "./src/net/net.js?v=20261021r11";
import { Ghost } from "./src/render/ghost.js?v=20261021r11";
import { Hazards } from "./src/world/hazards.js?v=20261021r11";
import { Tricks } from "./src/sim/tricks.js?v=20261021r11";
import { Juice } from "./src/render/juice.js?v=20261021r11";
import { SoundUi } from "./src/ui/sound-ui.js?v=20261021r11";
import { installErrorReporting } from "./src/net/errors.js?v=20261021r11";
export { allowedScore } from "./src/core/constants.js?v=20261021r11";

let current = null;
let cssLoaded = null;

function loadCss() {
  if (!cssLoaded) {
    cssLoaded = new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("./game.css?v=20261021r11", import.meta.url).href;
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

class Game {
  constructor(opts) {
    this.opts = opts;
    this.state = "menu";
    this.closed = false;
    this.t = 0;
    this.dist = 0;
    this.speed = START_SPEED;
    this.profile = P.load();
    // Toolbox (r7): stamp old saves once; the balance (gears minus spent) carries over unchanged.
    if (MT.migrateToolbox(this.profile)) P.save(this.profile);
    // Another tab spent or earned: pick up its saved profile so this tab never spends stale gears.
    addEventListener("storage", (e) => {
      if (e.key !== "au_factory_profile_v1" || !this.profile || this.state === "play") return;
      const d = P.load();
      if (d && d.username === this.profile.username) { P.merge(this.profile, d); if (this.view === "shop") this.showShop(); }
    });
    this.board = { status: P.online() ? "loading" : "soon", rows: [] };
    this.settings = P.settings();
    // Missions + Line grade (r7.2), once per device: a first-time player gets the three starter missions; an old
    // save keeps its missions and starts at the grade its gears already reached (no back-pay). Stamped mv: 2.
    if (MT.migrateProgress(this.profile)) P.save(this.profile);
    if (this.settings.mv !== 2) {
      if (!Array.isArray(this.settings.missions) && (!this.profile || this.profile.games === 0)) { this.settings.missions = MT.STARTER_LIST(); P.setSetting("missions", this.settings.missions); }
      this.settings.mv = 2; P.setSetting("mv", 2);
    }
    this.tips = Object.assign({}, this.settings.tips);
    // A beat-my-run link (?c=seed&s=score&n=name) opens on that course with the score to beat.
    this.challenge = MT.readChallenge();
    this.ghostFetch(); // the sharer's ghost, if they uploaded one (async; the run never waits for it)
    this.dailyLink = new URLSearchParams(location.search).has("daily");
    this.mode = this.challenge ? "challenge" : this.dailyLink ? "daily" : "free";
    // Reduced motion follows the OS setting until the player flips "Reduce motion" in Settings (saved as settings.still).
    this.reduceMotion = typeof this.settings.still === "boolean" ? this.settings.still : matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    // servosprint.xyz: passkeys (auamai.dev RP ID via related origins) appear once the browser says it supports them.
    P.checkRelatedOrigins().then((ok) => {
      if (!ok || !this.root || !this.root.isConnected || this.view !== "menu" || this.state === "play") return;
      const inp = this.root.querySelector("#fr-name"), val = inp && inp.value, foc = inp && document.activeElement === inp;
      this.showMenu();
      const n = this.root.querySelector("#fr-name");
      if (n && val != null) { n.value = val; if (foc) { n.focus(); n.setSelectionRange(val.length, val.length); } }
    });
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
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
    if (this.onDocDown) document.removeEventListener("pointerdown", this.onDocDown, true);
    if (this.onPadConn) { window.removeEventListener("gamepadconnected", this.onPadConn); window.removeEventListener("gamepaddisconnected", this.onPadGone); }

    this.scene.traverse((o) => { if (o.geometry && o.geometry !== BOX) o.geometry.dispose(); });
    Object.values(this.M).forEach((m) => m.dispose());
    this.gearGeo.dispose();
    this.ui.dispose();
    this.juiceDispose();
    this.audio?.dispose();
    this.robot.runner.dispose(); this.robot.roller.dispose();
    this.kit.dispose();
    this.armKit?.dispose();
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

// Copy each module's methods (getters included) onto Game.prototype. A name defined twice is a bug: fail loudly.
function install(target, ...sources) {
  for (const S of sources) {
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(S.prototype))) {
      if (k === "constructor") continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, k)) throw new Error(`Servo Sprint: ${k} defined twice`);
      Object.defineProperty(target.prototype, k, d);
    }
  }
}
install(Game, Loop, Run, Physics, Input, WorldGen, Track, Render, Sound, Hud, Panels, Garage, Net, SoundUi, Ghost, Hazards, Tricks, Juice);
installErrorReporting(() => current ? { state: current.state, q: current.quality, touch: !!current.coarse } : {});
