// Boot: load the game, then drop the loading screen (external so the page's CSP needs no inline script).
const boot = document.getElementById("fr-boot");
// Under the portfolio (/game/) the close button goes back to the site; on its own domain there is nothing to close to.
const nested = /\/game\/?$/.test(location.pathname.replace(/index\.html$/, ""));
import("./game.js?v=20261020r6d")
  .then(({ openGame }) => openGame({ standalone: true, exitUrl: nested ? "../" : null }))
  .then(() => boot.remove())
  .catch((err) => {
    console.error(err);
    boot.innerHTML = '<div class="boot__in"><span>Servo Sprint could not load. Check your connection.</span><a href="">Try again</a></div>';
  });
