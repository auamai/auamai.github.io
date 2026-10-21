// Meta layer in the game: missions strip, Garage (cosmetics), milestone badges.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261020r6d";
import * as MT from "../../meta.js?v=20261020r6d";
import { MILESTONES, OVER_ICON } from "../core/constants.js?v=20261020r6d";
import { fmt, esc } from "../core/util.js?v=20261020r6d";

export class Garage {
  missionsHtml() {
    const list = MT.missionsFill(this.settings.missions);
    if (!this.settings.missions) { this.settings.missions = list; P.setSetting("missions", list); }
    return `<div class="fr__missions"><p class="fr__label">Missions</p><ul>${list.map((m) => {
      const d = MT.missionInfo(m), q = Math.min(1, d.prog / d.goal);
      return `<li><span>${esc(d.text)}</span><span class="fr__mbar"><i style="transform:scaleX(${q.toFixed(3)})"></i></span><span>+${d.reward}</span></li>`;
    }).join("")}</ul></div>`;
  }

  /* ---------- gear shop ---------- */
  showShop() {
    this.view = "shop";
    const p = this.profile, cos = MT.cosClean(p.cos), w = MT.wallet(p);
    const row = (it) => {
      const own = cos.owned.includes(it.id), on = cos.eq[it.kind] === it.id;
      const sw = `<span class="fr__swatch" style="background:#${(it.color ?? it.light).toString(16).padStart(6, "0")}"></span>`;
      const btn = own ? `<button class="fr__btn fr__btn--sm" type="button" data-panel="buy" data-id="${it.id}" aria-pressed="${on}">${on ? "Wearing" : "Wear"}</button>`
        : `<button class="fr__btn fr__btn--sm" type="button" data-panel="buy" data-id="${it.id}"${w < it.price ? " disabled" : ""}>${fmt(it.price)} gears</button>`;
      return `<li>${sw}<span>${esc(it.name)}</span>${btn}</li>`;
    };
    const kinds = [["trim", "Robot trims"], ["trail", "Run trails"], ["hammer", "Hammer skins"]];
    this.renderPanel(`
      <h2 class="fr__title">Garage</h2>
      <p class="fr__sub">Trims, trails and hammer finishes. Looks only: nothing here touches the score.</p>
      <p class="fr__lede fr__wallet"><span class="fr__sicon">${OVER_ICON.gears}</span><b>${fmt(w)}</b> gears to spend</p>
      ${kinds.map(([k, n]) => `<div class="fr__shop"><p class="fr__label">${n}</p><ul>${MT.SHOP.filter((x) => x.kind === k).map(row).join("")}</ul></div>`).join("")}
      <div class="fr__actions"><button class="fr__btn" type="button" data-panel="menu">Back</button></div>`, "shop");
  }

  buy(id) {
    const p = this.profile, it = MT.SHOP.find((x) => x.id === id);
    if (!p || !it) return;
    const cos = MT.cosClean(p.cos);
    if (!cos.owned.includes(id)) {
      if (MT.wallet(p) < it.price) return;
      cos.owned.push(id); cos.spent += it.price;
      cos.eq[it.kind] = id;
      this.sfx("tool");
    } else cos.eq[it.kind] = cos.eq[it.kind] === id ? "" : id;
    p.cos = cos; P.save(p);
    if (it.kind === "trim") { this.settings.trim = cos.eq.trim || ""; P.setSetting("trim", this.settings.trim); }
    this.applyTrim(); this.applyCos();
    if (P.linked(p)) P.sync(p).then((s) => { if (s.ok && s.data && s.data.profile) P.merge(p, s.data.profile); });
    this.showShop();
  }

  // Milestone badges: 1,000 / 2,500 / 5,000. Each one unlocked is a light-strip trim to pick.
  badgesHtml() {
    const best = this.profile ? this.profile.best : 0, cur = this.settings.trim || "";
    const b = (id, name, at, ok) => `<button class="fr__medalbtn" type="button" data-panel="trim" data-trim="${id}" aria-pressed="${cur === id ? "true" : "false"}"${ok ? "" : " disabled"}
        title="${ok ? esc(name) : `Reach ${fmt(at)}`}"><span class="fr__medal is-${id || "base"}${ok ? "" : " is-locked"}" aria-hidden="true"></span><span>${at ? (ok ? esc(name) : fmt(at)) : "Classic"}</span></button>`;
    return `<div class="fr__medals" role="group" aria-label="Badges and robot trim">${b("", "Classic", 0, true)}${MILESTONES.map((m) => b(m.id, m.name, m.at, best >= m.at)).join("")}</div>`;
  }
}
