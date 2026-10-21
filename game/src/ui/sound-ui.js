// The always-visible speaker button: tap (or M) mutes and unmutes the music; hold it on touch,
// or hover / click-and-hold on desktop, for a small popover with the Music and Effects sliders.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261021r11";
import { ICON } from "../core/constants.js?v=20261021r11";

const HOLD_MS = 420;   // long-press to open the sliders
const HOVER_MS = 350;  // desktop hover delay

export class SoundUi {
  bindSound() {
    const btn = this.root.querySelector('[data-act="sound"]'), pop = this.root.querySelector(".fr__volpop"), wrap = btn.parentElement;
    this.btnSound = btn; this.volPop = pop;
    let holdT = 0, held = false, hoverT = 0;
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); held = false;
      clearTimeout(holdT);
      holdT = setTimeout(() => { held = true; this.openVolPop(); }, HOLD_MS);
    });
    const cancel = () => clearTimeout(holdT);
    btn.addEventListener("pointerup", cancel); btn.addEventListener("pointercancel", cancel); btn.addEventListener("pointerleave", cancel);
    btn.addEventListener("click", (e) => { e.stopPropagation(); if (held) { held = false; return; } this.toggleMusic(); });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    if (matchMedia("(hover: hover)").matches) {
      wrap.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { clearTimeout(hoverT); hoverT = setTimeout(() => this.openVolPop(), HOVER_MS); } });
      wrap.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { clearTimeout(hoverT); hoverT = setTimeout(() => this.closeVolPop(), 250); } });
    }
    pop.addEventListener("pointerdown", (e) => e.stopPropagation());
    pop.addEventListener("click", (e) => e.stopPropagation());
    pop.addEventListener("input", (e) => {
      const k = e.target.dataset.vol; if (!k) return;
      const v = +e.target.value / 100;
      this.settings[k] = v; P.setSetting(k, v);
      const on = k === "musicVol" ? "music" : "sfx";
      if (v > 0 && this.settings[on] === false) { this.settings[on] = true; P.setSetting(on, true); }
      this.audio?.applyVolumes(); this.paintSound();
    });
    pop.addEventListener("change", (e) => { if (e.target.dataset.vol === "sfxVol") this.sfx("gear"); });
    this.onDocDown = (e) => { if (!pop.hidden && !wrap.contains(e.target)) this.closeVolPop(); };
    document.addEventListener("pointerdown", this.onDocDown, true);
    this.paintSound();
  }

  toggleMusic() {
    const on = this.settings.music === false;
    this.settings.music = on; P.setSetting("music", on);
    if (on && !(this.settings.musicVol > 0)) { this.settings.musicVol = 0.7; P.setSetting("musicVol", 0.7); }
    this.audio?.applyVolumes();
    this.paintSound();
    // Keep the settings panel's toggle in step if it is on screen.
    const t = this.panel && this.panel.querySelector('[data-key="music"]');
    if (t) t.setAttribute("aria-pressed", on ? "true" : "false");
    this.sr(on ? "Music on" : "Music muted");
  }

  paintSound() {
    const b = this.btnSound; if (!b) return;
    const muted = this.settings.music === false;
    b.innerHTML = muted ? ICON.muted : ICON.sound;
    b.setAttribute("aria-pressed", muted ? "true" : "false");
    b.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
    if (this.volPop && !this.volPop.hidden) {
      for (const i of this.volPop.querySelectorAll("input")) { const k = i.dataset.vol, on = this.settings[k === "musicVol" ? "music" : "sfx"] !== false; if (document.activeElement !== i) i.value = on ? Math.round((this.settings[k] ?? (k === "musicVol" ? 0.7 : 0.8)) * 100) : 0; }
    }
  }

  openVolPop() {
    const pop = this.volPop; if (!pop || !pop.hidden) return;
    const row = (k, label) => { const on = this.settings[k === "musicVol" ? "music" : "sfx"] !== false, v = on ? Math.round((this.settings[k] ?? (k === "musicVol" ? 0.7 : 0.8)) * 100) : 0;
      return `<label class="fr__vol"><span>${label}</span><input type="range" min="0" max="100" step="5" data-vol="${k}" value="${v}" aria-label="${label} volume" /></label>`; };
    pop.innerHTML = row("musicVol", "Music") + row("sfxVol", "Effects");
    pop.hidden = false;
  }

  closeVolPop() { if (this.volPop) this.volPop.hidden = true; }
}
