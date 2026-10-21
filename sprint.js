// Servo Sprint teaser. Plays the gameplay loop only while it is on screen and the tab is visible;
// with prefers-reduced-motion (or Save-Data) it never loads the video and the poster stays.
// Copy: a returning player sees their own best; a first visit sees the board's top score when
// the board answers, else the plain caption. Reads the game's local save only; never writes it.
//   localStorage "au_factory_profile_v1"  { username, best, held: { score } }   (written by the old auamai.dev/game build, now a redirect to servosprint.xyz)
//   localStorage "au_factory_public_v1"   { v, name, best, rank, ... }          (game, read-only summary)
(() => {
  const el = document.querySelector("[data-sprint]");
  if (!el) return;
  const $ = (s) => el.querySelector(s);
  const video = $("[data-sprint-video]");
  const API = "https://api.auamai.dev/scores";
  const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const int = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };

  /* ---------- copy ---------- */
  const save = readJSON("au_factory_profile_v1");
  const pub = readJSON("au_factory_public_v1");
  const fromSave = save && typeof save.username === "string" && NAME_RE.test(save.username)
    ? { name: save.username, best: Math.max(int(save.best), int(save.held && save.held.score)) } : null;
  const fromPub = pub && typeof pub.name === "string" && NAME_RE.test(pub.name) ? { name: pub.name, best: int(pub.best) } : null;
  const me = fromSave || fromPub;
  if (me && fromPub && fromPub.name === me.name) me.best = Math.max(me.best, fromPub.best);

  const scoreEl = $("[data-sprint-score]"), kEl = $("[data-sprint-k]"), nEl = $("[data-sprint-n]"), capEl = $("[data-sprint-cap]");
  const show = (k, n) => { kEl.textContent = k; nEl.textContent = fmt(n); scoreEl.hidden = false; };
  if (me && me.best > 0) {
    show("Your best", me.best);
    capEl.textContent = `Welcome back, ${me.name}`;
    el.setAttribute("aria-label", `Play Servo Sprint. Welcome back, ${me.name}. Your best is ${fmt(me.best)}.`);
  } else if (window.fetch) {
    const ctl = "AbortController" in window ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 5000);
    fetch(API, { credentials: "omit", signal: ctl ? ctl.signal : undefined })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const top = (d && Array.isArray(d.scores) ? d.scores : [])
          .map((s) => (s && Number.isFinite(+s.score) ? Math.round(+s.score) : 0))
          .reduce((a, b) => Math.max(a, b), 0);
        if (top > 0) {
          show("Top score", top);
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
