// Robot registry. Each entry is an original Uamai Labs model with a create()
// that returns { info, root, update(state, dt), dispose() }.
//
// To add a runner later: write game/robots/<id>.js exporting `info` and
// `create`, import it here and push it onto RUNNERS. The game picks the
// runner by id (see robotId in game.js) and falls back to the first entry.
import { makeEnvironment, makeMaterials, rim } from "./kit.js?v=20261021r9";
import * as H1 from "./ul-h1.js?v=20261021r9";
import * as W1 from "./ul-w1.js?v=20261021r9";

export const RUNNERS = [H1];          // humanoids the player can run as
export const ROLLERS = [W1];          // forms the wheel power-up turns them into

export const byId = (list, id) => list.find((m) => m.info.id === id) || list[0];

// One environment + material set per game, shared by every robot it builds.
export function createKit(renderer, { lite = false } = {}) {
  const env = makeEnvironment(renderer);
  const M = makeMaterials(env, lite);
  return {
    M, rim, env,
    build(list, id) { return byId(list, id).create({ M }); },
    dispose() { env.dispose(); Object.values(M).forEach((m) => m.dispose()); },
  };
}
