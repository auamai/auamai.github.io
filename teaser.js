// Factory Run teaser: lazy looping clip (still poster under reduced motion) and the live top score.
(() => {
  const strip = document.querySelector("[data-teaser]");
  if (!strip) return;

  // Clip: attach sources only when the strip is on screen, never under reduced motion or Save-Data.
  const video = strip.querySelector("video");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = navigator.connection && navigator.connection.saveData;
  let loaded = false, visible = false;
  const play = () => {
    if (!video || still.matches || saveData || !visible || document.hidden) return;
    if (!loaded) {
      video.querySelectorAll("source[data-src]").forEach((s) => { s.src = s.dataset.src; });
      video.load();
      loaded = true;
    }
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  };
  const pause = () => { if (video && loaded) video.pause(); };
  if (video) {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => { visible = e.isIntersecting; visible ? play() : pause(); });
      }).observe(strip);
    } else { visible = true; play(); }
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
    const onPref = () => (still.matches ? pause() : play());
    if (still.addEventListener) still.addEventListener("change", onPref);
  }

  // Top score: quiet on any failure (the strip reads fine without it).
  const box = strip.querySelector("[data-teaser-score]");
  const val = strip.querySelector("[data-teaser-top]");
  if (!box || !val || !window.fetch) return;
  const ctl = "AbortController" in window ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), 5000);
  fetch("https://api.auamai.dev/scores", { credentials: "omit", signal: ctl ? ctl.signal : undefined })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const list = d && Array.isArray(d.scores) ? d.scores : [];
      const top = list.reduce((m, s) => (s && Number.isFinite(+s.score) && (!m || +s.score > +m.score) ? s : m), null);
      if (!top) return;
      val.textContent = Math.round(+top.score).toLocaleString("en-US");
      if (top.username) box.title = "Top score by " + String(top.username).slice(0, 16);
      box.hidden = false;
    })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
})();
