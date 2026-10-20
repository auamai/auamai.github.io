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
  tick(); tickDate();
  setInterval(() => { tick(); tickDate(); }, 15000);

  // Dial: 60 ticks, majors every 5; seconds sweep synced to real time
  const ticks = document.getElementById("dial-ticks");
  if (ticks) {
    const ns = "http://www.w3.org/2000/svg";
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0, a = (i / 60) * Math.PI * 2;
      const r1 = 96, r2 = major ? 89 : 92.5;
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", 100 + r1 * Math.sin(a)); l.setAttribute("y1", 100 - r1 * Math.cos(a));
      l.setAttribute("x2", 100 + r2 * Math.sin(a)); l.setAttribute("y2", 100 - r2 * Math.cos(a));
      if (major) l.setAttribute("class", "major");
      ticks.appendChild(l);
    }
  }
  const sweep = document.querySelector(".dial__sweep");
  if (sweep) { const n = new Date(); sweep.style.setProperty("--sweep-delay", -(n.getSeconds() + n.getMilliseconds() / 1000) + "s"); }

  // Active tab follows the section in view
  const tabs = [...document.querySelectorAll(".tab")];
  const sections = tabs.map((t) => document.querySelector(t.getAttribute("href"))).filter(Boolean);
  const setActive = (id) => tabs.forEach((t) => t.classList.toggle("is-active", t.getAttribute("href") === "#" + id));
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
  // Play: three.js and the game load only when asked for
  const playBtn = document.getElementById("play-btn");
  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      if (playBtn.getAttribute("aria-busy") === "true") return;
      playBtn.setAttribute("aria-busy", "true");
      const label = playBtn.innerHTML;
      // three.js is a few hundred kB: say so if it takes more than a moment.
      const slow = setTimeout(() => { playBtn.textContent = "Loading…"; }, 250);
      try {
        const { openGame } = await import("./game/game.js?v=20261020r4");
        await openGame();
      } catch (err) {
        console.error(err);
        window.location.href = "game/";
      } finally {
        clearTimeout(slow);
        playBtn.innerHTML = label;
        playBtn.removeAttribute("aria-busy");
      }
    });
  }

  // Private visit count: one tiny POST per page load, no cookies, skipped until the API exists
  import("./game/config.js").then(({ API_BASE }) => {
    if (!API_BASE) return;
    fetch(API_BASE.replace(/\/+$/, "") + "/hit", { method: "POST", credentials: "omit", keepalive: true }).catch(() => {});
  }).catch(() => {});
})();
