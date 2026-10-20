# Factory run API

Cloudflare Worker + D1 for the portfolio game: global top 10, cross-device saves with passkeys (backup codes as a fallback), and a private unique-visitor count. Live at `https://api.auamai.dev`.

## Deploy

```sh
cd leaderboard-worker
npm install
npx wrangler d1 execute auamai-leaderboard --remote --file=./schema.sql   # every statement is CREATE ... IF NOT EXISTS
npx wrangler deploy                                                      # wrangler bundles @simplewebauthn/server
```

`npm run build` makes the same bundle with esbuild (`dist/index.js`) for an API upload.

## Passkeys

Players save their name with a passkey (Face ID, Touch ID, Android fingerprint, Windows Hello), which iCloud Keychain or Google Password Manager syncs to their other devices. RP ID `auamai.dev`, so passkeys only work on `auamai.dev` pages; elsewhere the backup code still works. A new name claimed with a passkey also gets a backup code, kept on that device for players without passkeys.

## Endpoints

| Route | Notes |
| --- | --- |
| `GET /scores` | Top 10, best run per name |
| `POST /score` | `{ username, score, durationMs, code? \| token? }`. Runs under 3 s or above 150 points/s are rejected. A claimed name needs its code or a passkey session token. |
| `POST /profile/claim` | `{ username, best?, games?, gears?, lastPlayed? }` returns a 10-character save code once. Only `SHA-256` of it is stored. |
| `POST /profile/restore` | `{ username, code }` |
| `POST /profile/sync` | `{ username, code \| token, best, games, gears, lastPlayed }`; stats only move up |
| `POST /passkey/register/options` | `{ username, code? \| token? }`. A claimed name needs its code or a session token to add a passkey. Returns `{ challengeId, options }` |
| `POST /passkey/register/verify` | `{ challengeId, response, best?, games?, gears?, lastPlayed? }` returns `{ token, profile, backupCode? }` (backupCode only for a new name) |
| `POST /passkey/login/options` | `{}`. Discoverable credentials: no name needed |
| `POST /passkey/login/verify` | `{ challengeId, response }` returns `{ token, profile }` |
| `POST /profile/backup-code` | `{ username, token }` returns a fresh backup code (the old one stops working) |
| `POST /hit` | Once per page load. Stores `SHA-256(daily salt + IP + UA)` for 30 days; the salt is replaced daily |
| `GET /stats` | Daily uniques. Requires a valid `Cf-Access-Jwt-Assertion` |

Rate limits are per IP per minute (score 10, claim 5, restore 10, sync 20, passkey 20, backup-code 5, hit 30). The key is a hash of bucket + IP + minute, and old rows are deleted on every request. CORS allows only `https://auamai.dev`, `https://www.auamai.dev` and `https://auamai.github.io`.

## Keeping /stats private

Put `/stats` behind Cloudflare Access on a private route, e.g. a custom domain `api.auamai.dev/stats*` with an Access application that allows only your email. Copy the team domain (`<team>.cloudflareaccess.com`) and the application's AUD tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.toml`. The Worker verifies the JWT itself as well, and denies everything while those are empty. Note that the `*.workers.dev` URL is not covered by Access, so the JWT check is what keeps it closed there.

No secrets live in this repo.
