# Servo Sprint

A three.js robot runner (formerly Factory Run). Opens as an overlay from the portfolio (`script.js`) or on its own at
`/game/`, and is ready to be hosted standalone at `https://servosprint.xyz/` (copy this folder to a repo root and add
`CNAME`; nothing outside the folder is referenced). Everything is procedural: geometry, the robot's animation, the
music and sound. No third-party assets.

## Docs

- [Player manual](../docs/MANUAL.md): controls, scoring, gears and the Toolbox, power-ups, Daily Run, Garage,
  leaderboards, passkeys and backup codes, sharing, FAQ, privacy. Linked in game from the menu's settings row.
- [Architecture and game mechanics](../docs/ARCHITECTURE.md): system and component diagrams, module map, render
  pipeline, fixed-step sim and seeded RNG, scoring formulas and caps, anti-cheat, storage and migrations, audio graph,
  performance budgets, testing, deploy and rollback.

Every change to gameplay, UI, storage, the API or the architecture updates the matching doc in the same commit or
PR (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Standalone page: boot screen, meta (absolute `og:image` on servosprint.xyz), loads `game.js` |
| `game.js` | Entry: `openGame()`, lifecycle, dispose; mixes in the modules under `src/` |
| `src/core/` | `loop.js` (fixed 120 Hz step, quality ladder), `run.js` (run start/end, scoring events), `constants.js`, `util.js` |
| `src/sim/physics.js` | Runner physics (g = 9.81, jumps, slides, rails, ramps) |
| `src/world/worldgen.js` | Seeded course spawning (COURSE / LOOT streams), pooled obstacles |
| `src/render/render.js` | Scene, quality tiers, camera, trail; `grade.js` (brand colour grade + light rig, AgX); `arm.js` (rigid machined arm gantry, merged per material); `geometry.js` |
| `src/input/input.js` | Touch swipes, wheel pad, keyboard, gamepad |
| `src/ui/` | `hud.js`, `panels.js` (menus, game over, garage), `brand.js` (wordmark), `sound-ui.js` |
| `src/net/` | `net.js` (board, share), `errors.js` (error boundary + `/err` reporting, no PII) |
| `src/meta/garage.js`, `meta.js` | Daily Run, streaks, missions, gear shop, near-miss nudges, share card, challenge links |
| `audio.js` | WebAudio music ("Line Shift", fixed 106 BPM Afrobeat with a sax lead) and SFX, synthesised at run time |
| `ui3d.js` | 3D hints and countdown on their own transparent canvas (DPR cap 2) |
| `tools.js` | Tool pickups, held props, particle bursts (0.6x on touch) |
| `profile.js` | Local save, leaderboard API calls, passkeys (RP ID auamai.dev; servosprint.xyz and www use it through WebAuthn Related Origin Requests) |
| `factory.js`, `ceiling.js` | The hall around the line |
| `robots/` | UL-H1 runner and UL-W1 roller (procedural models and animation) |
| `glyphs.js` | Inter Tight outlines for the 3D text (SIL OFL 1.1, see `OFL-InterTight.txt`) |
| `brand/`, `fonts/` | Wordmark, icons, og image; bundled Inter Tight + IBM Plex Mono (OFL) |

Brand rules (palette, type, wordmark, buttons): `robotgame/brand/SERVO_SPRINT_BRAND.md` in the working tree.
Cache-busting: every local import carries `?v=20261021r9`; bump it on every release.

## Licences

- **Music and sound:** composed in code (`audio.js`), generated live with the Web Audio API. No samples, no recordings,
  nothing licensed in. Original work, same licence as the rest of the site.
- **Robot animation:** procedural (phase-driven run cycle with two-bone IK feet, blended poses). No motion capture,
  no Mixamo or other third-party clips.
- **Font outlines:** Inter Tight, SIL Open Font License 1.1 (`OFL-InterTight.txt`).
- **three.js:** MIT, loaded from jsDelivr.

## Scoring

| Source | Points |
| --- | --- |
| Distance | 0.5 per unit |
| Gear | 10 |
| Screw | 25 |
| Drill: machine (arm) bored through | 50 |
| Hammer: crate, stack or robot smashed | 75 |

Multipliers multiply and cap at ×6: golden torque wrench ×2 → ×5 (one step a second, ends early on any
contact), Overdrive ×2 (8 s, when the toolbox meter's five segments fill: a tool fills one, smashes half).

Caps, held by the game and checked the same way by the Worker:

- no one-second window over 1,200 points;
- total never over `allowedScore(s) = 180·s + 50 + min(8000, max(0, s − 10)·800)` for a run of `s` seconds.

A perfect bot (collects everything, never dies) averaged ~112/s with a best one-second window of 1,014, so honest
runs never touch either line. Every score the round-5 game could post (≤ 140/s) still passes.

## For the site teaser (read-only)

Read these; never write them.

### `localStorage["au_factory_public_v1"]` (written by the game after each run)

```json
{
  "v": 1,
  "name": "robot_fan",          // player name ("" if none)
  "best": 2410,                 // personal best (all modes)
  "rank": 7,                    // last all-time rank the board returned, or null
  "streak": 3,                  // live Daily Run streak (0 if broken)
  "dailyDay": "2026-10-20",     // Vancouver date this was written
  "dailyResetAt": 1792566000000,// next Daily Run reset, epoch ms (midnight America/Vancouver)
  "dailyBest": 1180,            // best Daily Run score today (0 if not played today)
  "weeklyResetAt": 1792911600000,// next weekly board reset, epoch ms (Monday 00:00 America/Vancouver)
  "updatedAt": 1792540000000
}
```

`dailyResetAt` goes stale after midnight; if `Date.now() > dailyResetAt`, treat `dailyBest` and the reset time as
yesterday's.

### Other keys the game owns

| Key | Contents |
| --- | --- |
| `au_factory_profile_v1` | `{ username, best, games, gears, lastPlayed, code?, token?, passkey, claimed, held, cos }` (`cos`: `{ spent, owned[], eq{trim,trail,hammer} }`) |
| `au_factory_settings_v1` | Settings bag: `pad`, `lefty`, `haptics`, `music`, `sfx`, `musicVol`, `sfxVol`, `tips`, `trim`, `missions[]`, `streak{n,last,freeWeek}`, `dailyBest{day,score}`, `pbStreak`, `rank` |

The save code and session token in the profile key are secrets: the teaser must not read or display them.

### API (`https://api.auamai.dev`, CORS for the site's origins)

| Call | Returns |
| --- | --- |
| `GET /scores` | `{ board: "all", scores: [{ username, score }] }` top 10, best per name |
| `GET /scores?board=daily` | today's Daily Run top 10, plus `resetAt`, `day`, `week` |
| `GET /scores?board=weekly` | this week's top 10 (all modes), plus `resetAt`, `day`, `week` |
| `POST /score` | `{ username, score, durationMs, mode?: "free"\|"daily"\|"challenge", day?, seed? }` → `{ ok, rank, dailyRank?, day? }` |

A Daily Run must carry today's Vancouver date (or the day it started, across midnight) and that day's seed
(`FNV-1a("factory-run-daily:YYYY-MM-DD")`). The private `GET /stats` (Cloudflare Access) now includes `retention`:
day-1 and day-7 return, runs per session, and Daily Run participation per day.

## Links

- Daily Run: `https://auamai.dev/game/?daily=1` (standalone: `https://servosprint.xyz/?daily=1`)
- Beat my run: `https://auamai.dev/game/?c=<seed base36>&s=<score>&n=<name>`: the same course, with the score to beat.
