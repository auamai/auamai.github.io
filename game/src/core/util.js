// Formatting and the two seeded random streams.
export const fmt = (n) => Math.floor(n).toLocaleString("en-US");
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Two seeded streams per run: COURSE lays out the obstacles (the same for everyone on a seed),
// LOOT places pickups and steers robots, so what one player collects never changes the course.
// startRun() swaps the generators in RNG; COURSE() and LOOT() always read the current one.
export const RNG = { course: Math.random, loot: Math.random };
export const COURSE = () => RNG.course();
export const LOOT = () => RNG.loot();
export const pick = (a, r = COURSE) => a[(r() * a.length) | 0];
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (COURSE() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
