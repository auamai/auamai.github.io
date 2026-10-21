// In-run HUD: score, chips, popups, tips, toast, screen-reader line.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import * as P from "../../profile.js?v=20261021r7";
import { DIST_POINTS, MAGNET_T, DRILL_T, HAMMER_T, GOLD_T, OVER_T, SLOW_T, ICON, TIPS, NO_SLOW, visY, FLOW_MAX, FLOW_LVL, MARK_FAR, MARK_NEAR, TOOL_NAME } from "../core/constants.js?v=20261021r7";
import { fmt } from "../core/util.js?v=20261021r7";

// Tool chips in HUD order: [fx key, full duration, label].
// The last four are combos (run.js updateFx): they read as a pair, cyan-edged, after the tools they join.
const CHIPS = [["magnet", MAGNET_T, "Magnet"], ["drill", DRILL_T, "Drill"], ["hammer", HAMMER_T, "Hammer"], ["gold", GOLD_T, "Gold"], ["over", OVER_T, "Overdrive"],
  ["bumper", OVER_T, "Bumper"], ["rush", MAGNET_T, "Gold rush"], ["brk", HAMMER_T, "Clean break"], ["oc", OVER_T, "Overclock"]];
const COMBO = new Set(["bumper", "rush", "brk", "oc"]);
const MARK = { wrench: ["tool", TOOL_NAME.wrench], drill: ["tool", TOOL_NAME.drill], hammer: ["tool", TOOL_NAME.hammer], gold: ["star", "Golden"], wheel: ["wheel", "Roller"] };
const V = new THREE.Vector3();
const CHIP_T = Object.fromEntries(CHIPS.map(([k, T]) => [k, T]));

export class Hud {
  // Floating "+25" over the thing that paid it, projected to the screen. Pooled DOM.
  pop(text, at, big = false) {
    if (!this.popEls) this.popEls = [];
    let el = this.popEls.find((e) => !e._on);
    if (!el) {
      if (this.popEls.length >= 10) el = this.popEls.reduce((a, b) => (a._t < b._t ? a : b));
      else { el = document.createElement("span"); el.className = "fr__popup"; this.elPops.appendChild(el); this.popEls.push(el); }
    }
    const v = new THREE.Vector3(at.x, visY(at.y || 1) + 0.6, Math.min(at.z || 0, 0)).project(this.camera);
    el.textContent = text;
    el.style.left = `${((v.x + 1) / 2 * 100).toFixed(1)}%`;
    el.style.top = `${((1 - v.y) / 2 * 100).toFixed(1)}%`;
    el.classList.toggle("is-big", big);
    el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on");
    el._on = true; el._t = performance.now();
    clearTimeout(el._h); el._h = setTimeout(() => { el._on = false; el.classList.remove("is-on"); }, 750);
  }

  /* ---------- first-run tips ---------- */
  tipLines(id) {
    const t = TIPS[id];
    return t.all || (this.coarse ? t.touch : t.keys);
  }

  tipText(id) { return this.tipLines(id).join(" "); }

  showTip(id, secs = 2.6, again = false) {
    if ((this.tips[id] && !again) || this.tipNow === id) return;
    this.tipNow = id;
    this.tipLeft = secs;
    this.tipAt = this.realT || 0;
    const ic = TIPS[id].icon, [title, sub] = this.tipLines(id);
    const flat = !this.use3d;
    this.tipEl.classList.toggle("is-3d", !flat);
    this.tipEl.querySelector(".fr__tip-icon").innerHTML = ic === "lr" ? ICON.left + ICON.right : ic === "wheel" ? ICON.wheel : ICON[ic];
    this.tipEl.querySelector(".fr__tip-title").textContent = title;
    this.tipEl.querySelector(".fr__tip-text").textContent = sub;
    this.tipEl.dataset.tip = id;
    if (!flat) { this.ui.showHint(id, title, ic); this.placeTipSub(); }
    this.tipEl.classList.remove("is-on");
    void this.tipEl.offsetWidth;
    this.tipEl.classList.add("is-on");
    if (!again) this.sr(this.tipText(id));
    // First sight of a jump, slide or wheel hint: time eases down so there's a moment to read it.
    if (!again && !NO_SLOW.has(id) && !this.reduceMotion) this.slowT = SLOW_T;
  }

  // The 3D title lives in the overlay scene; its quieter line is crisp DOM text under it.
  placeTipSub() {
    if (!this.tipNow || !this.use3d || !this.ui.hint.on) return;
    this.tipEl.style.setProperty("--fr-tip-y", `${this.ui.hint.subY.toFixed(1)}px`);
  }

