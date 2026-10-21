// Meta layer in the game: missions strip, Garage (robot design, cosmetics, Spare Servo, Toolbox),
// milestone badges. Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261021r11";
import * as MT from "../../meta.js?v=20261021r11";
import { MILESTONES, OVER_ICON } from "../core/constants.js?v=20261021r11";
import { fmt, esc } from "../core/util.js?v=20261021r11";

const hex6 = (n) => `#${n.toString(16).padStart(6, "0")}`;
// Toolbox chip: the wallet, shown on the title, the Garage and game over.
export const toolboxHtml = (n, cls = "") => `<span class="fr__toolbox ${cls}" role="status" aria-label="Toolbox: ${fmt(n)} gears"><span class="fr__sicon">${OVER_ICON.toolbox}</span><b class="fr__tbn">${fmt(n)}</b><span>gears</span></span>`;

export class Garage {
  // Menu: Line grade, the three active missions (progress in numbers, a daily free swap), the weekly goal.
  missionsHtml() {
    const list = MT.missionsFill(this.settings.missions);
    if (!this.settings.missions) { this.settings.missions = list; P.setSetting("missions", list); }
    const swaps = MT.rerollsLeft(this.settings.reroll), wk = MT.weekNow(this.settings.week);
    const rows = list.map((m, i) => {
      const d = MT.missionInfo(m), q = Math.min(1, d.prog / d.goal), swap = swaps > 0 && d.kind !== "start";
      return `<li><span class="fr__mtext">${esc(d.text)}<small>${MT.missionProg(m)}</small></span><span class="fr__mbar" role="progressbar" aria-label="${esc(d.text)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(q * 100)}"><i style="transform:scaleX(${q.toFixed(3)})"></i></span><span class="fr__mrew">+${d.reward}</span>${swap
        ? `<button class="fr__swap" type="button" data-panel="reroll" data-i="${i}" aria-label="Swap mission: ${esc(d.text)}" title="Swap (free once a day)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9a7 7 0 0 1 12.2-3.2L19 8M19 4v4h-4M19 15a7 7 0 0 1-12.2 3.2L5 16M5 20v-4h4"/></svg></button>` : `<span class="fr__swap is-none" aria-hidden="true"></span>`}</li>`;
    }).join("");
    const starter = list.some((m) => MT.missionInfo(m).kind === "start");
    const week = wk.paid ? `Weekly goal done · +${MT.WEEKLY.reward} banked` : `This week <b>${Math.min(wk.n, MT.WEEKLY.goal)} / ${MT.WEEKLY.goal}</b> missions · +${MT.WEEKLY.reward} gears`;
    return `${this.gradeHtml()}<div class="fr__missions"><p class="fr__label">${starter ? "First missions" : "Missions"}</p><ul>${rows}</ul>
      <p class="fr__muted fr__week">${week}${swaps > 0 && !starter ? " · one free swap today" : ""}</p></div>`;
  }

  // Line grade: lifetime gears banked. The bar shows the way to the next grade and what it unlocks.
  gradeHtml() {
    const p = this.profile;
    if (!p) return "";
    const g = MT.gradeOf(p.gears), next = MT.unlocksAt(g.n + 1)[0];
    return `<div class="fr__grade"><span class="fr__gradeN">Grade <b>${g.n}</b></span><span class="fr__mbar" role="progressbar" aria-label="Grade ${g.n} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(g.q * 100)}"><i style="transform:scaleX(${g.q.toFixed(3)})"></i></span><span class="fr__gradeNext">${g.n < MT.GRADE_MAX ? `${fmt(g.hi - p.gears)} gears to ${g.n + 1}${next ? ` · ${esc(next)}` : ` · +${MT.gradeReward(g.n + 1)}`}` : "Top grade"}</span></div>`;
  }

