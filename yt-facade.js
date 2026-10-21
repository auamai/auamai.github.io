// Click-to-load YouTube facade. Nothing from YouTube loads until the visitor presses play;
// then a youtube-nocookie iframe replaces the poster in the same 16:9 box (no layout shift).
// Without JS the "Watch on YouTube" link under the card still works.
(() => {
  const buttons = document.querySelectorAll("[data-yt]");
  if (!buttons.length) return;
  let warmed = false;
  const warm = () => {
    // Pointer intent: open connections early so the player starts faster (no requests for content)
    if (warmed) return; warmed = true;
    for (const href of ["https://www.youtube-nocookie.com", "https://i.ytimg.com", "https://www.google.com"]) {
      const l = document.createElement("link"); l.rel = "preconnect"; l.href = href; l.crossOrigin = ""; document.head.append(l);
    }
  };
  buttons.forEach((btn) => {
    const id = btn.getAttribute("data-yt");
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    const frame = btn.closest("[data-yt-frame]");
    btn.addEventListener("pointerenter", warm, { once: true });
    btn.addEventListener("focus", warm, { once: true });
    btn.addEventListener("click", () => {
      if (!frame || frame.classList.contains("is-playing")) return;
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
      f.title = btn.getAttribute("data-yt-title") || "YouTube video";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      f.width = "1280"; f.height = "720";
      frame.append(f);
      frame.classList.add("is-playing");
      f.focus({ preventScroll: true });
    });
  });
})();
