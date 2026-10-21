// Servo Sprint teaser. Plays the gameplay loop only while it is on screen and the tab is visible;
// with prefers-reduced-motion (or Save-Data) it never loads the video and the poster stays.
// Copy: the board's live top score (GET https://api.auamai.dev/scores) when it answers, else the plain caption.
// The game lives on servosprint.xyz now, so this page can't see a player's save (different origin) and
// doesn't read localStorage at all; old auamai.dev saves are ignored.
(() => {
  const el = document.querySelector("[data-sprint]");
  if (!el) return;
  const $ = (s) => el.querySelector(s);
  const video = $("[data-sprint-video]");
  const API = "https://api.auamai.dev/scores";
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  /* ---------- copy ---------- */
  const scoreEl = $("[data-sprint-score]"), kEl = $("[data-sprint-k]"), nEl = $("[data-sprint-n]");
  if (scoreEl && window.fetch) {
    const ctl = "AbortController" in window ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 5000);
    fetch(API, { credentials: "omit", cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const top = (d && Array.isArray(d.scores) ? d.scores : [])
          .map((s) => (s && Number.isFinite(+s.score) ? Math.round(+s.score) : 0))
          .reduce((a, b) => Math.max(a, b), 0);
        if (top > 0) {
          kEl.textContent = "Top score"; nEl.textContent = fmt(top); scoreEl.hidden = false;
          el.setAttribute("aria-label", `Play Servo Sprint, a 60-second robot runner, in your browser. Top score ${fmt(top)}.`);
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  }

  /* ---------- the loop ---------- */
  if (!video) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  let onScreen = false;
  const want = () => onScreen && !document.hidden && !still.matches && !saveData;
  const sync = () => {
    if (want()) {
      if (video.paused) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
    } else if (!video.paused) video.pause();
  };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; sync(); }, { threshold: 0.2 }).observe(el);
  } else { onScreen = true; }
  document.addEventListener("visibilitychange", sync);
  if (still.addEventListener) still.addEventListener("change", sync);
  // bfcache: coming back from the game with the back button
  window.addEventListener("pageshow", sync);
  sync();
})();
