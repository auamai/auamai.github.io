(() => {
  // Local time in Vancouver, BC
  const clock = document.getElementById("clock");
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver",
  });
  const tick = () => { if (clock) clock.textContent = fmt.format(new Date()); };
  const dateEl = document.getElementById("clock-date");
  const dfmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Vancouver" });
  const tickDate = () => { if (dateEl) dateEl.textContent = dfmt.format(new Date()).replace(",", ""); };
  // Re-sync on every second boundary and whenever the tab wakes up. Browsers throttle or
  // freeze timers in background tabs, so a fixed interval drifts or shows a stale time.
  const syncers = [() => { tick(); tickDate(); }];
  const syncAll = () => syncers.forEach((f) => f());
  let timer = 0;
  const loopTick = () => { syncAll(); clearTimeout(timer); timer = setTimeout(loopTick, 1000 - (Date.now() % 1000) + 20); };
  loopTick();
  const wake = () => { if (document.visibilityState !== "hidden") loopTick(); };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("pageshow", wake);
  window.addEventListener("focus", wake);

  // Dial: minute ticks; the 12 hour marks are the ring pins of a cycloidal drive.
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const ticks = document.getElementById("dial-ticks");
  if (ticks) {
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const a = (i / 60) * Math.PI * 2;
      ticks.appendChild(el("line", { x1: 100 + 95 * Math.sin(a), y1: 100 - 95 * Math.cos(a), x2: 100 + 92 * Math.sin(a), y2: 100 - 92 * Math.cos(a) }));
    }
  }
  const sweep = document.querySelector(".dial__sweep");
  const syncSweep = () => {
    if (!sweep) return;
    const n = new Date();
    sweep.style.animation = "none"; void sweep.offsetWidth; sweep.style.animation = "";
    sweep.style.setProperty("--sweep-delay", -(n.getSeconds() + n.getMilliseconds() / 1000) + "s");
  };
  syncSweep();
  const resweep = () => { if (document.visibilityState !== "hidden") syncSweep(); };
  document.addEventListener("visibilitychange", resweep);
  window.addEventListener("pageshow", resweep);

  // Cycloidal drive: N ring pins, N-1 lobes, eccentric E. Input turns the eccentric;
  // the disc turns backward at 1/(N-1) of it. Disc rotation is the output and reads the hour.
  const dial = document.getElementById("dial");
  if (dial) {
    const N = 12, R = 80, Rr = 3.2, E = 2.2, DOT = 72.5;
    let d = "";
    for (let i = 0, n = 480; i <= n; i++) {
      const t = (2 * Math.PI * i) / n;
      const psi = Math.atan2(Math.sin((1 - N) * t), R / (E * N) - Math.cos((1 - N) * t));
      const x = R * Math.cos(t) - Rr * Math.cos(t + psi) - E * Math.cos(N * t);
      const y = -R * Math.sin(t) + Rr * Math.sin(t + psi) + E * Math.sin(N * t);
      d += (i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
    }
    d += "Z";
    const pins = (svg) => { for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; svg.appendChild(el("circle", { cx: 100 + R * Math.sin(a), cy: 100 - R * Math.cos(a), r: Rr })); } };
    dial.querySelectorAll(".dial__pins").forEach(pins);
    const movers = [];
    const shadow = dial.querySelector(".dial__shadow");
    if (shadow) {
      shadow.appendChild(el("filter", { id: "dial-blur", x: "-20%", y: "-20%", width: "140%", height: "140%" })).appendChild(el("feGaussianBlur", { stdDeviation: "2.2" }));
      const g = el("g", { filter: "url(#dial-blur)" });
      const m = el("g", {}); m.appendChild(el("path", { d })); g.appendChild(m);
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; g.appendChild(el("circle", { cx: 100 + R * Math.sin(a), cy: 100 - R * Math.cos(a), r: Rr + 0.6 })); }
      shadow.appendChild(g); movers.push(m);
    }
    dial.querySelectorAll(".dial__disc").forEach((svg) => {
      const m = el("g", {}); m.appendChild(el("path", { d }));
      if (svg.classList.contains("dial__disc--top")) m.appendChild(el("circle", { class: "dial__hour", cx: 0, cy: -DOT, r: 2.4 }));
      svg.appendChild(m); movers.push(m);
    });
    const place = (rot) => { // rot: output angle, clockwise from 12, radians
      const th = -(N - 1) * rot;
      const tf = `translate(${(100 + E * Math.cos(th)).toFixed(3)} ${(100 + E * Math.sin(th)).toFixed(3)}) rotate(${((rot * 180) / Math.PI).toFixed(3)})`;
      movers.forEach((m) => m.setAttribute("transform", tf));
    };
    const hfmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", timeZone: "America/Vancouver" });
    const outputNow = () => {
      const p = Object.fromEntries(hfmt.formatToParts(new Date()).map((x) => [x.type, +x.value]));
      return (((p.hour % 12) + p.minute / 60 + p.second / 3600) / 12) * Math.PI * 2;
    };
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    // On load the eccentric makes one quick turn into place, so the reduction is visible once.
    if (!still.matches && "requestAnimationFrame" in window) {
      const t0 = performance.now(), dur = 2400, back = (2 * Math.PI) / (N - 1);
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        place(outputNow() + back * (1 - e));
        if (k < 1) requestAnimationFrame(step); else { place(outputNow()); syncers.push(() => place(outputNow())); }
      };
      place(outputNow() + back); requestAnimationFrame(step);
    } else { place(outputNow()); syncers.push(() => place(outputNow())); }

    // 2.5D: a gentle tilt toward the cursor on fine pointers; flat for reduced motion.
    const stage = dial.querySelector(".dial__stage");
    const hero = dial.closest(".hero") || document.body;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const MAX = 10;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const apply = () => { stage.style.transform = `rotateX(${cx.toFixed(2)}deg) rotateY(${cy.toFixed(2)}deg)`; };
    const loop = () => {
      cx += (tx - cx) * 0.09; cy += (ty - cy) * 0.09;
      if (Math.abs(tx - cx) < 0.01 && Math.abs(ty - cy) < 0.01) { cx = tx; cy = ty; raf = 0; } else raf = requestAnimationFrame(loop);
      apply();
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    hero.addEventListener("pointermove", (e) => {
      if (!fine.matches || still.matches || e.pointerType !== "mouse") return;
      const r = dial.getBoundingClientRect(), half = r.width / 2;
      const dx = (e.clientX - (r.left + half)) / (half * 1.8), dy = (e.clientY - (r.top + half)) / (half * 1.8);
      const c = (v) => Math.max(-1, Math.min(1, v));
      tx = -c(dy) * MAX; ty = c(dx) * MAX; kick();
    }, { passive: true });
    const settle = () => { tx = 0; ty = 0; kick(); };
    hero.addEventListener("pointerleave", settle);
    window.addEventListener("blur", settle);
    still.addEventListener?.("change", () => { if (still.matches) { tx = ty = cx = cy = 0; stage.style.transform = ""; } });
  }

  // Active tab follows the section in view
  const tabs = [...document.querySelectorAll(".tab")];
  const sections = tabs.map((t) => document.querySelector(t.getAttribute("href"))).filter(Boolean);
  const now = document.querySelector(".nav__now");
  const setActive = (id) => {
    let label = "";
    tabs.forEach((t) => {
      const on = t.getAttribute("href") === "#" + id;
      t.classList.toggle("is-active", on);
      if (on) { t.setAttribute("aria-current", "location"); label = t.textContent; } else t.removeAttribute("aria-current");
    });
    if (now) now.textContent = label;
  };
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => spy.observe(s));
    window.addEventListener("scroll", () => { if (window.scrollY < 200) setActive(""); }, { passive: true });

    // Gentle reveal
    const items = document.querySelectorAll(".section .card, .entry");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => { el.classList.add("reveal"); io.observe(el); });
  }
  // Bar: a quiet glass strip once the page leaves the top
  const bar = document.querySelector(".bar");
  if (bar) {
    const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Compact menu for narrow screens: one button, every section, closes on pick, Esc or outside tap
  const nav = document.querySelector(".nav");
  const menu = nav && nav.querySelector(".nav__menu");
  const panel = nav && nav.querySelector(".tabs");
  if (menu && panel) {
    const label = menu.querySelector(".nav__menu-label");
    const setOpen = (open, focusBack) => {
      nav.classList.toggle("is-open", open);
      menu.setAttribute("aria-expanded", String(open));
      if (label) label.textContent = open ? "Close" : "Menu";
      if (open) { const first = panel.querySelector("a"); if (first) first.focus({ preventScroll: true }); }
      else if (focusBack) menu.focus({ preventScroll: true });
    };
    menu.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
    panel.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("is-open")) setOpen(false, true); });
    document.addEventListener("pointerdown", (e) => { if (nav.classList.contains("is-open") && !nav.contains(e.target)) setOpen(false); });
    matchMedia("(min-width: 901px)").addEventListener?.("change", (m) => { if (m.matches) setOpen(false); });
  }

  // Private visit count: one tiny POST per page load, no cookies, skipped until the API exists
  // (the leaderboard Worker; Servo Sprint itself lives at https://servosprint.xyz)
  const API_BASE = "https://api.auamai.dev";
  if (window.fetch) fetch(API_BASE + "/hit", { method: "POST", credentials: "omit", keepalive: true }).catch(() => {});
})();