  hideTip() {
    this.tipNow = null;
    this.tipEl.classList.remove("is-on");
    this.ui?.hideHint();
  }

  // A tip is done once the player has done the thing it teaches.
  learned(id) {
    if (this.tips[id]) return;
    this.tips[id] = 1;
    P.setSetting("tips", this.tips);
    if (this.tipNow === id) this.tipLeft = Math.min(this.tipLeft, 0.5);
  }

  updateTips(dt) {
    if (this.tipNow) {
      this.tipLeft -= dt;
      if (this.tipLeft <= 0) this.hideTip();
    }
    // The first time something needs a jump or a slide, say so while it's still well ahead
    // (a jump or slide hint takes over from the lanes hint; it's the one that matters now).
    if (!this.tipNow || this.tipNow === "lanes") {
      for (const o of this.obstacles) {
        if (o.passed || o.z < -48 || o.z > -11 || Math.abs(o.x - this.r.x) > 1.2) continue;
        const need = o.type === "arm" ? "slide" : o.type === "stack" ? null : "jump";
        if (need && !this.tips[need]) return this.showTip(need, 2.4);
      }
    }
    if (this.tipNow) return;
    if (!this.tips.lanes && this.runTime > 0.8 && this.runTime < 30) return this.showTip("lanes", 3);
    const tk = this.token;
    if (tk && !tk.taken && tk.z > -56 && tk.z < -8 && !this.tips.wheel) return this.showTip("wheel", 2.6);
    // First sight of each tool, while it's still well ahead.
    for (const it of this.items) if (!it.taken && it.z > -56 && it.z < -8 && !this.tips[it.kind]) return this.showTip(it.kind, 2.6);
  }

