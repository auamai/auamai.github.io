# Factory Run: QA log and pre-mortem (r6)

Status key: **Guarded + tested** · **Guarded** (code in place, no automated test yet) · **Open** (known gap, next round).

## Pre-mortem: predicted failure modes

| # | Failure mode | What would break | Guard | Status |
| --- | --- | --- | --- | --- |
| 1 | iOS Safari audio unlock | Silent game, or audio starting before a gesture | `FactoryAudio.unlock()` only from a pointerdown/keydown; `navigator.audioSession.type = "ambient"` so the ringer switch mutes it | Guarded (needs a real iPhone pass) |
| 2 | WebGL context loss | Frozen black canvas mid-run | `webglcontextlost` pauses the run and stops drawing; `webglcontextrestored` re-applies quality | Guarded |
| 3 | Low-end GPU / thermal throttling | Frame drops, input lag | Adaptive quality ladder (DPR 2.5 → 1, shadows off, lite robot shaders, flat 2D hints at the last step); hints on their own small canvas | Guarded + tested (round 5 perf) |
| 4 | Tab background / resume dt spikes | Teleporting through obstacles after a resume | Frame dt clamped to 50 ms, fixed-step accumulator capped at 100 ms (12 sub-steps max), auto-pause on hide/blur, audio suspended while hidden | Guarded + tested (`fixed_timestep`) |
| 5 | Touch + keyboard + gamepad conflicts | Double moves, a swipe starting on the wheel | Wheel stops propagation, swipes ignore wheel/panel/button targets, second finger ignored, key repeat ignored | Guarded + tested (`wheel_touch`); **gamepad not supported yet: Open** |
| 6 | Orientation change | Wrong layout, run continues blind | `orientationchange` auto-pauses and re-lays out; landscape HUD/wheel rules | Guarded |
| 7 | Safe areas / notch | HUD or wheel under the notch / home bar | All edge UI uses `env(safe-area-inset-*)` | Guarded (screenshots portrait/landscape) |
| 8 | localStorage full / blocked / private mode | Crash on save | Every read/write in try/catch; game plays on without saving | Guarded |
| 9 | Offline / Worker down | Lost scores, spinner forever | 5 s request timeout; best unposted run held and posted later; board shows a calm offline line | Guarded + tested (round 5) |
| 10 | Clock skew / time zones (Daily, streaks) | Wrong day's course, broken streaks | Day is computed in America/Vancouver on both sides; the Worker validates the date (today or the day the run started) and the seed | Guarded + tested (Worker `daily` tests); device clocks far off still roll the local streak on their own clock: Open |
| 11 | Leaderboard race / duplicate submits | Two rows per run | One post per run from `endRun`; held run cleared only when the board's copy is at least as good | Guarded |
| 12 | Cheating | Impossible scores on the board | Client caps (1,200 per second window and `allowedScore`), the Worker checks the same line, Daily Run seed + date checked server-side, claimed names need a code or passkey | Guarded + tested (`caps`, Worker 15/15) |
| 13 | Float drift over long runs | Jitter far from the origin | World scrolls toward the player, objects recycle within ±170 units; scenery wraps on a 12-unit period | Guarded |
| 14 | Memory leaks / GC hitches | Slowdown over a session | Everything pooled (obstacles, gears, tools, rails, ramps, debris, popups); one geometry per 3D string, cached; overlay renderer disposed on close | Guarded; **30-min soak not run yet: Open** |
| 15 | Seeded RNG divergence | Daily Run differs per player | Two streams: COURSE (obstacles) and LOOT (pickups, robot steering), so player actions never shift the course; fixed 120 Hz step | Guarded + tested (`daily_same_course`, `fixed_timestep`) |
| 16 | Accessibility / reduced motion | Motion sickness, unreadable UI | `prefers-reduced-motion`: no sway, no punch, no shake, no hit-stop, instant score; screen-reader live region for tips, best, overdrive | Guarded + tested (round 5 reduced-motion test) |
| 17 | i18n number formats | Mixed separators | All numbers go through one formatter (`en-US` grouping) for now | Guarded; localised formats: Open |
| 18 | Unwinnable patterns | A death you couldn't avoid | Never three lanes in a row; pickups only in open lanes; no arms in Roller Mode rows; clear lane after a rail ends; invulnerable ramp flight and landing roll | Guarded + tested (`fairness_rows`, `ramp_arc`, `rail_grind`) |
| 19 | Error reporting | Silent failures in the wild | **Not built yet** (planned: `POST /err`, message + build id, no PII) | Open |

## Test results this round

Browser suite (`r6/tests.js`, headless Chromium, touch emulation): 17/17 pass — fairness, caps, multipliers,
magnet reach, smash rules, rail grind, ramp arc (1.725 s vs 1.739 s analytic, apex 5.06 vs 5.09), drift combo,
Daily Run same course, streaks + missions, PB moment, near-miss text, teaser key, jump physics (apex 1.624 vs
1.65 units, hang 1.067 vs 1.069 s), fixed timestep (same score at 60 and 144 Hz), lane spring, wheel touch.
Round-4/5 logic suite: all pass, no console errors. Worker: 15/15 new + 31/31 round-4/5 tests on the r6 bundle.

## Release check r6d (2026-10-20, servosprint.xyz)

Golden replays unchanged: real_run 432 `acd66776`, god_180s 8353 `e970d5ce`, daily_like 3057 `ded68c93`.
Browser suite (`r6/tests.js`) 17/17; r6b suite (`r6b/tests_b.js`) 9/9 (fuzz input, dt clamp, WebGL context loss,
error boundary, gamepad, speaker button, share + challenge, garage/daily board, iOS audio guard); no console errors.
Worker (r6b bundle with related-origin passkeys): 15/15 r6 + 9/9 `/err` + 31/31 round-4/5 tests.
Passkeys: RP ID stays `auamai.dev`; servosprint.xyz and www.servosprint.xyz are listed in
`https://auamai.dev/.well-known/webauthn` (Related Origin Requests) and in the Worker's passkey origins.
The game only offers passkeys there once the browser reports related-origin support; the backup code works everywhere.

## Review rounds

- **Round 1 (screenshots):** game over read as a form. Rewrote headlines per hazard and bay, score count-up,
  "New best +N", rank line with the gap to the next place, six-stat grid with icons, missions strip, Garage.
- **Round 2:** distance wrapped at four digits ("1,785 m") → km above 1,000 m. "Gear shop" renamed Garage
  everywhere. Hammer hidden behind the body from the chase camera → held up over the shoulder.

## Not done yet (honest list)

The request to restructure the whole codebase into separate core/physics/input/world/render/audio/UI/net modules
was not done in this pass: r6 keeps `game.js` as the core and adds `tools.js`, `audio.js`, `meta.js` beside it.
Also open: gamepad input, `/err` error reporting, the 30-minute soak, Lighthouse and an initial-weight audit, a real
iPhone audio pass, and the slide's friction skid (the pose blends, but there is no skid offset yet).