  rerollMission(i) {
    const r = MT.reroll(this.settings.missions, +i, this.settings.reroll);
    if (!r) return;
    this.settings.missions = r.list; P.setSetting("missions", r.list);
    this.settings.reroll = r.rr; P.setSetting("reroll", r.rr);
    this.sfx("tap");
    const box = this.panel.querySelector(".fr__missions");
    const g = this.panel.querySelector(".fr__grade");
    if (box) { if (g) g.remove(); box.outerHTML = this.missionsHtml(); }
    const row = this.panel.querySelector(`.fr__missions li:nth-child(${+i + 1})`);
    this.sr(`New mission: ${MT.missionInfo(r.list[+i]).text}`);
    // Keep keyboard focus in place: the row's swap button is gone once the free swap is used, so fall back to the list.
    const lst = this.panel.querySelector(".fr__missions ul");
    if (row) { row.classList.add("is-new"); if (lst) { lst.tabIndex = -1; lst.focus({ preventScroll: true }); } }
  }

  /* ---------- Garage ---------- */
  // The design being edited: saved on every change (and synced like the gear shop).
  designNow() {
    const d = MT.cosClean(this.profile && this.profile.cos).d || { name: "", code: MT.DESIGN_DEFAULT, at: 0 };
    return { name: d.name, ...MT.designParts(d.code) };
  }

