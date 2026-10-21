// Player profile: saved on this device, optionally linked to the Worker with a passkey
// (Face ID / Touch ID / fingerprint, synced by iCloud Keychain or Google Password Manager)
// or, as a fallback, a backup code.
import { cosClean, gradeOf } from "./meta.js?v=20261021r91";
import { API_BASE } from "./config.js?v=20261021r91";

const KEY = "au_factory_profile_v1";
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
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
// Linked to the server by either a backup code or a passkey session.
export const linked = (p) => Boolean(p && (p.code || p.token));
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
      token: typeof p.token === "string" && TOKEN_RE.test(p.token) ? p.token : "",
      passkey: p.passkey === true,
      // This name is saved on the server and this device isn't signed in to it (learned from a 403/409).
      claimed: p.claimed === true,
      // The best run the board hasn't taken yet (offline, or the name needed a sign-in). Posted on sign-in.
      // Gear shop: gears spent, items owned, items worn (round 6). Synced with a claimed name.
      cos: cosClean(p.cos),
      // Toolbox migration stamp (r7): the wallet is gears minus spent; set once, never re-run.
      ...(p.tb === 1 ? { tb: 1 } : {}),
      // Line grade (r7.2): the last grade paid into the Toolbox, and the one-time migration stamp. Device-local
      // (not synced): grade itself comes from gears, which sync.
      ...(p.pg === 1 ? { pg: 1 } : {}),
      lv: Math.min(30, Math.max(1, int(p.lv))),
      held: p.held && int(p.held.score) > 0 && int(p.held.durationMs) >= 3000 ? { score: int(p.held.score), durationMs: int(p.held.durationMs) } : null,
    };
  } catch {
    return null;
  }
}

export function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: play on */ }
}

