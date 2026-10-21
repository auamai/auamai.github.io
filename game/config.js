// Base URL of the leaderboard Worker. Empty string = offline mode: the game keeps
// local saves and shows "Global leaderboard coming soon", and the portfolio skips the visit ping.
export const API_BASE = "https://api.auamai.dev";
// Where the game itself lives (this folder), for share and challenge links: https://auamai.dev/game/ today,
// https://servosprint.xyz/ once the folder is copied to its own repo. No path is hard-coded.
export const GAME_URL = new URL("./", import.meta.url).href;