  showShop() {
    this.view = "shop";
    const p = this.profile, cos = MT.cosClean(p.cos), w = MT.wallet(p), d = this.designNow(), pend = this.pendingBuy || "";
    const confirm = (id, price, label) => `<div class="fr__confirm" role="group" aria-label="Confirm purchase">
        <span>${esc(label)} for <b>${fmt(price)}</b> gears? ${fmt(w - price)} left after.</span>
        <button class="fr__btn fr__btn--sm fr__btn--solid" type="button" data-panel="g" data-g="ok" data-id="${id}">Buy</button>
        <button class="fr__btn fr__btn--sm" type="button" data-panel="g" data-g="cancel">Cancel</button></div>`;
    const priceBtn = (id, price, name) => w < price
      ? `<button class="fr__btn fr__btn--sm is-short" type="button" aria-disabled="true" data-panel="g" data-g="short" data-id="${id}" aria-label="${esc(name)}: ${fmt(price)} gears, ${fmt(price - w)} more needed">Need ${fmt(price - w)}</button>`
      : `<button class="fr__btn fr__btn--sm" type="button" data-panel="g" data-g="ask" data-id="${id}">${fmt(price)} gears</button>`;
    const row = (it) => {
      const own = cos.owned.includes(it.id), on = cos.eq[it.kind] === it.id;
      const sw = `<span class="fr__swatch" style="background:${hex6(it.color ?? it.light)}"></span>`;
      const btn = own ? `<button class="fr__btn fr__btn--sm" type="button" data-panel="buy" data-id="${it.id}" aria-pressed="${on}">${on ? "Wearing" : "Wear"}</button>` : priceBtn(it.id, it.price, it.name);
      return `<li>${sw}<span>${esc(it.name)}</span>${btn}</li>${pend === it.id ? `<li class="fr__confirmrow">${confirm(it.id, it.price, it.name)}</li>` : ""}`;
    };
    // Options earned by Line grade show locked (with the grade that opens them) until reached.
    const lv = p.lv | 0;
    const seg = (key, opts, cur, label) => `<div class="fr__seg" role="radiogroup" aria-label="${label}">${opts.map((o, i) => {
      const u = MT.unlockFor(key, i), locked = !MT.isUnlocked(key, i, lv);
      const tip = locked ? `${o.n}: reach grade ${u[2]}` : o.n;
      return `<button type="button" role="radio" aria-checked="${i === cur}" data-panel="g" data-g="${key}" data-v="${i}"${locked ? ` aria-disabled="true" class="is-locked"` : ""}${o.sw || locked ? ` title="${esc(tip)}"` : ""}>${o.sw ? `<span class="fr__swatch" style="background:${o.sw}"></span><span class="fr__sr">${esc(tip)}</span>` : esc(o.n)}${locked ? `<small class="fr__lockg" aria-hidden="true">G${u[2]}</small>${o.sw ? "" : `<span class="fr__sr"> (reach grade ${u[2]})</span>`}` : ""}</button>`;
    }).join("")}</div>`;
    const servos = MT.servoCount(p), armed = !!this.settings.servoArm && servos > 0;
    const kinds = [["trim", "Robot trims"], ["trail", "Run trails"], ["hammer", "Hammer skins"]];
    const note = this.garageNote || "";
    this.renderPanel(`
      <div class="fr__ghead"><h2 class="fr__title">Garage</h2>${toolboxHtml(w, "is-lg")}</div>
      <p class="fr__gnote" role="status" aria-live="polite">${esc(note)}</p>
      <div class="fr__design">
        <p class="fr__label">Your robot</p>
        <label class="fr__field"><span>Name</span><input id="fr-rname" data-g="name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Unnamed" value="${esc(d.name)}"><small id="fr-rname-hint" class="fr__hint">Shown on the board and your share card.</small></label>
        <label class="fr__field"><span>Plate</span><input id="fr-plate" data-g="plate" maxlength="8" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="SS" value="${esc(d.plate)}"><small id="fr-plate-hint" class="fr__hint">Up to 8 letters, numbers or -</small></label>
        <p class="fr__glabel">Paint</p>${seg("paint", MT.PAINTS.map(([n, h]) => ({ n, sw: hex6(h) })), d.paint, "Paint")}
        <p class="fr__glabel">Finish</p>${seg("finish", MT.FINISHES.map(([n]) => ({ n })), d.finish, "Finish")}
        <p class="fr__glabel">Pattern</p>${seg("pattern", MT.PATTERNS.map((n) => ({ n })), d.pattern, "Plate pattern")}
        <p class="fr__glabel">Accent</p>${seg("accent", MT.ACCENTS.map(([n, h]) => ({ n, sw: h })), d.accent, "Plate accent")}
        <button class="fr__btn fr__btn--sm fr__showbot" type="button" data-panel="g" data-g="show">Show my robot</button>
      </div>
      <div class="fr__shop fr__servoshop"><p class="fr__label">Spare Servo</p>
        <p class="fr__muted">Reboots your robot once after a crash and clears the way. One per run, armed before you start. Not in the Daily Run.</p>
        <ul><li><span class="fr__swatch is-servo">${OVER_ICON.servo}</span><span>Held <b>${servos}</b> of ${MT.SERVO.max}</span>${servos >= MT.SERVO.max ? `<button class="fr__btn fr__btn--sm" type="button" disabled>Full</button>` : priceBtn("servo", MT.SERVO.price, "Spare Servo")}</li>
        ${pend === "servo" ? `<li class="fr__confirmrow">${confirm("servo", MT.SERVO.price, "Spare Servo")}</li>` : ""}
        <li><span></span><span>Arm for my next runs</span><button class="fr__btn fr__btn--sm" type="button" data-panel="g" data-g="arm" aria-pressed="${armed}"${servos ? "" : " disabled"}>${armed ? "Armed" : "Off"}</button></li></ul>
      </div>
      ${kinds.map(([k, n]) => `<div class="fr__shop"><p class="fr__label">${n}</p><ul>${MT.SHOP.filter((x) => x.kind === k).map(row).join("")}</ul></div>`).join("")}
      <div class="fr__actions"><button class="fr__btn" type="button" data-panel="menu">Back</button></div>`, "shop");
    this.garageNote = "";
  }

  // In the Garage a price tap only asks; the confirm row's Buy spends (commitBuy). buy(id) is the
  // direct path (wear/unwear, or a purchase with no prompt) and goes through the same atomic spend.
  askBuy(id) {
    if (!MT.SHOP.some((x) => x.id === id) && id !== "servo") return;
    this.pendingBuy = id;
    this.showShop();
    const ok = this.panel.querySelector('[data-g="ok"]');
    if (ok) ok.focus({ preventScroll: true });
  }

  buy(id) {
    const p = this.profile;
    if (!p) return;
    const it = MT.SHOP.find((x) => x.id === id);
    if (it && MT.cosClean(p.cos).owned.includes(id)) {
      const cos = MT.cosClean(p.cos);
      cos.eq[it.kind] = cos.eq[it.kind] === id ? "" : id;
      p.cos = cos; P.save(p);
      this.afterGarage(it.kind);
      return this.showShop();
    }
    if (!it && id !== "servo") return;
    this.pendingBuy = id;
    this.commitBuy(id);
  }

