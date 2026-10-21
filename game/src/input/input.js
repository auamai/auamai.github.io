// Keyboard, touch swipes, thumb wheel, gamepad, focus trap, lifecycle events (blur, visibility, context loss).
// Installed onto Game.prototype by game.js (methods use `this`, the Game).


export class Input {
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
      if (k === "m" && !e.ctrlKey && !e.metaKey && !e.altKey) { if (!e.repeat) this.toggleMusic(); return; }
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

    this.bindSound();
    this.bindGamepad?.();

    // Back button closes the overlay instead of leaving the page.
    if (!this.opts.standalone) {
      history.pushState({ factoryRun: true }, "");
      this.onPop = () => this.close(true);
      window.addEventListener("popstate", this.onPop);
    }
  }

  // Gamepad (standard mapping): D-pad or left stick = lanes / jump / slide, A jump, B slide, LB/RB lanes,
  // Start pause/resume, A or Start begins a run from the menu or game over. Edge-triggered, polled once a
  // frame outside the fixed-step sim (exactly like key events), so determinism is unaffected.
  bindGamepad() {
    this.padPrev = {};
    this.onPadConn = () => { this.padOn = true; this.toast("Controller connected"); };
    this.onPadGone = () => { this.padOn = [...(navigator.getGamepads?.() || [])].some(Boolean); };
    window.addEventListener("gamepadconnected", this.onPadConn);
    window.addEventListener("gamepaddisconnected", this.onPadGone);
    this.padOn = [...(navigator.getGamepads?.() || [])].some(Boolean);
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, D = 0.55;
    const now = { left: b(14) || b(4) || ax < -D, right: b(15) || b(5) || ax > D, jump: b(12) || b(0) || ay < -D, slide: b(13) || b(1) || ay > D, start: b(9), a: b(0) };
    const prev = this.padPrev, edge = (k) => now[k] && !prev[k];
    this.padPrev = now;
    if (edge("start")) { if (this.state === "play" || this.state === "count") return this.pause(); if (this.state === "pause") return this.resume(); }
    if (this.state === "play") { for (const m of ["left", "right", "jump", "slide"]) if (edge(m)) this.act(m); return; }
    if ((edge("a") || edge("start")) && (this.view === "over" || (this.view === "menu" && this.profile && !this.switching))) this.tryStart();
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
}
