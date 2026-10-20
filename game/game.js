// Factory run: a small endless runner. Loaded only when someone presses Play.
// Entry point: builds the Game from its modules (src/). See README.md for the module map.
import * as P from "./profile.js?v=20261020r6b";
import * as MT from "./meta.js?v=20261020r6b";
import { START_SPEED } from "./src/core/constants.js?v=20261020r6b";
import { BOX } from "./src/render/geometry.js?v=20261020r6b";
import { Loop } from "./src/core/loop.js?v=20261020r6b";
import { Run } from "./src/core/run.js?v=20261020r6b";
import { Physics } from "./src/sim/physics.js?v=20261020r6b";
import { Input } from "./src/input/input.js?v=20261020r6b";
import { WorldGen } from "./src/world/worldgen.js?v=20261020r6b";
import { Render } from "./src/render/render.js?v=20261020r6b";
import { Sound } from "./src/audio/sound.js?v=20261020r6b";
import { Hud } from "./src/ui/hud.js?v=20261020r6b";
import { Panels } from "./src/ui/panels.js?v=20261020r6b";
import { Garage } from "./src/meta/garage.js?v=20261020r6b";
import { Net } from "./src/net/net.js?v=20261020r6b";
import { installErrorReporting } from "./src/net/errors.js?v=20261020r6b";
export { allowedScore } from "./src/core/constants.js?v=20261020r6b";

let current = null;
let cssLoaded = null;

function loadCss() {
  if (!cssLoaded) {
    cssLoaded = new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("./game.css?v=20261020r6b", import.meta.url).href;
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

// Copy each module's methods (getters included) onto Game.prototype. A name defined twice is a bug: fail loudly.
function install(target, ...sources) {
  for (const S of sources) {
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(S.prototype))) {
      if (k === "constructor") continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, k)) throw new Error(`Factory Run: ${k} defined twice`);
      Object.defineProperty(target.prototype, k, d);
    }
  }
}
install(Game, Loop, Run, Physics, Input, WorldGen, Render, Sound, Hud, Panels, Garage, Net);
installErrorReporting();
