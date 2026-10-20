# Factory run API (not deployed)

Cloudflare Worker + D1 for the portfolio game: global top 10, cross-device saves, and a private unique-visitor count.

## Deploy

```sh
cd leaderboard-worker
npx wrangler d1 create auamai-leaderboard        # paste the id into wrangler.toml
npx wrangler d1 execute auamai-leaderboard --remote --file=./schema.sql
npx wrangler deploy
```

Then set `API_BASE` in `game/config.js` to the Worker URL. Until then the game keeps saves on the device and shows "Global leaderboard coming soon", and the portfolio sends no visit ping.

## Endpoints

| Route | Notes |
| --- | --- |
| `GET /scores` | Top 10, best run per name |
| `POST /score` | `{ username, score, durationMs, code? }`. Runs under 3 s or above 150 points/s are rejected. A claimed name needs its code. |
| `POST /profile/claim` | `{ username, best?, games?, gears?, lastPlayed? }` returns a 10-character save code once. Only `SHA-256` of it is stored. |
| `POST /profile/restore` | `{ username, code }` |
| `POST /profile/sync` | `{ username, code, best, games, gears, lastPlayed }`; stats only move up |
| `POST /hit` | Once per page load. Stores `SHA-256(daily salt + IP + UA)` for 30 days; the salt is replaced daily |
| `GET /stats` | Daily uniques. Requires a valid `Cf-Access-Jwt-Assertion` |

Rate limits are per IP per minute (score 10, claim 5, restore 10, sync 20, hit 30). The key is a hash of bucket + IP + minute, and old rows are deleted on every request. CORS allows only `https://auamai.github.io` and `https://auamai.dev`.

## Keeping /stats private

Put `/stats` behind Cloudflare Access on a private route, e.g. a custom domain `api.auamai.dev/stats*` with an Access application that allows only your email. Copy the team domain (`<team>.cloudflareaccess.com`) and the application's AUD tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.toml`. The Worker verifies the JWT itself as well, and denies everything while those are empty. Note that the `*.workers.dev` URL is not covered by Access, so the JWT check is what keeps it closed there.

No secrets live in this repo.