export function create(username) {
  const p = { username, best: 0, games: 0, gears: 0, lastPlayed: 0, code: "", token: "", passkey: false, claimed: false, held: null, cos: cosClean(null), tb: 1, lv: 1, pg: 1 };
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

// Keep the best unposted run so it can go to the board later.
export function hold(p, score, durationMs) {
  if (score <= 0 || durationMs < 3000) return;
  if (!p.held || score > p.held.score) p.held = { score, durationMs };
  save(p);
}

export function merge(p, remote) {
  // Gears another device already banked include that device's grade rewards: count those grades as paid here,
  // so two devices never pay the same grade twice.
  if (int(remote.gears) > p.gears) p.lv = Math.max(p.lv | 0, gradeOf(int(remote.gears)).n);
  p.best = Math.max(p.best, int(remote.best));
  p.games = Math.max(p.games, int(remote.games));
  p.gears = Math.max(p.gears, int(remote.gears));
  p.lastPlayed = Math.max(p.lastPlayed, int(remote.lastPlayed));
  if (remote.cos) {
    const a = cosClean(p.cos), b = cosClean(remote.cos);
    const d = a.d && b.d ? (b.d.at > a.d.at ? b.d : a.d) : a.d || b.d;
    p.cos = { spent: Math.max(a.spent, b.spent), owned: [...new Set([...a.owned, ...b.owned])], eq: { ...b.eq, ...a.eq },
      sv: { b: Math.max(a.sv.b, b.sv.b), u: Math.max(a.sv.u, b.sv.u) }, ...(d ? { d } : {}) };
  }
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

async function req(method, path, body, ms = 5000) {
  if (!API_BASE) return { ok: false, offline: true };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
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

// Challenge ghosts (Ghost Racing): the sharer's compact track, keyed by the link's seed (base 36) and score.
// v: course version of the run (1 classic, 2 zones + turns); the Worker keys ghosts by (seed, score, v).
export const postGhost = (c, s, v, b) => req("POST", "/ghost", { c, s, v, b }, 8000);
export const getGhost = (c, s, v) => req("GET", `/ghost?c=${encodeURIComponent(c)}&s=${encodeURIComponent(s)}&v=${encodeURIComponent(v || 1)}`, null, 15000);

// board: "all" (default), "daily" (today's Daily Run) or "weekly" (since Monday 00:00 Vancouver).
export const topScores = (board = "all") => req("GET", board === "all" ? "/scores" : `/scores?board=${board}`);
// run: { mode: "free" | "daily" | "challenge", day, seed } (round 6; older Workers ignore it).
// Garage (r7): robot name + design code ride along; older Workers ignore them.
export const postScore = (p, score, durationMs, run = {}) => {
  const d = cosClean(p.cos).d;
  return req("POST", "/score", { username: p.username, score, durationMs, ...run, ...(d && (d.name || d.code !== "0000") ? { robot: d.name, design: d.code } : {}), ...auth(p) });
};
export const claim = (p) =>
  req("POST", "/profile/claim", { username: p.username, best: p.best, games: p.games, gears: p.gears, lastPlayed: p.lastPlayed });
export const restore = (username, code) => req("POST", "/profile/restore", { username, code: cleanCode(code) });
export const sync = (p) =>
  req("POST", "/profile/sync", { username: p.username, ...auth(p), best: p.best, games: p.games, gears: p.gears, lastPlayed: p.lastPlayed, cos: cosClean(p.cos) });
const auth = (p) => ({ ...(p.code ? { code: p.code } : {}), ...(p.token ? { token: p.token } : {}) });

/* ---------- passkeys ---------- */
// The Worker's RP ID is auamai.dev. Pages on auamai.dev use it directly; servosprint.xyz (and www) use it through
// WebAuthn Related Origin Requests (https://auamai.dev/.well-known/webauthn lists them). Elsewhere (workers.dev
// preview, github.io, local) and on browsers without related-origin support, the backup code is the way in.
const RELATED = /^(www\.)?servosprint\.xyz$/;
let relatedOk = null; // null = not checked yet; getClientCapabilities() is async, so cache the answer
export async function checkRelatedOrigins() {
  if (!RELATED.test(location.hostname)) return (relatedOk = false);
  try {
    const caps = window.PublicKeyCredential && PublicKeyCredential.getClientCapabilities ? await PublicKeyCredential.getClientCapabilities() : null;
    // Chrome 128+ supports related origins but older builds do not list the capability; Safari 18 lists it.
    relatedOk = caps ? caps.relatedOrigins === true : /Chrome\/(\d+)/.test(navigator.userAgent) && +RegExp.$1 >= 128;
  } catch { relatedOk = false; }
  return relatedOk;
}
export function passkeysOk() {
  const host = location.hostname;
  const allowedHost = /(^|\.)auamai\.dev$/.test(host) || (RELATED.test(host) && relatedOk === true);
  return online() && allowedHost && window.isSecureContext
    && typeof window.PublicKeyCredential === "function" && !!navigator.credentials;
}

const b64u = {
  toBuf(s) {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u.buffer;
  },
  from(buf) {
    const u = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
};

function credJson(c) {
  const r = c.response, out = { id: c.id, rawId: b64u.from(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}, response: {} };
  if (c.authenticatorAttachment) out.authenticatorAttachment = c.authenticatorAttachment;
  out.response.clientDataJSON = b64u.from(r.clientDataJSON);
  if (r.attestationObject) {
    out.response.attestationObject = b64u.from(r.attestationObject);
    if (r.getTransports) out.response.transports = r.getTransports();
  } else {
    out.response.authenticatorData = b64u.from(r.authenticatorData);
    out.response.signature = b64u.from(r.signature);
    if (r.userHandle) out.response.userHandle = b64u.from(r.userHandle);
  }
  return out;
}

// A cancelled or timed-out system prompt comes back as NotAllowedError / AbortError.
const cancelled = (e) => e && (e.name === "NotAllowedError" || e.name === "AbortError");

// Save this name with a passkey. A new name is claimed and gets a backup code too.
export async function passkeyRegister(p) {
  const o = await req("POST", "/passkey/register/options", { username: p.username, ...auth(p) });
  if (!o.ok || !o.data || !o.data.options) return { ok: false, status: o.status, offline: o.offline, data: o.data };
  const opt = o.data.options;
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      ...opt,
      challenge: b64u.toBuf(opt.challenge),
      user: { ...opt.user, id: b64u.toBuf(opt.user.id) },
      excludeCredentials: (opt.excludeCredentials || []).map((c) => ({ ...c, id: b64u.toBuf(c.id) })),
    } });
  } catch (e) {
    return { ok: false, cancelled: cancelled(e), exists: e && e.name === "InvalidStateError" };
  }
  if (!cred) return { ok: false, cancelled: true };
  const v = await req("POST", "/passkey/register/verify",
    { challengeId: o.data.challengeId, response: credJson(cred), best: p.best, games: p.games, gears: p.gears, lastPlayed: p.lastPlayed }, 10000);
  if (!v.ok || !v.data || !v.data.token) return { ok: false, status: v.status, offline: v.offline, data: v.data };
  p.token = v.data.token;
  p.passkey = true;
  if (v.data.backupCode) p.code = v.data.backupCode;
  merge(p, v.data.profile || {});
  return { ok: true, backupCode: v.data.backupCode || "" };
}

// Sign in on any device the passkey has synced to. No name to type.
export async function passkeyLogin() {
  const o = await req("POST", "/passkey/login/options", {});
  if (!o.ok || !o.data || !o.data.options) return { ok: false, status: o.status, offline: o.offline };
  const opt = o.data.options;
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: {
      ...opt,
      challenge: b64u.toBuf(opt.challenge),
      allowCredentials: (opt.allowCredentials || []).map((c) => ({ ...c, id: b64u.toBuf(c.id) })),
    } });
  } catch (e) {
    return { ok: false, cancelled: cancelled(e) };
  }
  if (!cred) return { ok: false, cancelled: true };
  const v = await req("POST", "/passkey/login/verify", { challengeId: o.data.challengeId, response: credJson(cred) }, 10000);
  if (!v.ok || !v.data || !v.data.token || !v.data.profile) return { ok: false, status: v.status, offline: v.offline };
  return { ok: true, token: v.data.token, profile: v.data.profile };
}

// From a passkey-signed-in device: a fresh backup code (the old one stops working).
export const newBackupCode = (p) => req("POST", "/profile/backup-code", { username: p.username, token: p.token });
