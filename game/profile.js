// Player profile: saved on this device, optionally linked to the Worker with a save code.
import { API_BASE } from "./config.js";

const KEY = "au_factory_profile_v1";
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const BLOCKLIST = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "nigg", "fag", "slut", "whore",
  "rape", "nazi", "hitler", "porn", "penis", "vagina", "asshole", "bastard", "retard",
  "kike", "chink", "twat", "wank", "jizz", "dildo", "sex",
];

export function checkName(name) {
  if (!NAME_RE.test(name)) return "Use 3 to 16 letters, numbers or _";
  const base = name.toLowerCase().replace(/_/g, "");
  const leet = (s, one) => s.replace(/0/g, "o").replace(/1/g, one).replace(/3/g, "e").replace(/4/g, "a")
    .replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/9/g, "g");
  if ([base, leet(base, "i"), leet(base, "l")].some((v) => BLOCKLIST.some((w) => v.includes(w)))) return "Try a different name";
  return "";
}

export function cleanCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[\s-]/g, "");
}
export const isCode = (c) => CODE_RE.test(cleanCode(c));

const int = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!p || typeof p.username !== "string" || !NAME_RE.test(p.username)) return null;
    return {
      username: p.username,
      best: int(p.best),
      games: int(p.games),
      gears: int(p.gears),
      lastPlayed: int(p.lastPlayed),
      code: isCode(p.code) ? cleanCode(p.code) : "",
    };
  } catch {
    return null;
  }
}

export function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: play on */ }
}

export function create(username) {
  const p = { username, best: 0, games: 0, gears: 0, lastPlayed: 0, code: "" };
  save(p);
  return p;
}

export function recordRun(p, score, gears) {
  p.games += 1;
  p.gears += gears;
  p.best = Math.max(p.best, score);
  p.lastPlayed = Date.now();
  save(p);
  return p;
}

export function merge(p, remote) {
  p.best = Math.max(p.best, int(remote.best));
  p.games = Math.max(p.games, int(remote.games));
  p.gears = Math.max(p.gears, int(remote.gears));
  p.lastPlayed = Math.max(p.lastPlayed, int(remote.lastPlayed));
  save(p);
  return p;
}

// Small settings bag (e.g. on-screen buttons)
const SKEY = "au_factory_settings_v1";
export function settings() {
  try { return JSON.parse(localStorage.getItem(SKEY) || "{}") || {}; } catch { return {}; }
}
export function setSetting(k, v) {
  const s = settings(); s[k] = v;
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/* ---------- API ---------- */

export const online = () => Boolean(API_BASE);

async function req(method, path, body) {
  if (!API_BASE) return { ok: false, offline: true };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(API_BASE.replace(/\/+$/, "") + path, {
      method,
      credentials: "omit",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(t);
  }
}

export const topScores = () => req("GET", "/scores");
export const postScore = (p, score, durationMs) =>
  req("POST", "/score", { username: p.username, score, durationMs, ...(p.code ? { code: p.code } : {}) });
export const claim = (p) =>
  req("POST", "/profile/claim", { username: p.username, best: p.best, games: p.games, gears: p.gears, lastPlayed: p.lastPlayed });
export const restore = (username, code) => req("POST", "/profile/restore", { username, code: cleanCode(code) });
export const sync = (p) =>
  req("POST", "/profile/sync", { username: p.username, code: p.code, best: p.best, games: p.games, gears: p.gears, lastPlayed: p.lastPlayed });
