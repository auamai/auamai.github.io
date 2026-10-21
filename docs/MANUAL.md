# Servo Sprint: player manual

**Outrun the Foreman.**

Servo Sprint is a 3D robot runner. You're a small factory robot sprinting down Line 3. You dodge crates,
robot arms and rovers, grab gears and tools, and see how far you get before the line catches you. Every run
is new, except the **Daily Run**, which is the same course for everyone that day.

It's free and there are no ads. It runs in your browser at **https://servosprint.xyz** on a phone, tablet or
computer, and you can install it like an app. There's nothing to buy with real money.

> This manual describes the current build. Whenever the game changes, this file changes in the same update.

---

## Contents

1. [Quick start](#quick-start)
2. [Controls](#controls)
3. [Scoring](#scoring)
4. [Gears, screws and the Toolbox](#gears-screws-and-the-toolbox)
5. [Power-ups](#power-ups)
6. [Obstacles](#obstacles)
7. [Daily Run and streaks](#daily-run-and-streaks)
8. [Missions](#missions)
9. [Garage: name and paint your robot](#garage-name-and-paint-your-robot)
10. [Leaderboards](#leaderboards)
11. [Your name, passkeys and backup codes](#your-name-passkeys-and-backup-codes)
12. [Sharing and challenges](#sharing-and-challenges)
13. [Settings and accessibility](#settings-and-accessibility)
14. [Install it as an app](#install-it-as-an-app)
15. [FAQ and troubleshooting](#faq-and-troubleshooting)
16. [Privacy](#privacy)

---

## Quick start

1. Open **servosprint.xyz** and pick a name (3 to 16 letters, numbers or `_`). Your name shows on the leaderboard.
2. Press **Start** (or Space, Enter, or A on a controller). A short 3, 2, 1 countdown runs, then you're off.
3. Change lanes, jump and slide to stay alive. The line speeds up the longer you last.
4. When you crash, you see your score, your best and your rank. Press **Run again**, or tap anywhere on the
   game-over screen outside the buttons.

On your first run the game starts a bit slower and shows short tips the first time you meet something new.

---

## Controls

There are three lanes. You always move forward, so you only steer, jump and slide.

### Keyboard

| Action | Keys |
| --- | --- |
| Change lane | **←** **→** or **A** **D** |
| Jump | **↑**, **W** or **Space** |
| Slide | **↓** or **S** |
| Pause / resume | **P** or **Esc** (Space also resumes) |
| Start, or run again after a crash | **Space** or **Enter** |
| Music on/off | **M** |
| Move around menus | **Tab**; leaderboard tabs use the **arrow keys**, **Home** and **End** |

Space and Enter on the menu start whatever the main button shows: a normal run, the Daily Run, or a
friend's challenge.

### Touch (phones and tablets)

| Action | Gesture |
| --- | --- |
| Change lane | Swipe left or right |
| Jump | Swipe up |
| Slide | Swipe down |
| Pause | The pause button in the corner |

Swipes fire as soon as your finger has moved far enough, so short flicks work. A swipe you start in the
last beat of the countdown still counts once the run begins.

Prefer buttons? Turn on the **Control wheel** in Settings: a round pad with four quarters (left, right,
jump, slide). **Wheel on the left** moves it for left thumbs.

### Gamepad

Any controller your browser sees as a standard gamepad works. You'll see "Controller connected".

| Action | Buttons |
| --- | --- |
| Change lane | D-pad left/right, left stick, or **LB** / **RB** |
| Jump | **A**, D-pad up, or stick up |
| Slide | **B**, D-pad down, or stick down |
| Pause / resume | **Start** |
| Start, or run again | **A** or **Start** |

The stick needs a firm push to move a lane and has to come back most of the way before it moves again, so a
resting stick can't change lanes twice.

### Forgiving inputs

- **Early jumps count.** Press jump up to 0.3 s before you land and you jump again the moment you touch down.
  The same goes for hops in Roller Mode.
- **Late jumps off a rail count.** Jump just after leaving a rail and it still works.
- The game pauses on its own if you switch tabs, lock your phone or rotate the screen.

---

## Scoring

Your score climbs all the time while you run, and faster when you pick things up or break things.

| Source | Points |
| --- | --- |
| Distance | 0.5 per unit travelled (about 0.6 per metre) |
| Gear | 10 |
| Screw | 25 |
| Drill through a robot arm | 50 |
| Hammer through a crate, stack or rover | 75 |
| Clean (a jump or slide just in time over or under something in your lane) | 5, up to 15 with flow |
| Near miss (leaving a lane just before something reaches you) | 10, up to 30 with flow |
| Weave (two near misses in opposite directions, within 1.6 s) | 15, up to 45 with flow |
| In the zone (reaching Flow ×5) | 150 |
| Bumper knock (see [Combos](#combos)) | 75 |

### Flow

The **flow meter** (a thin cyan bar under the toolbox meter) appears the first time you pull off a style move.
Near misses, weaves, clean clears, gears, screws, tools, smashes, rail grinds and drift cash-outs all charge it.
Every 20 % of charge is one level, **Flow ×1** to **Flow ×5**. Style points grow with the level (×1, ×1.5, ×2,
×2.5, ×3); flow never multiplies anything else.

- Flow never drops because you missed a gear. It only cools down after about 2 s without a move, so a new
  player loses nothing and a good run keeps it hot.
- Reaching **Flow ×5** is **In the zone**: +150, gear confetti, a chime and a buzz. It can happen again once your
  flow has cooled below ×3, or every 45 s you stay in it ("Still in the zone").
- Pickups alone (gears, screws, tools, smashes, grinds) can carry flow up to ×3; style moves take it to ×5.
- Game over shows your peak flow and how many near misses, weaves and clean clears you made.

### Multipliers

Multipliers boost everything you earn while they're active. They stack by multiplying and **never go past ×6**.

| Multiplier | How you get it | What it does |
| --- | --- | --- |
| **Golden torque wrench** | Pick up the gold wrench | Starts at **×2**, climbs one step a second to **×3**, **×4**, **×5**, for 10 s. Any contact ends it early. |
| **Overdrive** | Fill the toolbox meter | **×2** for 8 s |
| **Drift combo** (Roller Mode) | Chain lane changes while rolling | A bonus of 20 %, 40 % or 60 % on what you earned during the combo, paid out when it ends |

Golden ×5 with Overdrive would be ×10, so the cap holds it at ×6.

Each step up the golden ladder pops over your robot with a chime (and a light buzz on phones). A clean finish
pops **×1**.

### Your best, and passing it

When you pass your personal best mid-run you get a "New best" moment, and a golden wrench shows up about
2.5 s later. Your best counts across every mode.

### Score limits

There's a ceiling on how fast points can come in (no more than 1,200 in any one second, and a limit based on
how long the run lasted). A perfect run never gets near it. It's there so the leaderboard stays honest.

---

## Gears, screws and the Toolbox

- **Gears** are worth 10 points and are also your currency. Every gear you collect, plus mission rewards,
  goes into your **Toolbox**.
- **Screws** are worth 25 points. They're for score only and don't go in the Toolbox.
- The **Toolbox** shows your balance on the title screen, in the Garage and at game over. At game over you'll
  see your gears fly into it and the total tick up, with "+N this run" (mission rewards included).
- You spend Toolbox gears in the [Garage](#garage-name-and-paint-your-robot). Spending never touches your score.

Your balance is simply gears earned minus gears spent, so older saves carried over exactly.

---

## Power-ups

Tools appear in open lanes after the first 10 seconds of a run. Your **toolbox meter** has five segments:
each tool you grab fills one, and your first smash with a drill or hammer fills half a segment. Fill all
five and you get **Overdrive**.

| Power-up | Looks like | Lasts | What it does |
| --- | --- | --- | --- |
| **Wrench magnet** | Wrench | 6 s | Pulls gears and screws to you from every lane, a short way ahead |
| **Drill** | Drill | 5 s | Bore straight through robot arms (+50 each) |
| **Hammer** | Hammer | 6 s | Smash crates, stacks and rovers (+75 each). The world holds for a split second on each hit |
| **Golden torque wrench** | Gold wrench | 10 s | ×2 rising to ×5 while you stay clean (see [Multipliers](#multipliers)). The next one comes 60 to 120 s later, or 2.5 s after you pass your best |
| **Overdrive** | Full toolbox meter | 8 s | ×2 on everything, plus a **Bumper** (see [Combos](#combos)) |
| **Wheel token → Roller Mode** | Wheel | 8 s | You turn into the UL-W1 roller (see below) |
| **Spare Servo** | Bought in the Garage | One use | A second chance when you crash (see below) |

> Smashing with the hammer or drill counts as contact, so it ends a golden multiplier. Pick your moment.
> (With a [Clean break](#combos) ready, your first smash is free.)

**Incoming markers.** When a tool, golden wrench or wheel token appears far down the line, a small labelled tag
with an arrow sits over it until it's close, so you can pick your lane early.

### Combos

Some power-ups do more together. Each combo gets its own cyan-edged chip next to the tools it joins.

| Combo | Made of | What it does |
| --- | --- | --- |
| **Bumper** | Overdrive | The first crash during Overdrive knocks the obstacle away (+75) instead of ending the run. Time slows to half for a moment so you can read the next lane. Your golden multiplier holds; flow drops by half. Doesn't save you from a fall |
| **Overclock** | Overdrive + any tool | Your tool timers stop while Overdrive runs, so the tool lasts longer |
| **Gold rush** | Golden wrench + magnet | The magnet reaches almost twice as far ahead |
| **Clean break** | Golden wrench + hammer or drill | Your first smash keeps the golden multiplier and pays +25 more |

Combos follow the same rules for everyone on the same course, so the Daily Run and challenges stay fair.

### Roller Mode

Grab a wheel token (from about 14 seconds in) and your robot folds into a fast roller for 8 seconds. It moves
20 % faster and plays differently:

- **Rails:** roll onto a rail to grind along it, gears lined up on top.
- **Ramps:** hit a ramp to launch through a trail of gears. You can't be hurt in the air or for a moment after you land.
- **Drifts:** change lanes in quick succession to build a drift combo (up to three levels).
- **No slide**, just a low **hop** (swipe up, ↑ or Space). There are no robot arms while you're rolling.

You can't be hurt while the robot transforms, and you blink for a short grace period after you change back.

### Spare Servo

A Spare Servo is a one-time reboot for when a run goes wrong.

- **Price:** 450 gears from your Toolbox (about two or three good runs). You can hold up to **3**.
- **Arm it** in the Garage with "Arm for my next runs". Your first purchase arms it for you. A small cyan servo icon
  on the HUD means it's armed.
- **When you crash**, the robot reboots on the spot, the obstacles just ahead are cleared, and you get **1.5 s** of
  invulnerability (glowing cyan rings). One servo is used up right then.
- **One per run**, and **never in the Daily Run**, so the Daily stays the same test for everyone.
- Runs that used a servo still count on the all-time and weekly boards, and are marked as revive runs.
- No real money is involved. Servos are only bought with gears.

---

## Obstacles

The line throws five kinds of hazard at you. You'll never find all three lanes blocked, and pickups only
appear in lanes you can actually reach.

| Obstacle | How to get past | Notes |
| --- | --- | --- |
| **Crate** | Jump over it, or change lanes | The hammer smashes it |
| **Crate stack** | Change lanes | Two crates high: too tall to jump. The hammer smashes it |
| **Robot arm** | Slide under the laser line, or change lanes | The drill bores through it |
| **Rover** | Jump over it, or change lanes | A low mobile robot driving toward you, from about 20 s in. The hammer smashes it |
| **Gap in the line** | Jump it, or change lanes | Fall in and the run ends |

On your very first run, rows have just one obstacle. As the line speeds up, more rows block two lanes, and
crate stacks join in once you're past the opening stretch. Speed builds steadily for about the first 80 seconds, then holds at the top speed.

When you crash, the game-over headline says what got you and where in the factory: the weld cell, the laser
cutters, the parts racks, the loading dock and so on.

---

## Daily Run and streaks

The **Daily Run** is one course a day, the same for every player.

- A new course opens at **midnight Pacific time** (Vancouver). The Daily card shows today's date and the menu
  shows when the next course opens. So does the game-over screen after a Daily Run.
- Play it as many times as you like. Your best Daily score goes on the **Daily** board.
- **No Spare Servo** in the Daily Run.
- Open it straight from **https://servosprint.xyz/?daily=1**, or from the "Daily Run" shortcut on the
  installed app's icon.

### Streaks

Play the Daily Run on consecutive days to build a streak. You get **one free miss a week**: skip a single day
and the streak survives, as long as you haven't used the week's free miss already. Weeks start on Monday.

---

## Missions

You always have **three missions** on the go. Finish one and you earn gears for your Toolbox, and a new
mission takes its place. Progress carries across runs unless the mission says "in one run".

| Mission | Reward |
| --- | --- |
| Smash 10 crates or robots | 60 gears |
| Hold the golden wrench 8 s | 80 gears |
| Collect 50 screws | 50 gears |
| Grab 60 gears in one run | 60 gears |
| Pick up 5 tools | 50 gears |
| Fill the toolbox for Overdrive | 70 gears |
| Run today's Daily Run | 40 gears |
| Jump 30 times | 40 gears |
| Score 1,500 in one run | 70 gears |

---

## Garage: name and paint your robot

Open the **Garage** from the title screen. Your robot stands in a close-up and turns slowly so you can see
its back plate. Every change shows on the live robot straight away and saves on its own.

### Name and plate

| Setting | Rules |
| --- | --- |
| **Robot name** | 1 to 16 characters: letters, numbers, spaces and `- _ .`. Rude names get "Try a different name" (whole words only, so names like *Sussex* are fine). It can't be another player's saved name: the board then shows your robot without a name |
| **Plate text** | Up to 8 characters: A to Z, 0 to 9 and `-`, in capitals (for example `SS-07`) |

Your robot's name shows under your name on the leaderboard, on the title screen ("*Torque Queen* is ready")
and on your share card.

### Design

| Option | Choices |
| --- | --- |
| Paint | Off-white, Graphite, Signal yellow, Cyan |
| Finish | Gloss, Satin, Matte |
| Pattern | Plain, Hazard, Grid, Chevron |
| Accent | Yellow, Cyan |

### Trims, trails and hammer skins (bought with gears)

| Item | Kind | Price |
| --- | --- | --- |
| Cyan pinstripe | Robot trim | 200 |
| Cyan frost | Robot trim | 350 |
| Cyan arc | Run trail | 250 |
| Steel dash | Run trail | 300 |
| White sparks | Run trail | 400 |
| Graphite hammer | Hammer skin | 150 |
| Off-white hammer | Hammer skin | 300 |
| Spare Servo | Revive | 450 (hold up to 3) |

Tap a price to buy. The game asks first ("Spare Servo for 450 gears? 590 left after.") and only spends when you
press **Buy**. If you're short, the button says "Need 120" (or however many). Bought items can be worn or
taken off any time. Everything in the Garage except the Spare Servo is looks only: nothing changes your score.

### Badge trims (earned)

Reach these scores and a light-strip trim unlocks for free. The first time you pass one mid-run, it's called
out on screen.

| Score | Trim |
| --- | --- |
| 1,000 | Cyan halo |
| 2,500 | Deep cyan |
| 5,000 | Starlight |

### Show my robot

**Show my robot** makes a portrait image of your robot with its name, your name and its plate, ready to share
or save.

---

## Leaderboards

The board shows the top 10, with each name's best score. Switch between three tabs:

| Board | What counts | Resets |
| --- | --- | --- |
| **Daily** | Today's Daily Run only | Midnight Pacific |
| **Weekly** | Every run this week (normal, Daily and challenge) | Monday 00:00 Pacific |
| **All-time** | Every run, ever | Never |

Challenge runs count on the weekly and all-time boards. A challenge itself is head to head: the game shows
your friend's score and tells you when you've beaten it ("Challenge beaten"). There's no separate challenge
board.

The board shows how far you are from the next place up. If you're offline, or the board doesn't answer, your
best run is kept on your device and posted next time.

---

## Your name, passkeys and backup codes

You don't need an email or password. Your name and best score live on your device. To keep them across
devices, and to stop anyone else posting under your name, **save** your name.

### Save with a passkey (recommended)

A passkey uses your phone or computer's own unlock: Face ID, Touch ID, an Android fingerprint or Windows Hello.
Your password manager (iCloud Keychain, Google Password Manager) syncs it to your other devices, so you can sign
in there with one tap.

- Choose **Save across devices** and follow your device's prompt.
- On a new device, choose sign in and pick your passkey. You don't even need to type your name.
- Passkeys work on servosprint.xyz in browsers that support "related origins": the game asks the browser
  directly, and also accepts Chrome and Edge 128 or newer. Recent Safari (18 and later) reports support too.
  If your browser doesn't, the game won't offer a passkey and the backup code works instead.

### Backup codes

A **backup code** is 10 letters and numbers. It's shown **once**, so write it down or keep it in your password
manager, then press "I've saved it".

- A new name saved with a passkey also gets a backup code.
- **Load a backup code / Use a backup code:** enter your name and the code on any device to bring your save over.
- **Get a backup code** (when signed in with a passkey) makes a fresh one. The old code stops working.
- After **10 wrong codes in a minute** for one name, that name has to wait a minute ("Too many tries. Give it
  a minute."). It lifts on its own.

### What syncs

Best score, number of runs, gears, Toolbox spending, Garage items, your robot's design and your Spare Servos.
Two devices merge safely: scores and gears only move up, and the newest robot design wins.

---

## Sharing and challenges

After a run you can:

- **Share** a score card: your score, rank and robot (with its name and plate), plus a short "Beat N at
  servosprint.xyz" line. On iPhone and Android the share sheet opens. On a computer the card downloads and the
  link is copied for you.
- **Challenge a friend**: sends a link to the exact course you just ran, with your score to beat. If there's no
  share sheet, the link is copied.

Daily Runs and beaten challenges get their own wording and card line, and Daily cards show the date.

### Opening a challenge

A challenge link opens the same course, with a note about who you're racing and the score to beat. New players
see it right away above the name box, and the button reads **Take the challenge**. Beat the score and you'll see
"Challenge beaten". Daily links read **Start the Daily Run**.

Old links on auamai.dev/game/ forward to servosprint.xyz with the challenge intact.

---

## Settings and accessibility

Open **Settings** from the menu.

| Setting | What it does |
| --- | --- |
| Control wheel | The on-screen four-way pad (touch) |
| Wheel on the left | Moves the pad for left thumbs |
| Vibration | Short buzzes on hits and pickups (only where your device supports it) |
| Music + volume | The soundtrack, "Line Shift". **M** toggles it; hold the speaker button for volume |
| Sound effects + volume | Pickups, crashes, chimes |
| **Reduce motion** | Turns off screen shake, hit-stop, hint slow-motion, the score count-up and menu animations. It starts from your system's reduced-motion setting until you change it here |
| Player manual | Opens this manual in a new tab |

Your mute and volume choices are remembered. The music dips briefly under crashes and new bests so the
moment comes through.

### Accessibility

- **Screen readers** hear the countdown ("Starting in 3", "Go"), tips, new bests, Overdrive, golden steps, a
  Spare Servo reboot, and at the end of a run why it ended, the score and your best.
- **Keyboard:** every control is reachable with Tab and shows a clear focus ring. Focus stays put when you
  switch leaderboard tabs. Leaderboard tabs are one Tab stop: use the arrow keys, Home and End.
- **Touch:** every button, tab, switch and slider has a tap area of at least 44 px.
- **Flashing:** effects stay under three flashes per second.
- **Reduce motion:** see above.

---

## Install it as an app

Servo Sprint installs to your home screen and opens full screen.

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app** (or **Add to Home screen**).
- **Computer (Chrome / Edge):** the install icon in the address bar.

Long-press the installed icon for a **Daily Run** shortcut (Android and desktop). You still need a connection
for the leaderboard; runs played offline post when you're back.

---

## FAQ and troubleshooting

**There's no sound.** Browsers only start sound after your first tap or key press, so tap once. On iPhone the
ringer switch also mutes the game. Press **M**, or check Music and Sound effects in Settings.

**It's choppy on my phone.** The game lowers its own detail if it notices sustained slow frames. Close other
tabs and apps, and try turning off Low Power Mode.

**My score didn't post.** If you were offline or the board was busy, your best run is held on your device and
posts after your next run. Runs shorter than 3 seconds don't post.

**"That name is already saved by someone."** Someone else has saved that name. If it's yours, sign in with your
passkey or backup code. Otherwise pick another.

**"Too many tries. Give it a minute."** Ten wrong backup codes in a minute lock that name for the rest of the
minute. Wait, then try again with the right code.

**I lost my backup code.** Sign in with your passkey and choose **Get a backup code**. Without a passkey or a
code, a saved name can't be recovered.

**Why can't I use a Spare Servo in the Daily Run?** So the Daily is the same test for everyone.

**Do Spare Servo runs count on the board?** Yes, on the weekly and all-time boards, and they aren't marked
there. The limits on how many points a run can score are the same either way. Your own game-over screen says
"Spare Servo used" when you used one.

**Do I lose my gears if I clear my browser?** Your save lives in the browser. Save your name with a passkey or
backup code first and you can bring it back.

**Does my old auamai.dev/game save carry over?** Not automatically yet. Old auamai.dev/game links now open servosprint.xyz,
which keeps its own save, so you start fresh there. A one-time import of the old save is planned. If your name was
saved with a passkey or backup code, sign in with it and your synced stats come back.

**Is it in landscape too?** Yes. Rotating pauses the run so you don't lose it.

---

## Privacy

- **No email, password, ads, tracking pixels or third-party analytics.** The page is only allowed to talk to
  the game's own server.
- **On your device:** your name, scores, settings, Toolbox, Garage design, and your save code or sign-in
  token are kept in your browser's local storage.
- **On the server (if you play online):** your name, your scores with their run length, mode and date, your
  robot's name and design, and whether a run used a Spare Servo. If you save your name: a scrambled (hashed)
  copy of your backup code, your passkey's public key (never your face or fingerprint, which stay on your
  device), and your synced stats.
- **No visit tracking in the game.** The game doesn't send a page-view ping. (The separate auamai.dev portfolio
  counts unique visitors with a one-way hash of IP address and browser, mixed with a secret that changes daily and
  deleted after 30 days.)
- **Error reports:** if the game hits an error it sends the error message and build number, with no personal
  details and with web addresses trimmed of their query strings.
- **Third parties:** the 3D engine (three.js) loads from the jsDelivr CDN. Fonts, music and art are all part of
  the game itself.
