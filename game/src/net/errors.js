// Lightweight error reporting: uncaught errors and rejections from the game's own files go to
// POST {API_BASE}/err. No PII: no names, codes, tokens or URLs with a query; only the message, the top
// stack frames (file:line, query stripped), the build id and coarse context. At most 5 reports a session,
// each distinct message once. Works offline (silently drops) and never throws.
import { API_BASE } from "../../config.js?v=20261021r9";

export const BUILD = "20261021r9";
const MAX = 5;
const seen = new Set();
let sent = 0, installed = false, ctx = () => ({});

const clean = (s) => String(s || "").replace(/https?:\/\/[^\s)]+/g, (u) => u.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/, "")).slice(0, 600);
const ours = (stack) => /\/game\/|game\.js|\/src\//.test(stack || "");

export function report(kind, err, extra = {}) {
  try {
    if (!API_BASE || sent >= MAX) return;
    const msg = clean(err && err.message ? err.message : err).slice(0, 300);
    if (!msg || seen.has(msg)) return;
    seen.add(msg); sent++;
    const src = clean((err && err.stack) || "").split("\n").slice(0, 4).join("\n");
    const body = JSON.stringify({ kind, msg, src, build: BUILD, ...ctx(), ...extra });
    const url = API_BASE.replace(/\/+$/, "") + "/err";
    // keepalive so a report survives the tab closing; no credentials, plain JSON.
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, mode: "cors" }).catch(() => {});
  } catch { /* never let reporting break the game */ }
}

// ctxFn: returns coarse, non-identifying context ({ state, q, touch }).
export function installErrorReporting(ctxFn) {
  if (ctxFn) ctx = () => { try { return ctxFn() || {}; } catch { return {}; } };
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => { if (ours(e.error && e.error.stack) || ours(e.filename)) report("error", e.error || e.message); });
  window.addEventListener("unhandledrejection", (e) => { const r = e.reason; if (r && ours(r.stack)) report("rejection", r); });
}
