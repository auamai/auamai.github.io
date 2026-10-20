(() => {
  // Local time in Vancouver, BC
  const clock = document.getElementById("clock");
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver",
  });
  const tick = () => { if (clock) clock.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 15000);

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
})();
