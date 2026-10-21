// Leaderboard and sharing: post a run, hold it offline, refresh boards, share and dare links.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261020r6d";
import * as MT from "../../meta.js?v=20261020r6d";
import { GAME_URL } from "../../config.js?v=20261020r6d";
import { WORDMARK } from "../ui/brand.js?v=20261020r6d";
import { fmt } from "../core/util.js?v=20261020r6d";

export class Net {
  // Read-only summary for the portfolio's teaser (game/README.md).
  publish() {
    const p = this.profile;
    if (!p) return;
    const db = this.settings.dailyBest, day = MT.vanDay();
    MT.writePublic({ name: p.username, best: p.best, rank: this.settings.rank || null, streak: MT.liveStreak(this.settings.streak).n, dailyBest: db && db.day === day ? db.score : 0 });
  }

  async submitRun(score, durationMs) {
    if (!P.online()) return;
    const p = this.profile;
    if (this.lastRun.post === "posting") {
      const run = this.lastRun;
      const res = await P.postScore(p, score, durationMs, { mode: this.lastRun.mode, ...(this.lastRun.mode === "daily" ? { day: this.day, seed: this.seed } : {}) });
      run.post = res.ok ? "ok" : res.status === 403 ? "claimed" : res.status === 429 ? "busy" : res.offline && navigator.onLine === false ? "offline" : "error";
      if (res.ok && res.data && res.data.rank) { run.rank = res.data.rank; this.settings.rank = res.data.rank; P.setSetting("rank", this.settings.rank); this.publish(); }
      if (res.ok && res.data && res.data.dailyRank) run.dailyRank = res.data.dailyRank;
      if (res.status === 403) { p.claimed = true; p.code = ""; p.token = ""; }
      // Not posted: keep it (the best one) for when the board can take it.
      if (!res.ok) P.hold(p, score, durationMs);
      else if (p.held && p.held.score <= score) { p.held = null; P.save(p); }
      if (run === this.lastRun) { this.updateOverStatus(); this.refreshSave(); if (run.rank || run.dailyRank) this.prepareCard(); }
      if (res.ok && p.held) await this.postHeld();
    }
    if (P.linked(p)) {
      const s = await P.sync(p);
      if (s.ok && s.data && s.data.profile) P.merge(p, s.data.profile);
    }
    this.refreshBoard();
  }

  // Post the held run (the best one the board missed). Updates the game-over card if it's that run.
  async postHeld() {
    const p = this.profile, h = p && p.held;
    if (!h) return null;
    const res = await P.postScore(p, h.score, h.durationMs);
    if (res.ok) {
      p.held = null; P.save(p);
      const run = this.lastRun;
      if (run && run.score === h.score && run.post !== "ok") { run.post = "ok"; run.rank = res.data && res.data.rank; this.updateOverStatus(); }
    } else if (res.status === 403) { p.claimed = true; P.save(p); }
    return res;
  }

  async refreshBoard() {
    if (!P.online()) { this.board = { status: "soon", rows: [] }; return; }
    const tab = this.boardTab || "all";
    if (this.board.status !== "ok" || this.board.tab !== tab) { this.board = { status: "loading", rows: [], tab }; this.paintBoard(); }
    const res = await P.topScores(tab);
    if ((this.boardTab || "all") !== tab) return;
    this.board = res.ok && res.data && Array.isArray(res.data.scores)
      ? { status: "ok", rows: res.data.scores.slice(0, 10), tab, resetAt: res.data.resetAt || null }
      : { status: "error", rows: this.board.rows || [], tab };
    this.paintBoard();
  }

  paintBoard() {
    const b = this.panel.querySelector(".fr__board");
    if (b) this.keepFocus(b, () => { b.outerHTML = this.boardHtml(); return this.panel.querySelector(".fr__board"); });
  }

  // The card for the last run, built once in the background after game over (prepareCard) so a Share tap can hand
  // it to the share sheet at once, inside the tap's user activation (iOS Safari refuses share() after a long await).
  cardFor(r) {
    const key = `${r.rank || ""}|${r.dailyRank || ""}`; // a rank that lands after the card was built rebuilds it
    if (this.cardRun === r && this.cardKey === key && this.cardJob) return this.cardJob;
    this.cardKey = key;
    if (this.lastCard && /^blob:/.test(this.lastCard.url || "")) { try { URL.revokeObjectURL(this.lastCard.url); } catch { /* ignore */ } }
    this.lastCard = null;
    this.renderer.render(this.scene, this.camera); // a fresh frame to copy (the buffer isn't kept); shareCard copies it before any await
    // Where the robot is on screen (0 top .. 1 bottom), so the card's crop keeps it in frame on tall phone canvases.
    let focusY = null;
    try {
      const v = this.robot.root.position.clone(); v.y += 1.1;
      if (this.robot.root.parent) this.robot.root.parent.localToWorld(v);
      v.project(this.camera); if (Number.isFinite(v.y)) focusY = Math.min(1, Math.max(0, (1 - v.y) / 2));
    } catch { /* keep the default crop */ }
    const link = this.shareLink(r), c = r.challenge, passed = c && r.score > c.score ? { name: c.name, by: r.score - c.score } : null;
    this.cardRun = r;
    this.cardJob = MT.shareCard({ canvas: this.canvas, score: r.score, rank: r.dailyRank || r.rank, best: r.best, daily: r.mode === "daily", day: this.day, name: this.profile.username, link, wordmark: WORDMARK, passed, focusY })
      .then((card) => { if (this.cardRun === r && this.cardKey === key) this.lastCard = card; return card; });
    return this.cardJob;
  }

  // Called from showOver: wait for the count-up to settle, then build the card while the player reads the screen.
  prepareCard() {
    const r = this.lastRun;
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => { if (this.view === "over" && this.lastRun === r && !this.closed) this.cardFor(r).catch(() => {}); }, 1200);
  }

  shareLink(r) {
    return r.mode === "daily" ? new URL("?daily=1", GAME_URL).href : MT.challengeUrl(GAME_URL, r.seed, r.score, this.profile.username);
  }

  shareText(r) {
    const c = r.challenge;
    if (c && r.score > c.score) return `I beat ${c.name ? `${c.name}'s` : "a"} ${fmt(c.score)} in Servo Sprint with ${fmt(r.score)}.`;
    if (r.mode === "daily") return `I scored ${fmt(r.score)} on today's Daily Run in Servo Sprint.`;
    return `I scored ${fmt(r.score)} in Servo Sprint.`;
  }

  async share() {
    const r = this.lastRun;
    if (!r) return;
    const card = await this.cardFor(r).catch(() => ({ blob: null, url: "" }));
    const how = await MT.shareOrDownload(card, this.shareText(r), this.shareLink(r));
    if (how === "downloaded+copied") this.toast("Card saved · link copied");
    else if (how === "downloaded") this.toast("Card saved");
  }

  async dare() {
    const r = this.lastRun;
    if (!r) return;
    const link = MT.challengeUrl(GAME_URL, r.seed, r.score, this.profile.username);
    try {
      if (navigator.share) { await navigator.share({ text: `Beat my ${fmt(r.score)} in Servo Sprint`, url: link }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    // No share sheet, or it refused: copy the link; only if that fails too, show it so it can be copied by hand.
    if (await MT.copyText(link)) this.toast("Challenge link copied");
    else this.toast(link);
  }
}
