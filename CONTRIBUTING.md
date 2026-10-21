# Contributing

## Docs travel with the change

Every commit or PR that changes Servo Sprint's **gameplay, UI, storage, API or architecture** updates the matching
doc **in the same commit or PR**:

| You changed | Update |
| --- | --- |
| Controls, scoring, power-ups, Garage, Daily Run, missions, leaderboards, sign-in, sharing, settings, privacy (anything a player sees) | `docs/MANUAL.md` |
| Constants, formulas, caps, sim or RNG, render or audio pipeline, localStorage keys, D1 columns or migrations, endpoints, headers/CSP, deploy steps, tests, diagrams | `docs/ARCHITECTURE.md` |

A PR that changes one of these without the matching doc edit is not ready to merge. Mark anything you could not
check against the code with `<!-- VERIFY -->` and remove it once confirmed. Diagrams are Mermaid in the Markdown;
edit them as text.

## Release gates

Goldens identical (or justified in the PR), browser 17/17, reliability 9/9, garage 11/11, Worker suites green, zero
console errors on phone and desktop, payload within budget, `?v=` bumped on every release. Details:
`docs/ARCHITECTURE.md` (Testing, Deploy).