  sr(msg) {
    this.srEl.textContent = "";
    setTimeout(() => { this.srEl.textContent = msg; }, 30);
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("is-on");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove("is-on"), 2800);
  }

  // Incoming power-ups: a small labelled marker over each tool, golden wrench or wheel while it is still far
  // down the line (MARK_FAR to MARK_NEAR), so the lane choice can start early. Two pooled DOM markers.
  updateMarks() {
    const els = this.elMarks;
    if (!els) return;
    let n = 0;
    const show = (kind, x, y, z) => {
      if (n >= els.length || z < MARK_FAR || z > MARK_NEAR) return;
      const el = els[n++], m = MARK[kind];
      if (el._k !== kind) { el._k = kind; el.firstChild.innerHTML = ICON[m[0]]; el.lastChild.textContent = m[1]; el.classList.toggle("is-gold", kind === "gold"); }
      V.set(x, visY(y) + 1.1, z).project(this.camera);
      const lx = Math.round((V.x + 1) * 500), ly = Math.round((1 - V.y) * 500), fade = z > MARK_NEAR - 12 ? 1 : 0;
      if (lx !== el._x || ly !== el._y) { el._x = lx; el._y = ly; el.style.left = `${(lx / 10).toFixed(1)}%`; el.style.top = `${(ly / 10).toFixed(1)}%`; }
      if (el.hidden) el.hidden = false;
      if (fade !== el._f) { el._f = fade; el.classList.toggle("is-near", !!fade); }
    };
    for (const it of this.items) if (!it.taken && it.kind !== "screw") show(it.kind, it.x, it.y, it.z);
    const tk = this.token;
    if (tk && !tk.taken) show("wheel", tk.x, tk.y, tk.z);
    for (let i = n; i < els.length; i++) if (!els[i].hidden) { els[i].hidden = true; els[i]._k = null; }
  }

  updateHud(mult, v) {
    const sh = this.shown, f = this.fx, s = Math.floor(this.score);
    if (s !== sh.score) { sh.score = s; this.elScore.textContent = fmt(s); }
    if (this.gearsRun !== sh.gears) { sh.gears = this.gearsRun; this.elGears.textContent = this.gearsRun; }
    const m = Math.round(mult * 10) / 10;
    if (m !== sh.mult) {
      sh.mult = m;
      this.elMult.hidden = m <= 1;
      this.elMult.textContent = `×${m % 1 ? m.toFixed(1) : m}`;
      this.elMult.classList.toggle("is-hot", m >= 4);
      if (m > 1) { this.elMult.classList.remove("is-bump"); void this.elMult.offsetWidth; this.elMult.classList.add("is-bump"); }
    }
    const seg = f.over > 0 ? -1 : Math.floor(f.meter / 2);
    if (seg !== sh.meter) {
      sh.meter = seg;
      this.elMeter.forEach((el, i) => el.classList.toggle("is-on", seg < 0 || i < seg));
      this.elMeter[0].parentNode.classList.toggle("is-over", seg < 0);
    }
    // Active tool chips: name and a ring that empties; the golden one shows its multiplier.
    // Runs every 120 Hz sub-step, so it allocates nothing unless the set of chips or a shown value changes.
    let mask = 0;
    for (let i = 0; i < CHIPS.length; i++) if (f[CHIPS[i][0]] > 0) mask |= 1 << i;
    if (mask !== sh.chips) {
      sh.chips = mask;
      this.elChips.innerHTML = CHIPS.filter((c, i) => mask & (1 << i)).map(([k, , n]) => `<span class="fr__chip is-${k}${COMBO.has(k) ? " is-combo" : ""}" data-k="${k}"><svg viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9.5"/><circle class="fg" cx="12" cy="12" r="9.5"/></svg><b>${n}</b></span>`).join("");
      this.chipEls = [...this.elChips.children];
      for (const el of this.chipEls) { el._k = el.dataset.k; el._T = CHIP_T[el._k]; el._ring = el.firstChild.lastChild; el._dash = -1; el._gold = -1; }
    }
    const chips = this.chipEls;
    if (chips) for (let i = 0; i < chips.length; i++) {
      const el = chips[i], k = el._k;
      const dash = Math.round((1 - f[k] / el._T) * 597); // 0.1 of the 59.69 ring length
      if (dash !== el._dash) { el._dash = dash; el._ring.style.strokeDashoffset = (dash / 10).toFixed(1); }
      if (k === "gold") { const gm = Math.min(5, 2 + Math.floor(f.goldAge)); if (gm !== el._gold) { el._gold = gm; el.lastChild.textContent = `Gold ×${gm}`; } }
      const ending = f[k] < 1.5 && !(f.oc > 0 && (k === "magnet" || k === "drill" || k === "hammer"));
      if (ending !== el._end) { el._end = ending; el.classList.toggle("is-ending", ending); }
    }
    // Flow meter: appears with the first style move or pickup chain, then stays for the run.
    const w = this.flow;
    if (w) {
      if (!sh.flowOn && w.c > 0 && (w.seen || w.c >= FLOW_LVL)) { sh.flowOn = true; this.elFlow.hidden = false; }
      if (sh.flowOn) {
        const q = Math.round((w.c % FLOW_LVL) / FLOW_LVL * 50), qq = w.lvl >= 5 ? 50 : q;
        if (qq !== sh.flowQ) { sh.flowQ = qq; this.elFlowBar.style.transform = `scaleX(${(qq / 50).toFixed(2)})`; }
        if (w.lvl !== sh.flowL) {
          const up = w.lvl > sh.flowL && sh.flowL > 0;
          sh.flowL = w.lvl; this.elFlowLab.textContent = w.lvl >= 5 ? "In the zone" : `Flow ×${w.lvl}`;
          this.elFlow.classList.toggle("is-zone", w.lvl >= 5);
          if (up) { this.elFlow.classList.remove("is-bump"); void this.elFlow.offsetWidth; this.elFlow.classList.add("is-bump"); }
        }
      }
    }
    this.updateMarks();
    // Personal best: the HUD bar fills toward it, and a floor line marks where it falls at this pace.
    if (this.pbFrom > 0) {
      const q = Math.min(1, this.score / this.pbFrom), qi = Math.round(q * 200);
      if (qi !== sh.pb) { sh.pb = qi; this.elPbBar.style.transform = `scaleX(${q.toFixed(3)})`; }
      if (this.pbPassed && !this.elPb.classList.contains("is-past")) { this.elPb.classList.add("is-past"); this.elPbLabel.textContent = "New best"; }
      const left = this.pbFrom - this.score, pace = DIST_POINTS * mult;
      const z = -left / pace;
      this.pbLine.visible = left > 0 && z > -90;
      if (this.pbLine.visible) this.pbLine.position.z = z;
    } else this.pbLine.visible = false;
    // Held props
    const R = this.robot;
    this.props.hammer.visible = f.hammer > 0 && R.form === "runner";
    this.props.drill.visible = f.drill > 0 && !(f.hammer > 0) && R.form === "runner";
    if (this.props.drill.visible) this.props.drill.userData.spin.children[4].rotation.x += 0.6;
  }
}
