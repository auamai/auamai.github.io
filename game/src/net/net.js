// Leaderboard and sharing: post a run, hold it offline, refresh boards, share and dare links.
// Installed onto Game.prototype by game.js (methods use `this`, the Game).
import * as P from "../../profile.js?v=20261020r6b";
import * as MT from "../../meta.js?v=20261020r6b";
import { Factory } from "../../factory.js?v=20261020r6b";
import { fmt } from "../core/util.js?v=20261020r6b";

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
      if (run === this.lastRun) { this.updateOverStatus(); this.refreshSave(); }
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
    if (b) b.outerHTML = this.boardHtml();
  }

  async share() {
    const r = this.lastRun;
    if (!r) return;
    this.renderer.render(this.scene, this.camera); // a fresh frame to copy (the buffer isn't kept)
    const link = r.mode === "daily" ? "https://auamai.dev/game/?daily=1" : MT.challengeUrl("https://auamai.dev/", r.seed, r.score, this.profile.username);
    const card = await MT.shareCard({ canvas: this.canvas, score: r.score, rank: r.dailyRank || r.rank, best: r.best, daily: r.mode === "daily", name: this.profile.username, link });
    this.lastCard = card;
    const how = await MT.shareOrDownload(card, `I scored ${fmt(r.score)} in Factory Run.`, link);
    if (how === "downloaded") this.toast("Card saved");
  }

  async dare() {
    const r = this.lastRun;
    if (!r) return;
    const link = MT.challengeUrl("https://auamai.dev/", r.seed, r.score, this.profile.username);
    try {
      if (navigator.share) await navigator.share({ text: `Beat my ${fmt(r.score)} in Factory Run`, url: link });
      else { await navigator.clipboard.writeText(link); this.toast("Challenge link copied"); }
    } catch (e) { if (!e || e.name !== "AbortError") this.toast(link); }
  }
}
