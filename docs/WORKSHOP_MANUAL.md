# Servo Sprint Workshop: player manual

The Workshop is where you build the robot instead of just picking it. You choose real kinds of parts (motors,
gearboxes, batteries, sensors), shape the structural links, test the build on a bench, send it through missions, read
why it failed, fix it, and then run it on the Line.

There are no upgrade levels. Everything the robot can do (how fast it goes, how steep it climbs, how long the battery
lasts, whether it tips over) comes out of its parts and its shape, using simple versions of the formulas engineers use.

This manual covers the Workshop only. For the runner, the Garage, the boards and everything else, see the main
[player manual](MANUAL.md).

> Added in r25 (October 2026). This file changes in the same update whenever the Workshop changes.

---

## Contents

1. [Opening the Workshop](#opening-the-workshop)
2. [The screen](#the-screen)
3. [Choosing a robot](#choosing-a-robot)
4. [Builder and Engineer mode](#builder-and-engineer-mode)
5. [Swapping parts and reading the stats](#swapping-parts-and-reading-the-stats)
6. [Editing a link (CAD-lite)](#editing-a-link-cad-lite)
7. [Test bench](#test-bench)
8. [Missions and debriefs](#missions-and-debriefs)
9. [Daily challenge, mastery, streaks and blueprints](#daily-challenge-mastery-streaks-and-blueprints)
10. [Sharing and remixing a build](#sharing-and-remixing-a-build)
11. [Running your build on the Line](#running-your-build-on-the-line)
12. [Keyboard shortcuts](#keyboard-shortcuts)
13. [Phones and tablets](#phones-and-tablets)
14. [Tips](#tips)
15. [Known limitations](#known-limitations)
16. [Privacy and your data](#privacy-and-your-data)

---

## Opening the Workshop

1. Open **https://servosprint.xyz**.
2. On the title screen, press **Workshop** ("Build, test, learn").

You don't need a player name to use the Workshop. You only need one to run a build on the Line (see
[Running your build on the Line](#running-your-build-on-the-line)).

The first time you open it, short tips appear one at a time over the 3D view (edit a part, preview a part,
open the bench, try a mission, run it). Each one goes away once you do what it says, or press **Dismiss tip**.

To leave, press **‹ Line** at the top left (or Esc when nothing else is open). Your build is saved as you go.

The Garage tab that used to be called "Workshop" (name, plate, trims) is now called **Customize**. It works the same.

## The screen

On a computer:

| Area | What's there |
| --- | --- |
| Top bar | **‹ Line** (back to the title screen), the blueprint name (type to rename), the frame tabs (Rover, Pup-4, Unit 07), Undo / Redo, **Builder / Engineer**, and tool buttons: Exploded view, Stress map, Bill of materials, Blueprints, Share and remix |
| Left panel (**Build**) | One card per joint group, then wheels (Rover), battery, sensors, controller (PID) and links. At the bottom, "Start over with the stock …" resets the frame |
| Middle | The robot in 3D. Drag to turn it, scroll to zoom, click a part to edit it |
| Right panel (**Stats**) | The robot's numbers, the warnings ("Watch out"), the daily challenge and mastery |
| Dock (bottom) | **Test bench** (B), **Missions** (M), **Run on the Line** (R) |

Bench, missions, debriefs, the bill of materials, blueprints and sharing open as sheets that slide up from the bottom.
Close a sheet with its ✕ or Esc.

## Choosing a robot

Three frames, each a stock build you can strip down and rebuild:

| Frame | Key | What it is |
| --- | --- | --- |
| **Rover** | 1 | Four wheels on sprung suspension slides. Fast and stable; wheel size and drive motors matter most |
| **Pup-4** | 2 | Four legs (hips and knees). Stable stance, lots of joints to feed |
| **Unit 07** | 3 | Two legs, a torso and passive arms. The hardest to keep upright |

Switching frames keeps each frame's build for the rest of the session. Only the build on screen is autosaved when you
leave, so save any build you want to keep as a [blueprint](#daily-challenge-mastery-streaks-and-blueprints).

## Builder and Engineer mode

The switch in the top bar changes how much detail you see, not how the robot behaves.

- **Builder** shows each stat as a bar with a marker for what the missions need. Good for getting a feel for things.
- **Engineer** shows the real numbers with units and adds power to weight, average and peak current, centre of mass
  (CoM) height, settling time and the weakest link's safety factor.

## Swapping parts and reading the stats

### The parts

| Part | Choices | What it changes |
| --- | --- | --- |
| Actuator | micro, standard and high-torque servos, DC gearmotor, stepper, BLDC with driver | Stall torque, speed, current, heat, mass, cost |
| Gearbox | direct, spur, planetary, cycloidal, strain-wave, each with a few ratios | Torque × ratio × efficiency, speed ÷ ratio, backlash, mass |
| Wheels (Rover) | wheel radius | Bigger wheels go faster on the same motor and need more torque to climb |
| Battery | 4×AA NiMH, 2S / 3S / 6S LiPo, 3S Li-ion; mounted low or high | Voltage, runtime, peak current, mass, centre of mass |
| Sensors | encoder, IMU, distance sensor | Finer feedback (less wobble), active balance, auto-dodge on the Line |
| Controller | PID: Stiffness (Kp), Hold (Ki), Damping (Kd) | How fast and cleanly the balance joint settles |
| Links | length, width, depth, profile, holes, material | Mass, centre of mass, strength, stiffness, cost |

Voltage has to suit the motor. Servos run from the controller's own 6 V rail (7.4 V for high-voltage servos), so the
pack doesn't matter to them. Other motors see the battery voltage: too low and they're weak, too high and they burn
out ("magic smoke").

Some parts are locked at first. They unlock in tiers as you pass missions: after **2**, **5** and **8** passes in
total. A locked part says how many more passes it needs. Parts are never sold.

### Previewing and fitting

- **Computer:** hover over (or tab to) an option to preview it. The stats show **▲ green** for better and **▼ red**
  for worse before you commit. Click to fit it.
- **Phone or tablet:** tap to fit it. The stats show the change in green and red after you fit it.
- **Undo / Redo** at the top (Ctrl/⌘ Z, Ctrl/⌘ Shift Z or Ctrl Y) step back through every change.

### The stats

| Stat | What it means |
| --- | --- |
| Top speed | Flat-ground speed. Set by motor speed, gearing and wheel or leg size, and by the load |
| Steepest slope | The steepest grade the drive can hold without stalling |
| Jump | How high it can hop (legged frames). Small numbers are normal: see [Known limitations](#known-limitations) |
| Runtime | How long the battery lasts at the average current (80% of the label capacity is used) |
| Tip limit | How hard it can be pushed sideways, in g, before it tips. A lane change on the Line needs 0.35 g |
| Wobble | How far the balance joint swings around its target, in degrees |
| Motor load | How hard the motors work against their continuous rating. Over 100% they heat up and cut out |
| Mass, Cost | Totals, including 8% for wiring, fasteners and bearings in the mass |

**Watch out** lists what will go wrong, in plain words, for example "Tips over at 0.28 g sideways; a lane change needs
0.35 g. Add an IMU or lower the CoM." No warnings means it's worth trying a mission.

## Editing a link (CAD-lite)

Click a link on the robot, or pick it in the **Links** list. The part view opens with that link on its own.

- **What you see.** The real part with its holes, its dimensions drawn on it, and how it mates with its neighbours
  (joint type and range, for example "Hip → knee (revolute, ±120°)"). It's coloured by **stress** under a 2.5 g
  landing: dark purple is low, yellow is at the material's yield point. The colours are colour-blind safe.
- **Dimensions.** Type a size, or use the − / + steppers: length moves in 5 mm steps, width and depth in 1 mm. Sizes
  snap to 0.5 mm. The part re-extrudes as you go.
- **Profile.** Solid bar, tube or I-beam. Tubes and I-beams put material where bending loads are, so they're stiffer
  and stronger for their weight.
- **Lightening holes.** Add or remove holes. Less mass, a little less strength.
- **Material.** PLA (printed), aluminium or carbon fibre. Each has its own density, stiffness, strength and cost.
- **Numbers.** Mass, centre of mass (from the joint), inertia about the joint (kg·cm²), the load case, peak stress
  and where it peaks, tip deflection, cost each, and the **safety factor** (SF): how many times the load the link could
  take before it yields. **Under 1 it breaks; under 1.5 it's thin.**
- **Export STL** saves a binary STL of that link in millimetres, ready for a slicer.
- Go back with **‹ Robot** or Esc.

### Tools in the top bar

- **Exploded view (E)** pulls the robot apart so you can see every part and click the ones that are hard to reach.
- **Stress map (H)** colours every link on the robot by stress, the same scale as the part view. Find the weak link at
  a glance.
- **Bill of materials** lists every part with quantity, mass and cost, the joints (bearing and housing), and the
  totals. **Copy as CSV** puts the whole list on your clipboard as CSV, ready to paste into a spreadsheet.

## Test bench

Open it with **Test bench** in the dock or **B**. Four tabs:

| Tab | What it shows | What to look for |
| --- | --- | --- |
| **Torque–speed** | The joint's whole range as a line (lots of torque slowly, or speed with little torque), with a dot for each job the robot needs: cruise, ramp, stand. Dashed line: the continuous rating. Faint curve: power | A dot under the line runs; a **red** dot stalls. More gear ratio makes the line taller and shorter |
| **PID step** | The balance joint is told to move 10°. Overshoot, settling time, wobble and time at the torque limit. Stiffness, Hold and Damping sliders work live | Fast to settle, small overshoot, no hunting. Too much Hold with a gearbox that has backlash makes it hunt |
| **Tip test** | Press **Tilt the table**: it tilts until the robot tips. Shows CoM height, support half-width, tip angle and the g it tips at | Compare with the 0.35 g a lane change needs. Lower and wider holds on longer |
| **Thermal** | Winding temperature over time on the ramp, with the limit and when it gets there | If it reaches the limit, the motor derates or cuts out. Below the continuous rating it levels off |

Stock Pup-4 hunts a little on the PID step. That's on purpose: it's what the Balance goals teach you to fix.

## Missions and debriefs

Open **Missions** in the dock or with **M**. Each frame has four missions. They open in order: pass one to open the
next.

| Mission | What it asks |
| --- | --- |
| **Sprint** | 10 m on the flat against the clock |
| **Climb the ramp** | Up a slope (steepest for Rover, gentlest for Unit 07) |
| **Haul a crate** | Carry a payload up a slope (heaviest for Rover) |
| **Last a shift** | An hour of walking with a climb every five minutes, on one battery. Plays time-lapsed |

Press **Run** on a mission. It plays on a test track with a start line, a tick every metre and a finish line. Your
last build for that mission runs beside it as a translucent **ghost**, so you can see whether a change helped. Press
**Skip** (or Space) to jump to the end.

### The debrief

After every run the debrief says what happened with the numbers behind it, for example: "Hips stalled on the 10° slope:
it needed 0.97 N·m, and hot windings left only 0.83." Failures it explains include stalls, overheating, a flat
battery, tipping backwards on a slope, a snapped link, stripped gears, an over-volted motor, PID shaking, and missing
the sprint time.

When a single change would fix it, the debrief shows a **suggested fix** with its stat changes. **Apply and rerun**
fits that change and runs the mission again straight away. You can also close the debrief and fix it your own way.

The **ⓘ** buttons open short **Lab Notes** on the idea behind the problem: gearing, the speed–torque line, heat,
batteries, power to weight, centre of mass, PID and beams. Each one ends with how real robots handle it.

A good first try: on Pup-4, fit micro servos to the knees and run Sprint. The knees overheat, and the debrief suggests
a fix.

## Daily challenge, mastery, streaks and blueprints

- **Daily challenge** (Stats panel). One constraint a day, the same for everyone, on a set frame and mission, for
  example "Pup-4: Climb the ramp with every link printed in PLA" or "Rover: Haul a crate for under $260 in parts". The
  day turns over at midnight Vancouver time. Press **Take it on** to switch to that frame and open its missions; the
  challenge's mission is open even if you haven't reached it in order yet.
- **Streak.** Each day you pass the daily challenge adds one. One missed day in any seven is forgiven.
- **Mastery** has four tracks of four goals each: **Actuators I**, **Gearing I**, **Balance I** and **Structures I**.
  Goals are things like "Change a gear ratio", "Run the tip test", "Pass a mission with lightening holes" or "Export
  a link as STL". Each counts once.
- **Blueprints** (top bar). Save the current build to one of up to 12 slots on this device, load one back, or delete
  it. Your current build also autosaves on every change.
- **Start over** at the bottom of the Build panel puts the stock build of that frame back (Undo still works).

## Sharing and remixing a build

Open **Share and remix** in the top bar.

- **Share link** makes a link that opens your exact build in anyone's Workshop. **Copy** it and send it. The link
  holds only the blueprint (parts, link shapes, PID gains, name), nothing about you.
- **Remix a blueprint:** paste a link or code someone sent you and press **Load**. It replaces the build on screen (Undo brings
  yours back). Opening a share link directly does the same.

## Running your build on the Line

Press **Run on the Line** in the dock or **R**. Your build runs in the factory on a fixed Workshop course, the same
course every time, so you can compare builds fairly.

- Its **top speed** caps how fast the line goes.
- Its **jump** decides what it can clear.
- A **tippy** build without an IMU falls over on lane changes. With an IMU, lane changes slow down instead.
- The **battery** drains (the Line runs 20 times faster than real time) and the **motors** heat up with every jump.
- A **distance sensor** side-steps an obstacle for you, once every 6 seconds.

You steer as usual (see the main manual's [Controls](MANUAL.md#controls)). When the run ends, the report says why
("Shift over: battery flat", "Overheated", "Tipped over", "Crashed") with distance, time, battery left, peak heat and
auto-dodges. **Run again** or **Back to the Workshop**.

Workshop runs **don't** post a score, change your best, count toward missions or the Line grade, earn gears or record
a ghost. They're for testing the build.

You need a player name to run: if you haven't picked one, the game says so and takes you to the title screen. Type a
name there, then come back.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| 1, 2, 3 | Rover, Pup-4, Unit 07 |
| B | Test bench |
| M | Missions |
| R | Run on the Line |
| E | Exploded view on / off |
| H | Stress map on / off |
| Ctrl/⌘ Z | Undo |
| Ctrl/⌘ Shift Z, Ctrl Y | Redo |
| Space | Skip to the end of a mission run |
| Esc | Stop a mission run, close a sheet, leave the part view, then leave the Workshop (in that order) |

Mouse: drag to turn the robot, scroll to zoom, click a part to edit it, hover a part option to preview it. Shortcuts
are ignored while you're typing in a box.

## Phones and tablets

The Workshop works on phones and tablets; it's easiest on a computer.

- The **3D view** is at the top. Drag with one finger to turn the robot, pinch to zoom, tap a part to edit it.
- **Build** and **Stats** share the panel below it: switch with the two tabs.
- The **dock** stays at the bottom: Test bench, Missions and **Run it** (Run on the Line).
- The header keeps Undo / Redo, Builder / Engineer, Exploded view, Stress map and Share and remix. **Blueprints** and
  the **Bill of materials** are only on wider screens (900 px and up, or a tablet in landscape).
- Sheets (bench, missions, debrief, bill of materials, blueprints, share) slide up from the bottom; close them with ✕.
- Tap an option to fit it; the stats show the change afterwards. Undo is at the top.
- While a mission plays, the header shrinks to the back button and the name so the track has room.
- In the part view the 3D strip is short while a first-run tip is showing. Dismiss the tip to free it.

## Tips

- Read the warnings first. Each one names the fix (a lower CoM, an IMU, a different gearbox).
- A stall usually wants more gear ratio or a stronger motor. More ratio costs top speed, so check Sprint afterwards.
- Overheating is about current. A higher ratio lets a small motor do the same job with less current.
- Tipping: mount the battery **low**, widen the stance, or add an **IMU**.
- Every gram costs runtime, climb and jump. Lightening holes and tubes cut mass, but watch the safety factor.
  Aim for SF 1.5 or more.
- On the PID step, raise **Damping** to calm overshoot and lower **Hold** if the joint hunts.
- Use **Apply and rerun** to learn what one change does, then try a different fix of your own and compare against the
  ghost.

## Known limitations

- **English only.** The Workshop's own text is in English; the rest of the game stays in your language (English,
  Português (Brasil) or Español).
- **A teaching model, not a simulator.** Parts use ballpark specs of real ones, and the physics are simple formulas
  (cantilever beams, a straight-line torque-speed curve, first-order heating). Good for learning trade-offs, not for
  sizing a real robot.
- **Tiny jumps.** Stock legged builds jump a few millimetres to a few centimetres. That's realistic for small servos,
  and it's why they can't clear crates on the Line without real changes.
- **One device only.** Builds, blueprints, mastery and streaks live in this browser. They don't sync with your saved
  name, and clearing site data resets them. Use a share link to move a build to another device.
- **No Workshop boards yet.** There are no Workshop leaderboards, public blueprints or classroom features.
- **Slow devices** may stutter for a second when the Workshop first opens while the graphics warm up.
- **Run on the Line** needs a player name.
- **On phones** the Blueprints and Bill of materials buttons are hidden; use a computer or a wider screen for them.

## Privacy and your data

Everything in the Workshop stays on your device (in this browser's local storage): your builds, blueprints, mission
results, mastery, streak and ghosts. Your builds and Workshop progress are never sent to the game's servers. A share link contains only
the blueprint. See the main manual's [Privacy](MANUAL.md#privacy) section and the privacy policy at
https://servosprint.xyz/privacy.