  commitBuy(id) {
    const p = this.profile, it = MT.SHOP.find((x) => x.id === id);
    // Only the confirm row that was asked for can spend, and only once: a double tap, a stale
    // button or a second tab's click finds nothing pending and does nothing.
    if (this.pendingBuy !== id || this.buying) return;
    this.pendingBuy = "";
    this.buying = true;
    try {
      const price = id === "servo" ? MT.SERVO.price : it ? it.price : -1;
      if (id === "servo" && MT.servoCount(p) >= MT.SERVO.max) { this.garageNote = "Your toolbox holds three spare servos."; return this.showShop(); }
      if (it && MT.cosClean(p.cos).owned.includes(id)) return this.showShop();
      const left = MT.spend(p, price, (cos) => {
        if (id === "servo") cos.sv.b += 1;
        else { cos.owned.push(id); cos.eq[it.kind] = id; }
      }, P.load, P.save);
      if (left < 0) { this.garageNote = `Not enough gears yet. You need ${fmt(price - MT.wallet(p))} more.`; return this.showShop(); }
      if (id === "servo" && !this.settings.servoArm) { this.settings.servoArm = true; P.setSetting("servoArm", true); }
      this.garageNote = `${id === "servo" ? "Spare Servo" : it.name} bought. ${fmt(left)} gears left.`;
      this.sfx("tool"); this.buzz(15);
      this.afterGarage(it ? it.kind : "");
      this.showShop();
    } finally { this.buying = false; }
  }

  afterGarage(kind) {
    const p = this.profile, cos = MT.cosClean(p.cos);
    if (kind === "trim") { this.settings.trim = cos.eq.trim || ""; P.setSetting("trim", this.settings.trim); }
    if (kind) { this.applyTrim(); this.applyCos(); }
    if (P.linked(p)) P.sync(p).then((s) => { if (s.ok && s.data && s.data.profile) P.merge(p, s.data.profile); });
  }

  garageAct(b) {
    const g = b.dataset.g;
    if (g === "ask") return this.askBuy(b.dataset.id);
    if (g === "ok") return this.commitBuy(b.dataset.id);
    if (g === "cancel") { this.pendingBuy = ""; return this.showShop(); }
    if (g === "short") { this.garageNote = `Not enough gears yet. Runs and missions fill your toolbox.`; return this.showShop(); }
    if (g === "arm") { this.settings.servoArm = !this.settings.servoArm; P.setSetting("servoArm", this.settings.servoArm); return this.showShop(); }
    if (g === "show") return this.showRobot();
    if (g in { paint: 1, finish: 1, pattern: 1, accent: 1 }) {
      const v = +b.dataset.v;
      if (!MT.isUnlocked(g, v, this.profile.lv)) {
        const n = this.panel.querySelector(".fr__gnote");
        if (n) n.textContent = `Reach grade ${MT.unlockFor(g, v)[2]} to use this. Runs and missions raise your grade.`;
        return;
      }
      const d = this.designNow(); d[g] = v;
      this.saveDesign(d);
      for (const x of b.parentNode.children) x.setAttribute("aria-checked", String(x === b));
    }
  }

  // Name and plate: tidy as typed, preview live, keep the last good value on bad input.
  garageInput(el) {
    const d = this.designNow(), isName = el.dataset.g === "name";
    const v = isName ? MT.tidyName(el.value) : MT.tidyPlate(el.value);
    if (!isName && el.value !== v) el.value = v;
    const err = isName ? MT.checkRobotName(v) : MT.checkPlate(v);
    const hint = this.panel.querySelector(isName ? "#fr-rname-hint" : "#fr-plate-hint");
    el.toggleAttribute("aria-invalid", !!err);
    if (hint) { hint.classList.toggle("is-error", !!err); hint.textContent = err || (isName ? "Shown on the board and your share card." : "Up to 8 letters, numbers or -"); }
    if (err) return;
    d[isName ? "name" : "plate"] = v;
    this.saveDesign(d);
  }

  saveDesign(d) {
    const p = this.profile, cos = MT.cosClean(p.cos);
    cos.d = { name: d.name, code: MT.designCode(d), at: Date.now() };
    p.cos = cos; P.save(p);
    this.applyDesign(cos.d.code);
    clearTimeout(this.designSync);
    if (P.linked(p)) this.designSync = setTimeout(() => P.sync(p).then((s) => { if (s.ok && s.data && s.data.profile) P.merge(p, s.data.profile); }), 1500);
  }

  // "Show my robot": a 1080x1350 card of the current frame (the Garage close-up) with name and plate.
  async showRobot() {
    const d = this.designNow(), W = 1080, H = 1350;
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#14161B"; x.fillRect(0, 0, W, H);
    // Crop the live frame around the robot: project its feet and head to find it on screen.
    const v = this.camera.position.clone(), R = this.robot.root.position;
    const at = (y) => { v.set(R.x, y, R.z).project(this.camera); return [(v.x + 1) / 2 * src.width, (1 - v.y) / 2 * src.height]; };
    const [fx, fy] = at(0), [, hy] = at(1.9), bh = Math.max(40, fy - hy), sh = bh * 1.45, sw = sh * (W / (H - 260));
    const sx = Math.max(0, Math.min(src.width - sw, fx - sw / 2)), sy = Math.max(0, Math.min(src.height - sh, hy - bh * 0.22));
    try { x.drawImage(src, sx, sy, Math.min(sw, src.width), Math.min(sh, src.height), 0, 0, W, H - 260); } catch { /* tainted or lost: card without the frame */ }
    const g = x.createLinearGradient(0, H - 520, 0, H - 260); g.addColorStop(0, "rgba(20,22,27,0)"); g.addColorStop(1, "#14161B");
    x.fillStyle = g; x.fillRect(0, H - 520, W, 260); x.fillStyle = "#14161B"; x.fillRect(0, H - 260, W, 260);
    x.fillStyle = "#F2F0EA"; x.font = `300 76px "Inter Tight", system-ui, sans-serif`; x.textBaseline = "alphabetic";
    x.fillText(d.name || this.profile.username, 72, H - 150);
    x.fillStyle = "rgba(242,240,234,.62)"; x.font = `400 30px "IBM Plex Mono", ui-monospace, monospace`;
    x.fillText(`${this.profile.username.toUpperCase()} · SERVO SPRINT · ${location.host}`, 72, H - 92);
    MT.drawPlate(x, W - 72 - 300, H - 230, 300, 150, MT.designCode(d));
    x.fillStyle = "#FFC93C"; x.fillRect(0, 0, W, 10);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    if (!blob) return;
    const link = location.origin + location.pathname, url = URL.createObjectURL(blob);
    const how = await MT.shareOrDownload({ blob, url }, `${d.name || "My robot"} on Servo Sprint`, link);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    this.garageNote = how === "shared" ? "Shared." : how === "cancelled" ? "" : "Saved your robot image.";
    if (this.view === "shop") { const n = this.panel.querySelector(".fr__gnote"); if (n) n.textContent = this.garageNote; this.garageNote = ""; }
  }

  // Milestone badges: 1,000 / 2,500 / 5,000. Each one unlocked is a light-strip trim to pick.
  badgesHtml() {
    const best = this.profile ? this.profile.best : 0, cur = this.settings.trim || "";
    const b = (id, name, at, ok) => `<button class="fr__medalbtn" type="button" data-panel="trim" data-trim="${id}" aria-pressed="${cur === id ? "true" : "false"}"${ok ? "" : " disabled"}
        title="${ok ? esc(name) : `Reach ${fmt(at)}`}"><span class="fr__medal is-${id || "base"}${ok ? "" : " is-locked"}" aria-hidden="true"></span><span>${at ? (ok ? esc(name) : fmt(at)) : "Classic"}</span></button>`;
    return `<div class="fr__medals" role="group" aria-label="Badges and robot trim">${b("", "Classic", 0, true)}${MILESTONES.map((m) => b(m.id, m.name, m.at, best >= m.at)).join("")}</div>`;
  }
}
