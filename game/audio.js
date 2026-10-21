// Servo Sprint: music and sound, all synthesised with WebAudio (no files, no licences to track).
// Music: "Line Shift", an original Afrobeat/Afrobeats cue in G major at a FIXED 106 BPM with swung 16ths.
// Interlocking drums (tight kick, rimshot on 2 and 4 with ghosts, open/closed hats, shaker 16ths, congas,
// talking drum, agogo bell, son clave), a round syncopated bass that follows the chords, a Rhodes skank
// and muted-guitar ostinato, and a modelled alto sax on the hook (harmonic-rich wave, formants, breath
// noise, pitch scoops, delayed vibrato, legato phrases) answered by the keys; horn-section stabs on B.
// 32-bar song: A (hook), B (lift + horns), A2 (hook + countermelody), breakdown, build.
// The run grows by adding percussion layers, horn stabs and opening the filter, never by tempo.
// Overdrive swaps in a chorus layer set (horn harmony on the hook, full percussion) on the next beat/bar.
// Machines beside the line add their own sounds, panned, on the grid. SFX are material-voiced.
// Works on an OfflineAudioContext too (render(), used to make the demo clip).
//
// Timing model (why it can't drift or go "haywire"): every note time is computed from an integer step
// counter, t = origin + k * S16 (+ a fixed swing on odd 16ths), never by adding float step lengths.
// The tempo never changes. The count-in does not speed the groove up: its ticks are one-shots and the
// grid re-phases ONCE so GO is the downbeat; every voice queued past that point is cancelled first, so
// nothing doubles. If the main thread stalls (a long frame at high speed), steps whose time already
// passed are skipped instead of all firing at once. Music voices are capped and pruned every tick.

const BPM = 106;
const SPB = 60 / BPM;            // seconds per beat (0.566)
const S16 = SPB / 4;             // one 16th (0.1415)
const SWING = 0.022;             // odd 16ths land 22 ms late: ~58% swing, the Afrobeats lilt
const LOOK = 0.12;               // scheduler lookahead (s); the timer runs every 25 ms
const MAX_VOICES = 56;           // music polyphony cap (a "voice" is one note or phrase with all its nodes)
const MUSIC_GAIN = 0.8;           // music bus trim at the default slider (tuned for -16 LUFS in a run)
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const N = (s) => { const m = /^([A-G])(#|b)?(\d)$/.exec(s); return 12 * (+m[3] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0); };

// Chords: bass root (MIDI 36-47), a rootless Rhodes voicing, and a guide-tone pair for the countermelody.
const CH = {
  G: { r: 43, k: [59, 62, 66, 69], c: [59, 66] },    // Gmaj7(9): B D F# A
  Em: { r: 40, k: [59, 62, 64, 67], c: [55, 62] },   // Em7: B D E G
  C: { r: 36, k: [59, 64, 67, 71], c: [59, 64] },    // Cmaj7: B E G B
  D: { r: 38, k: [57, 62, 66, 69], c: [57, 66] },    // D: A D F# A
  D7: { r: 38, k: [57, 60, 66, 69], c: [60, 66] },   // D7: A C F# A
  Am: { r: 45, k: [55, 60, 64, 67], c: [60, 67] },   // Am7: G C E G
  Bm: { r: 47, k: [57, 62, 66, 69], c: [62, 69] },   // Bm7: A D F# A
};
// The song, one entry per bar: [section, chord]. A = hook, B = lift, A2 = hook + counter, D = breakdown, U = build.
const SONG = [];
const sec = (s, chords) => chords.forEach((c) => SONG.push([s, c]));
sec("A", ["G", "Em", "C", "D", "G", "Em", "C", "D"]);
sec("B", ["Am", "Bm", "C", "D", "Am", "Bm", "C", "D7"]);
sec("A2", ["G", "Em", "C", "D", "G", "Em", "C", "D"]);
sec("D", ["Em", "C", "Em", "C"]);
sec("U", ["Am", "D", "Am", "D"]);
const CHORUS = 16;               // bar where A2 starts: Overdrive jumps here if it lands in B/D/U
// Melodies, per bar: "step:note:len" (len in 16ths). Written once, parsed to [step, midi, len].
const P = (bars) => bars.map((b) => (b ? b.split(" ").map((x) => { const [s, n, l] = x.split(":"); return [+s, N(n), +l]; }) : []));
const HOOK = P([
  "2:D5:2 4:B4:2 6:D5:3 9:E5:1 10:D5:2 12:B4:2 14:A4:2",
  "0:G4:3 3:A4:1 4:B4:4",
  "2:E5:2 4:D5:2 6:E5:3 9:G5:1 10:E5:2 12:D5:2 14:B4:2",
  "0:A4:3 3:B4:1 4:A4:2 6:G4:2 8:A4:4",
  "2:D5:2 4:B4:2 6:D5:3 9:E5:1 10:D5:2 12:B4:2 14:A4:2",
  "0:G4:2 2:B4:2 4:D5:2 6:E5:2 8:G5:4 12:E5:2 14:D5:2",
  "0:E5:6 6:D5:2 8:B4:4 12:A4:4",
  "0:A4:2 2:B4:2 4:D5:6 10:B4:2 12:A4:2 14:G4:2",
]);
// The keys answer the sax in the gaps (call and response).
const KEYS_ANS = P(["", "10:E5:2 12:D5:1 13:B4:3", "", "12:F#5:1 13:E5:1 14:D5:2", "", "", "", ""]);
const LIFT = P([
  "0:E5:4 4:D5:2 6:C5:2 8:A4:6 14:B4:2",
  "0:D5:4 4:F#5:2 6:E5:2 8:D5:6",
  "0:E5:2 2:G5:4 6:E5:2 8:D5:4 12:C5:2 14:B4:2",
  "0:A4:8",
  "0:G5:4 4:E5:2 6:D5:2 8:C5:4 12:E5:4",
  "0:F#5:4 4:D5:2 6:B4:2 8:D5:6",
  "0:E5:3 3:G5:1 4:E5:2 6:D5:2 8:E5:4 12:G5:4",
  "0:F#5:4 4:E5:2 6:D5:2 8:C5:2 10:B4:2 12:A4:4",
]);
const MOTIF = P(["2:D5:2 4:B4:2 6:D5:3 9:E5:1 10:D5:6", "", "2:D5:2 4:B4:2 6:G4:3 9:A4:1 10:B4:6", ""]);
// Group a section's melody into legato phrases (contiguous notes), breaking at every 2-bar boundary for breath.
function phrases(mel) {
  const flat = []; mel.forEach((bar, i) => bar.forEach(([s, m, l]) => flat.push([i * 16 + s, m, l])));
  const out = []; let cur = null;
  for (const n of flat) {
    if (cur && n[0] === cur.end && n[0] % 32 !== 0) { cur.notes.push(n); cur.end = n[0] + n[2]; }
    else { cur = { start: n[0], end: n[0] + n[2], notes: [n] }; out.push(cur); }
  }
  return out;
}
const PH = { A: phrases(HOOK), A2: phrases(HOOK), B: phrases(LIFT), D: phrases(MOTIF) };
const KPH = phrases(KEYS_ANS);
// Diatonic third below in G major (horn harmony under the hook in Overdrive).
const SCALE = [0, 2, 4, 5, 7, 9, 11].map((x) => (x + 7) % 12).sort((a, b) => a - b);
const third = (m) => { for (let d = 3; d <= 4; d++) if (SCALE.includes((((m - d) % 12) + 12) % 12)) return m - d; return m - 3; };
// Drums, per 16 steps: [step, velocity].
const KICK = [[0, 1], [6, 0.62], [8, 0.9], [11, 0.55]];
const HAT = [0.42, 0.18, 0.3, 0.2, 0.4, 0.18, 0.3, 0.22, 0.42, 0.18, 0.3, 0.2, 0.4, 0.18, 0.32, 0.24];
const CONGA = [[3, "h", 0.7], [6, "l", 0.6], [7, "s", 0.5], [11, "h", 0.75], [13, "h", 0.45], [14, "l", 0.65], [15, "s", 0.45]];
const BELL = [[0, 1], [3, 0], [6, 1], [8, 0], [10, 1], [13, 0]];         // 1 = high agogo, 0 = low
const CLAVE = [[0, 6, 12], [4, 8]];                                      // son clave 3-2 over two bars
const BASSPAT = [[0, 0, 3], [3, 0, 2], [6, 7, 2], [10, 0, 2], [12, 12, 1], [13, 7, 2], [15, "n", 1]];
const BASS_OD = [[0, 0, 2], [2, 12, 1], [3, 0, 2], [6, 7, 1], [7, 12, 1], [8, 0, 2], [10, 0, 1], [11, 12, 1], [12, 7, 2], [14, 12, 1], [15, "n", 1]];
const KEYS = [[2, 1, 2], [6, 0.7, 1], [10, 1, 2], [13, 0.65, 1]];
const GUIT = [[0, 0], [3, 1], [5, 2], [7, 1], [8, 0], [10, 2], [11, 1], [14, 2]];

export class FactoryAudio {
  constructor(settings, ctx = null) {
    this.s = settings;           // { music, sfx, musicVol, sfxVol } (booleans + 0..1)
    this.ctx = ctx;
    this.offline = !!ctx;
    this.level = "menu";         // menu | run | pause | over
    this.prevLevel = "menu";
    this.energy = false;
    this.amb = {};
    this.started = false;
  }

  // Must run inside a tap or key handler the first time (autoplay rules).
  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return false;
      // Let the ringer switch silence us on iPhone where the browser supports it.
      try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch { /* ignore */ }
      this.ctx = new C({ latencyHint: "interactive" });
      // iOS parks the context in "interrupted" after a call, Siri or a lock; come back on our own when we can.
      this.ctx.addEventListener?.("statechange", () => { if (this.ctx && this.ctx.state === "interrupted" && !document.hidden) this.ctx.resume().catch(() => {}); });
    }
    if (!this.offline && (this.ctx.state === "suspended" || this.ctx.state === "interrupted")) this.ctx.resume().catch(() => {});
    if (!this.started) this.build();
    return true;
  }

  build() {
    const A = this.ctx;
    this.started = true;
    // Master: never harsh. A gentle high shelf (-4 dB from 6 kHz) and a broad dip where the ear is most
    // sensitive (-3 dB at 3.2 kHz), a soft-knee compressor, then a tanh soft limiter so nothing ever clips.
    const comp = A.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.006; comp.release.value = 0.22;
    const shelf = A.createBiquadFilter(); shelf.type = "highshelf"; shelf.frequency.value = 6000; shelf.gain.value = -4;
    const dip = A.createBiquadFilter(); dip.type = "peaking"; dip.frequency.value = 3200; dip.Q.value = 0.8; dip.gain.value = -3;
    const lim = A.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = 0.86 * Math.tanh(1.6 * x) / Math.tanh(1.6); }   // ceiling 0.86 = -1.3 dBFS, true peak stays under -1 dBTP
    lim.curve = curve; lim.oversample = "2x";
    this.master = A.createGain(); this.master.gain.value = 0.8;
    // The mute fader: every sound passes through it, so mute is instant and click-free (a 60 ms fade).
    this.fader = A.createGain(); this.fader.gain.value = 1;
    this.master.connect(shelf).connect(dip).connect(comp).connect(lim).connect(this.fader).connect(A.destination);
    this.musicOut = A.createGain();
    this.filter = A.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 2000; this.filter.Q.value = 0.5;
    this.musicOut.connect(this.filter).connect(this.master);
    this.sfxOut = A.createGain(); this.sfxOut.connect(this.master);
    this.ambOut = A.createGain(); this.ambOut.gain.value = 0.4; this.ambOut.connect(this.filter);
    // `bus` follows the game state (pause/over duck, kick included); `duck` and `bassDuck` only pump
    // gently off the kick. Kept apart so a queued kick can never undo the pause duck.
    this.bus = A.createGain(); this.bus.connect(this.musicOut);
    const lowcut = A.createBiquadFilter(); lowcut.type = "highpass"; lowcut.frequency.value = 70; lowcut.Q.value = 0.6;
    this.duck = A.createGain(); this.duck.connect(lowcut).connect(this.bus);
    const bcut = A.createBiquadFilter(); bcut.type = "highpass"; bcut.frequency.value = 34; bcut.Q.value = 0.6;
    this.bassDuck = A.createGain(); this.bassDuck.connect(bcut).connect(this.bus);
    this.drums = A.createGain(); this.drums.connect(this.bus);           // drums skip the low cut (kick lives there)
    // Sax bus: two broad body formants and a soft top, the "horn" colour on every sax and horn voice.
    this.saxBus = A.createGain();
    const f1 = A.createBiquadFilter(); f1.type = "peaking"; f1.frequency.value = 620; f1.Q.value = 1.1; f1.gain.value = 4;
    const f2 = A.createBiquadFilter(); f2.type = "peaking"; f2.frequency.value = 1450; f2.Q.value = 1.3; f2.gain.value = 3;
    const f3 = A.createBiquadFilter(); f3.type = "lowpass"; f3.frequency.value = 3000; f3.Q.value = 0.5;
    this.saxBus.connect(f1).connect(f2).connect(f3).connect(this.duck);
    // Room: a short generated plate (0.9 s) gives the sax, rim and keys a real space.
    this.room = A.createConvolver();
    const len = Math.floor(A.sampleRate * 0.9), ir = A.createBuffer(2, len, A.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { lp += 0.35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / len, 2.6) * (i < 60 ? i / 60 : 1); } }
    this.room.buffer = ir;
    this.verb = A.createGain(); this.verb.gain.value = 0.28;
    const vlp = A.createBiquadFilter(); vlp.type = "lowpass"; vlp.frequency.value = 4200;
    const vhp = A.createBiquadFilter(); vhp.type = "highpass"; vhp.frequency.value = 220;
    this.verb.connect(vhp).connect(this.room).connect(vlp).connect(this.duck);
    // Echo for the sax: a dotted eighth at the fixed tempo, quiet, so it always lands on the grid.
    this.delay = A.createDelay(1); this.delay.delayTime.value = SPB * 0.75;
    this.send = A.createGain(); this.send.gain.value = 0.12;
    const fb = A.createGain(); fb.gain.value = 0.2;
    const dl = A.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 2200;
    this.send.connect(this.delay); this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.duck);
    // Noise buffer, shared.
    const n = A.sampleRate;
    this.noise = A.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // Harmonic tables (PeriodicWave, no square waves): alto sax (strong 2nd-5th, odd/even both present),
    // brass (a little brighter), Rhodes tine and a muted electric guitar.
    const wave = (h) => A.createPeriodicWave(new Float32Array(h.length + 1), Float32Array.from([0, ...h]));
    this.wSax = wave([1, 0.82, 0.62, 0.5, 0.36, 0.27, 0.19, 0.13, 0.09, 0.06, 0.04, 0.025]);
    this.wBrass = wave([1, 0.7, 0.55, 0.45, 0.34, 0.26, 0.2, 0.14, 0.1, 0.07]);
    this.wGtr = wave([1, 0.45, 0.32, 0.18, 0.14, 0.08, 0.05]);
    // Motor hum bed: two detuned saws tuned to G, low-passed, always on (gain follows the level).
    this.hum = A.createGain(); this.hum.gain.value = 0;
    const hf = A.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 140;
    for (const [f, dt] of [[98, -4], [196, 3]]) {
      const o = A.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = dt;
      o.connect(hf); o.start();
    }
    const lfo = A.createOscillator(), lg = A.createGain();
    lfo.frequency.value = 0.23; lg.gain.value = 40; lfo.connect(lg).connect(hf.frequency); lfo.start();
    hf.connect(this.hum).connect(this.duck);
    // Laser whine near the laser cells: a quiet continuous voice, gain and pan from the game.
    this.whine = A.createGain(); this.whine.gain.value = 0;
    this.whinePan = A.createStereoPanner ? A.createStereoPanner() : null;
    const wo = A.createOscillator(); wo.type = "sine"; wo.frequency.value = 880;
    const wl = A.createOscillator(), wlg = A.createGain(); wl.frequency.value = 6; wlg.gain.value = 18; wl.connect(wlg).connect(wo.frequency); wl.start();
    wo.connect(this.whine); wo.start();
    if (this.whinePan) this.whine.connect(this.whinePan).connect(this.ambOut); else this.whine.connect(this.ambOut);

    // Clock state. Step k plays at origin + k*S16 (+ swing). `bar0` = song bar at k = 0.
    this.voices = [];            // live music voices: { t0, t1, src: [], g, pri }
    this.origin = A.currentTime + 0.08;
    this.k = 0;
    this.bar0 = 0;
    this.runSteps = 0;           // 16ths played in "run" this run: drives the intensity tiers
    this.eOn = false;            // Overdrive as latched on a beat
    this.lastRiser = -9;
    this.sfxLast = {}; this.sfxLive = [];
    this.stats = { late: 0, capped: 0, maxVoices: 0 };
    this.applyVolumes();
    this.mood(this.level, true);
    if (!this.offline) this.timer = setInterval(() => this.schedule(this.ctx.currentTime + LOOK), 25);
  }

  applyVolumes() {
    if (!this.started) return;
    const t = this.ctx.currentTime, s = this.s;
    const mv = s.music === false ? 0 : (s.musicVol ?? 0.7);
    const fv = s.sfx === false ? 0 : (s.sfxVol ?? 0.8);
    // ~60 ms fades (time constant 0.02 s): fast enough to feel instant, slow enough not to click.
    for (const [g, v] of [[this.musicOut.gain, mv * MUSIC_GAIN], [this.sfxOut.gain, fv]]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(v, t, 0.02); }
  }
  // +-pct random variation, so repeated sounds never fatigue.
  vary(x, pct = 0.07) { return x * (1 + (Math.random() * 2 - 1) * pct); }

  // Layers and the low-pass: menu soft, run full, pause and game over ducked (and the drums drop out).
  mood(level, now = false) {
    if (level !== this.level) this.prevLevel = this.level;
    this.level = level;
    if (!this.started) return;
    const t = this.ctx.currentTime, k = now ? 0.01 : 0.25;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setTargetAtTime(this.moodFreq(), t, k);
    this.hum.gain.setTargetAtTime(level === "run" ? 0.025 : level === "menu" ? 0.02 : 0.015, t, 0.4);
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(level === "pause" || level === "over" ? 0.5 : 1, t, 0.2);
  }
  // Filter target for the current state; in a run it opens with the intensity tier and fully in Overdrive.
  moodFreq() {
    const L = this.level;
    if (L === "run") return this.energy ? 18000 : [9000, 12500, 16000][this.tier ? this.tier() : 0];
    return L === "menu" ? 2600 : 650;
  }
  // Intensity from time in the run (the game speeds up over time): 0-24 s, 24-60 s, 60 s on.
  tier() { const s = (this.runSteps || 0) * S16; return s < 24 ? 0 : s < 60 ? 1 : 2; }

  setEnergy(on) {
    if (on === this.energy) return;
    this.energy = on;
    if (!this.started) return;
    // A shaker swell into Overdrive, ending on the next downbeat; not re-fired if Overdrive flickers.
    if (on && this.level === "run" && this.ctx.currentTime - this.lastRiser > 3) {
      const tb = this.nextBeat(this.ctx.currentTime + SPB * 0.75);
      this.riser(tb - SPB * 0.75, SPB * 0.75); this.lastRiser = this.ctx.currentTime;
    }
    this.mood(this.level);
  }

  // New best: a quick filter sweep up and back.
  sweep() {
    if (!this.started) return;
    const t = this.ctx.currentTime, f = this.filter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(400, t);
    f.exponentialRampToValueAtTime(16000, t + 0.45);
    f.setTargetAtTime(this.moodFreq(), t + 0.5, 0.3);
  }

  // Countdown: woodblock ticks on the game's own count beat (one-shots; the groove's tempo is untouched),
  // a talking-drum pickup into GO, and the grid re-phases once so GO is bar 1, beat 1 at 106 BPM.
  // A new run starts the song at the hook; a resume carries on from the bar after the one we paused in.
  countIn(n, beat) {
    if (!this.started) return;
    const A = this.ctx, t0 = A.currentTime + 0.03, go = t0 + (n - 1) * beat;
    const resume = this.prevLevel === "pause";
    const bar = this.songBar(this.k);
    this.cut(t0);
    this.origin = go; this.k = 0;
    this.bar0 = resume ? (bar + 1) % SONG.length : 0;
    if (!resume) { this.runSteps = 0; this.lastRiser = -9; }
    this.eOn = this.energy && this.level === "run";
    for (let i = 0; i < n - 1; i++) this.tick(t0 + i * beat);
    if (n > 1) {
      this.keys(t0, CH.G.k, go - t0 + 0.1, 0.05, 0.12);
      this.talk(go - beat * 0.5, 0.5, -3, beat * 0.45);
      this.talk(go - beat * 0.25, 0.45, 2, beat * 0.3);
    }
  }

  // Cancel every queued music voice that starts at or after t, and fade the ones still sounding.
  cut(t) {
    for (const v of this.voices) {
      if (v.t0 >= t - 1e-4) { for (const s of v.src) { try { s.stop(t); } catch { /* already stopped */ } } v.t1 = t; }
      else if (v.t1 > t + 0.03 && v.g && v.g.gain.cancelAndHoldAtTime) {
        v.g.gain.cancelAndHoldAtTime(t); v.g.gain.setTargetAtTime(0.0001, t, 0.04);
        for (const s of v.src) { try { s.stop(t + 0.3); } catch { /* ignore */ } } v.t1 = t + 0.3;
      }
    }
    for (const g of [this.duck.gain, this.bassDuck.gain]) {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
      g.setTargetAtTime(1, t, 0.03);
    }
  }

  /* ---------- clock ---------- */
  tk(k) { return this.origin + k * S16 + (k % 2 ? SWING : 0); }
  nextBeat(t) { const k = Math.ceil((t - this.origin) / SPB) * 4; return this.tk(Math.max(k, this.k)); }
  songBar(k) { return (((this.bar0 + Math.floor(k / 16)) % SONG.length) + SONG.length) % SONG.length; }

  schedule(until) {
    const now = this.ctx.currentTime;
    // Far behind (a stalled timer): jump the counter instead of looping over every missed step.
    if (this.tk(this.k) < now - 0.5) { const j = Math.ceil((now - this.origin) / S16); this.stats.late += j - this.k; this.k = j; }
    this.voices = this.voices.filter((v) => v.t1 > now);
    while (this.tk(this.k) < until) {
      const t = this.tk(this.k);
      if (t < now + 0.002) this.stats.late++;        // its moment passed during a stall: skip, never bunch
      else if (this.s.music !== false) this.play(this.k, t);   // music off: keep the clock, build no voices
      if (this.level === "run") this.runSteps++;
      this.k++;
    }
  }

  // Register a voice: for the polyphony cap and for cut(). `pri`: 3 = must play ... 0 = first to drop.
  track(src, g, t0, t1, pri) {
    this.voices.push({ src, g, t0, t1, pri });
    if (this.voices.length > this.stats.maxVoices) this.stats.maxVoices = this.voices.length;
    for (const s of src) { const prev = s.onended; s.onended = (ev) => { if (prev) prev(ev); try { s.disconnect(); } catch { /* ignore */ } if (g) try { g.disconnect(); } catch { /* ignore */ } }; }
  }
  roomFor(pri) {
    if (this.voices.length < MAX_VOICES - (3 - pri) * 5) return true;
    this.stats.capped++; return false;
  }

  play(k, t) {
    const L = this.level, run = L === "run", calm = L === "pause" || L === "over", menu = L === "menu";
    const b = k % 16, beat = b % 4 === 0;
    // Overdrive latches on a beat, so drums swap cleanly; melodic layers swap on the bar.
    if (beat) this.eOn = this.energy && run;
    if (b === 0 && this.eOn) {
      const s = SONG[this.songBar(k)][0];
      if (s !== "A" && s !== "A2") this.bar0 = (((CHORUS - Math.floor(k / 16)) % SONG.length) + SONG.length) % SONG.length;
    }
    const bar = this.songBar(k), [sc, cn] = SONG[bar], ch = CH[cn], e = this.eOn;
    const nextCh = CH[SONG[(bar + 1) % SONG.length][1]];
    const tier = run ? (e ? 3 : this.tier()) : 0;
    const brk = run && !e && sc === "D";
    const fill = run && (bar % 8 === 7 || bar === 31) && b >= 8 && sc !== "D";
    const secBar = sc === "D" || sc === "U" ? (bar - (sc === "D" ? 24 : 28)) : bar % 8;
    const hv = () => 0.88 + Math.random() * 0.24;

    /* ---- drums ---- */
    if (run) {
      if (!brk) {
        for (const [s, v] of KICK) if (s === b && !(fill && s === 11)) this.kick(t, v * hv());
        if (e && b === 14) this.kick(t, 0.45);
        if (sc === "U" && secBar < 3 && b !== 0) { /* the build keeps only the downbeat kick ... */ }
      } else if (b === 0 && secBar === 3) this.kick(t, 0.7);
      if (!brk && (b === 4 || b === 12)) this.rim(t, (e ? 1.05 : 1) * hv(), e && b === 12);
      if (!brk && tier >= 1 && (b === 7 || b === 10 || b === 15) && !fill) this.rim(t, 0.16 * hv(), false, true);
      if (fill) { if (b === 10 || b === 13 || b === 14 || b === 15) this.rim(t, 0.35 + (b - 10) * 0.08, false, false); if (b >= 12) this.talk(t, 0.6, b === 15 ? 3 : -2, S16 * 0.9); }
      this.hat(t, HAT[b] * (brk ? 0.6 : 1) * hv(), false);
      if (!brk && tier >= 1 && (b === 2 || b === 10)) this.hat(t, 0.32 * hv(), true);
      this.shaker(t, (b % 2 ? 0.55 : 0.3) * (tier >= 1 ? 1 : 0.7) * hv());
      if (tier >= 1 || brk) for (const [s, typ, v] of CONGA) if (s === b) this.conga(t, typ, v * hv() * (brk ? 1.15 : 1), typ === "l" ? -0.25 : 0.25);
      if (e) for (const [s, typ, v] of CONGA) if ((s + 8) % 16 === b && typ === "h") this.conga(t, "h", 0.4 * hv(), -0.35);
      if (tier >= 2 || e) for (const [s, hi] of BELL) if (s === b) this.bell(t, hi, (hi ? 0.5 : 0.42) * hv());
      if (tier >= 1 && CLAVE[bar % 2].includes(b)) this.block(t, 0.4 * hv());
      if ((tier >= 2 || brk) && !fill && secBar % 4 === 3 && (b === 12 || b === 14)) this.talk(t, 0.5, b === 12 ? -3 : 2, S16 * 1.6);
    } else if (menu) {
      if (b === 0 || b === 8) this.kick(t, b ? 0.45 : 0.6);
      if (b % 2 === 1) this.shaker(t, 0.32 * hv());
      if (b === 3 || b === 11) this.conga(t, "h", 0.45 * hv(), 0.2);
      if (b === 14) this.conga(t, "l", 0.4 * hv(), -0.2);
    }

    /* ---- bass: follows the chord, pushes into the next one on step 15 ---- */
    const R = ch.r, pat = e ? BASS_OD : BASSPAT;
    if (run && !brk) {
      for (const [s, iv, len] of pat) if (s === b) this.bass(t, NOTE(iv === "n" ? nextCh.r : R + iv), len * S16 - 0.03, (s === 0 ? 0.14 : 0.11) * hv());
    } else if (b === 0 || (b === 8 && !calm) || (brk && b === 10)) this.bass(t, NOTE(R + (b === 10 ? 7 : 0)), S16 * (calm ? 14 : 6), run ? 0.11 : 0.075);

    /* ---- keys: Rhodes skank on the offbeats; held chords in the menu, pause and breakdown ---- */
    if (run && !brk) { for (const [s, v, len] of KEYS) if (s === b) this.keys(t, ch.k, len * S16, 0.07 * v * hv(), 0.004); }
    else if (b === 0 || (b === 8 && !calm)) this.keys(t, ch.k, S16 * (calm ? 15 : 7.5), calm ? 0.06 : 0.075, 0.03);
    // Keys answer the sax in the hook's gaps.
    if ((run || menu) && (sc === "A" || sc === "A2")) for (const p of KPH) if (p.start === (bar % 8) * 16 + b) this.keysLine(k, p.notes, run ? 0.1 : 0.065);
    // Countermelody (A2, tier 1+): Rhodes guide tones, two a bar.
    if (run && (sc === "A2" || (tier >= 1 && sc === "A")) && (b === 0 || b === 8)) this.keys(t, [ch.c[b ? 1 : 0] + 12], S16 * 7, 0.065, 0.02);

    /* ---- guitar: muted afro ostinato on chord tones, from tier 1 ---- */
    if (run && tier >= 1 && !brk) for (const [s, i] of GUIT) if (s === b) this.guitar(t, NOTE(ch.k[1 + i] + 12), 0.08 * hv());

    /* ---- sax: the hook (A, A2), the lift (B), a soft motif in the breakdown; the menu hears it softly ---- */
    const ph = PH[sc];
    if (ph && (run || (menu && sc !== "B"))) {
      const pos = sc === "D" ? secBar * 16 + b : (bar % 8) * 16 + b;
      for (const p of ph) if (p.start === pos) {
        const v = run ? (sc === "D" ? 0.6 : 0.85) : 0.5;
        this.sax(k, p.notes.map(([s, m, l]) => [s - p.start, m, l]), v, 0);
        if (e && sc !== "D") this.sax(k, p.notes.map(([s, m, l]) => [s - p.start, third(m), l]), 0.45, 1);
      }
    }
    /* ---- horn section: stabs in B (and in A2 at max tier / Overdrive) ---- */
    const horns = run && (sc === "B" || ((tier >= 2) && sc === "A2"));
    if (horns) {
      const tones = ch.k.slice(1).map((m) => m + 12);
      if (b === 14 && secBar % 4 !== 3) this.horn(t, tones, S16 * 1.2, 0.55);
      if (secBar % 4 === 3 && (b === 8 || b === 10 || b === 13)) this.horn(t, tones, S16 * (b === 13 ? 2.5 : 1.2), 0.6);
    }

    /* ---- risers into each 8-bar section and into the build ---- */
    if (run && b === 8 && (bar % 8 === 7 || bar === 27)) this.riser(t, SPB * 2);

    // Machines beside the line, on the grid so they sit in the groove (lighter than before: the band leads).
    const a = this.amb;
    if (run) {
      if (a.assembly > 0.02 && b === 8) this.stamp(t, 0.35 * a.assembly, false, a.assemblyPan);
      if (a.weld > 0.02 && (b === 6 || (b === 14 && Math.random() < 0.5))) this.steam(t, 0.4 * a.weld, a.weldPan);
      if (a.test > 0.02 && b === 10) this.servo(t, 0.3 * a.test, a.testPan);
      if (a.inventory > 0.02 && b % 4 === 2) this.rattle(t, 0.04 * a.inventory, a.inventoryPan);
    }
  }

  // From the game, a few times a second: how loud each nearby machine type is, and its side.
  ambient(slots) {
    if (!this.started) return;
    const a = { assembly: 0, weld: 0, test: 0, inventory: 0, laser: 0 };
    for (const s of slots) {
      const g = Math.max(0, 1 - Math.abs(s.z) / 22);
      if (g > (a[s.type] || 0)) { a[s.type] = g; a[s.type + "Pan"] = 0.75 * s.side; }
    }
    this.amb = a;
    const t = this.ctx.currentTime;
    this.whine.gain.setTargetAtTime(this.level === "run" ? 0.01 * a.laser : 0, t, 0.2);
    if (this.whinePan && a.laserPan != null) this.whinePan.pan.setTargetAtTime(a.laserPan, t, 0.2);
    // The intensity tier changes with run time: keep the run filter on its tier target.
    if (this.level === "run" && !this.energy) {
      const f = this.moodFreq();
      if (f !== this.lastF) { this.lastF = f; this.filter.frequency.setTargetAtTime(f, t, 1.5); }
    } else this.lastF = null;
  }

  /* ---------- voices ---------- */
  out(node, pan, dest) {
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p).connect(dest); return p; }
    node.connect(dest); return node;
  }
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  osc(type, f, t, dur, dest, peak, a = 0.004) {
    const A = this.ctx, o = A.createOscillator(), g = A.createGain();
    if (typeof type === "string") o.type = type; else o.setPeriodicWave(type);
    o.frequency.setValueAtTime(f, t);
    this.env(g, t, a, peak, dur);
    o.connect(g); o.start(t); o.stop(t + a + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    return { o, g };
  }
  burst(t, dur, dest, peak, type, f, q = 1, a = 0.002) {
    const A = this.ctx, s = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain();
    s.buffer = this.noise; s.loopStart = 0; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    this.env(g, t, a, peak, dur);
    s.connect(fl).connect(g);
    s.start(t, Math.random() * 0.8); s.stop(t + a + dur + 0.02);
    s.onended = () => { s.disconnect(); fl.disconnect(); g.disconnect(); };
    return { s, fl, g };
  }

  /* drums */
  // Kick: a tight, round sine with a fast pitch drop and a soft beater knock. Pumps the band gently.
  kick(t, v) {
    if (!this.roomFor(3)) return;
    const k = this.osc("sine", 140, t, 0.26, null, 0.95 * v, 0.002);
    k.o.frequency.exponentialRampToValueAtTime(52, t + 0.07);
    k.g.connect(this.drums);
    const n = this.burst(t, 0.012, null, 0.12 * v, "bandpass", 1100, 0.9, 0.0008); n.g.connect(this.drums);
    this.track([k.o, n.s], null, t, t + 0.3, 3);
    if (this.level === "run") for (const [g, dpt] of [[this.duck.gain, 0.82], [this.bassDuck.gain, 0.62]]) { g.setTargetAtTime(dpt, t, 0.004); g.setTargetAtTime(1, t + 0.03, 0.08); }
  }
  // Rimshot: a woody stick crack (two short shell modes) over a tight snare-wire burst. Ghosts are just the wires.
  rim(t, v, clap = false, ghost = false) {
    if (!this.roomFor(ghost ? 1 : 2)) return;
    const src = [], k = this.vary(1, 0.03);
    const wires = this.burst(t, ghost ? 0.05 : 0.09, null, (ghost ? 0.5 : 0.32) * v, "bandpass", 2000 * k, 0.8, 0.001);
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 700; wires.g.connect(hp); hp.connect(this.drums); src.push(wires.s);
    if (!ghost) {
      for (const [f, p, d] of [[455, 0.32, 0.03], [1180, 0.16, 0.018]]) { const o = this.osc("triangle", f * k, t, d, null, p * v, 0.0007); o.g.connect(this.drums); o.g.connect(this.verb); src.push(o.o); }
      const crack = this.burst(t, 0.014, null, 0.4 * v, "bandpass", 1600 * k, 2.2, 0.0005); crack.g.connect(this.drums); crack.g.connect(this.verb); src.push(crack.s);
    }
    if (clap) for (let i = 0; i < 3; i++) { const c = this.burst(t + i * 0.009, 0.05, null, 0.18 * v, "bandpass", 1300, 1.1, 0.001); c.g.connect(this.drums); c.g.connect(this.verb); src.push(c.s); }
    this.track(src, null, t, t + 0.15, ghost ? 1 : 2);
  }
  // Hats: closed = a very short bright tick; open = a longer airy wash. High-passed, then softened.
  hat(t, v, open) {
    if (!this.roomFor(open ? 1 : 0)) return;
    const n = this.burst(t, open ? 0.16 : 0.028, null, v * (open ? 0.32 : 0.42), "highpass", open ? 7000 : 8200, 0.7, 0.0008);
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(11500, this.ctx.sampleRate * 0.45); n.g.connect(lp);
    this.out(lp, open ? -0.15 : 0.12, this.drums);
    this.track([n.s], null, t, t + 0.2, open ? 1 : 0);
  }
  // Shaker: soft-attack band of seeds, accent on the offbeat 16ths.
  shaker(t, v) {
    if (!this.roomFor(0)) return;
    const n = this.burst(t, 0.045, null, v * 0.09, "bandpass", 6200, 1.1, 0.012);
    this.out(n.g, 0.3, this.drums); this.track([n.s], null, t, t + 0.08, 0);
  }
  // Conga: a skin mode with a small pitch drop and a palm noise; "s" = slap (brighter, shorter, more skin).
  conga(t, typ, v, pan) {
    if (!this.roomFor(1)) return;
    const f = (typ === "l" ? 196 : 294) * this.vary(1, 0.015), slap = typ === "s";
    const o = this.osc("sine", f * 1.08, t, slap ? 0.08 : 0.2, null, (slap ? 0.18 : 0.3) * v, 0.0015);
    o.o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const o2 = this.osc("sine", f * 1.52, t, slap ? 0.04 : 0.08, null, 0.08 * v, 0.0015);
    const nz = this.burst(t, slap ? 0.03 : 0.015, null, (slap ? 0.3 : 0.12) * v, "bandpass", slap ? 1500 : 900, 1, 0.0007);
    const mix = this.ctx.createGain(); o.g.connect(mix); o2.g.connect(mix); nz.g.connect(mix);
    const p = this.out(mix, pan, this.drums); mix.connect(this.verb);
    this.track([o.o, o2.o, nz.s], mix, t, t + 0.25, 1);
    void p;
  }
  // Talking drum: a pressured skin, its pitch bent by `semis` over the note.
  talk(t, v, semis, dur) {
    if (!this.roomFor(1)) return;
    const f = 220 * this.vary(1, 0.02), o = this.osc("sine", f, t, dur + 0.1, null, 0.3 * v, 0.004);
    o.o.frequency.setValueAtTime(f * (semis > 0 ? 0.92 : 1.06), t);
    o.o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, semis / 12), t + dur);
    const h = this.osc("sine", f * 2.01, t, 0.06, null, 0.06 * v, 0.003);
    const nz = this.burst(t, 0.02, null, 0.1 * v, "bandpass", 1000, 1.2, 0.001);
    const mix = this.ctx.createGain(); o.g.connect(mix); h.g.connect(mix); nz.g.connect(mix);
    this.out(mix, -0.3, this.drums); mix.connect(this.verb);
    this.track([o.o, h.o, nz.s], mix, t, t + dur + 0.2, 1);
  }
  // Agogo bell: two inharmonic bell partials, short, kept under 2.5 kHz.
  bell(t, hi, v) {
    if (!this.roomFor(0)) return;
    const f = hi ? 1046.5 : 784, src = [];
    for (const [r, p, d] of [[1, 0.09, 0.14], [2.32, 0.03, 0.06]]) { const o = this.osc("sine", f * r, t, d, null, p * v, 0.001); this.out(o.g, 0.45, this.drums); src.push(o.o); }
    this.track(src, null, t, t + 0.18, 0);
  }
  // Clave / woodblock: a dry pitched knock.
  block(t, v) {
    if (!this.roomFor(0)) return;
    const o = this.osc("sine", 1180, t, 0.035, null, 0.12 * v, 0.0006); const o2 = this.osc("sine", 1870, t, 0.02, null, 0.04 * v, 0.0006);
    this.out(o.g, -0.4, this.drums); this.out(o2.g, -0.4, this.drums);
    this.track([o.o, o2.o], null, t, t + 0.06, 0);
  }

  /* band */
  // Bass: round finger bass, a sine with a little triangle grit, low-passed; notes never overlap (monophonic).
  bass(t, f, len, v) {
    if (!this.roomFor(3)) return;
    const A = this.ctx, o = A.createOscillator(), o2 = A.createOscillator(), fl = A.createBiquadFilter(), g = A.createGain(), g2 = A.createGain();
    o.type = "sine"; o.frequency.value = f; o2.type = "triangle"; o2.frequency.value = f; g2.gain.value = 0.35;
    fl.type = "lowpass"; fl.Q.value = 0.7; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(380, t + 0.12);
    const hold = Math.max(0.04, len - 0.035);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.72, t + Math.min(hold, 0.15)); g.gain.setValueAtTime(v * 0.72, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.035);
    o.connect(fl); o2.connect(g2).connect(fl); fl.connect(g).connect(this.bassDuck);
    const end = t + hold + 0.045; o.start(t); o2.start(t); o.stop(end); o2.stop(end);
    this.track([o, o2], g, t, end, 3);
  }
  // Rhodes: per note an FM tine (carrier + 1:1 modulator whose index decays) and a soft bell partial.
  keys(t, tones, len, v, a = 0.004) {
    if (!this.roomFor(2)) return;
    const A = this.ctx, g = A.createGain(), fl = A.createBiquadFilter(), src = [];
    fl.type = "lowpass"; fl.frequency.value = 2400; fl.Q.value = 0.4;
    for (const m of tones) {
      const f = NOTE(m), c = A.createOscillator(), mo = A.createOscillator(), mg = A.createGain();
      c.frequency.value = f; mo.frequency.value = f; mo.connect(mg).connect(c.frequency);
      mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35);
      c.connect(fl); src.push(c, mo);
    }
    const rel = 0.22, hold = Math.max(a + 0.02, len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(v * 0.45, t + a + Math.min(0.6, hold * 0.8)); g.gain.setValueAtTime(v * 0.45, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + rel);
    fl.connect(g); this.out(g, 0.25, this.duck); g.connect(this.verb);
    const end = t + hold + rel + 0.02;
    for (const o of src) { o.start(t); o.stop(end); }
    this.track(src, g, t, end, 2);
  }
  // A melodic keys line (the answer to the sax): each note its own short tine, on the grid.
  keysLine(k, notes, v) {
    const s0 = notes[0][0];
    for (const [s, m, l] of notes) { const t = this.tk(k + (s - s0)); this.keys(t, [m, m + 12], l * S16 * 0.9, v * (m + 12 > 84 ? 0.6 : 1), 0.003); }
  }
  // Muted afro guitar: a plucked string, palm-muted (fast low-pass close), panned left.
  guitar(t, f, v) {
    if (!this.roomFor(1)) return;
    const o = this.osc(this.wGtr, f, t, 0.1, null, v, 0.002);
    const fl = this.ctx.createBiquadFilter(); fl.type = "lowpass"; fl.Q.value = 1.2; fl.frequency.setValueAtTime(2600, t); fl.frequency.exponentialRampToValueAtTime(650, t + 0.06);
    o.g.connect(fl); this.out(fl, -0.35, this.duck);
    this.track([o.o], o.g, t, t + 0.14, 1);
  }
  // Alto sax, one voice per legato phrase. notes: [[relStep, midi, len16]]. The whole phrase is written at
  // once (pitch glides, tonguing dips, brightness that follows the breath, delayed vibrato), so no envelope
  // is ever retriggered mid-note. `role` 1 = the harmony horn (darker, quieter, a little late).
  sax(k, notes, v, role) {
    if (!this.roomFor(3)) return;
    const A = this.ctx, o = A.createOscillator(), lfo = A.createOscillator(), vib = A.createGain(), lp = A.createBiquadFilter(), g = A.createGain();
    const br = A.createBufferSource(), bp = A.createBiquadFilter(), bg = A.createGain();
    o.setPeriodicWave(role ? this.wBrass : this.wSax);
    lfo.frequency.value = 5.1 + Math.random() * 0.4; lfo.connect(vib).connect(o.detune);
    lp.type = "lowpass"; lp.Q.value = 0.6; o.connect(lp).connect(g);
    br.buffer = this.noise; br.loop = true; bp.type = "bandpass"; bp.Q.value = 0.9; br.connect(bp).connect(bg).connect(g);
    const late = role ? 0.012 : 0, top = role ? 0.6 : 1;
    const T = (s) => this.tk(k + s) + late;
    const t0 = T(notes[0][0]);
    o.detune.value = role ? -6 : 0;
    g.gain.setValueAtTime(0.0001, t0); lp.frequency.setValueAtTime(700, t0); vib.gain.setValueAtTime(0, t0); bg.gain.setValueAtTime(0.0001, t0);
    let end = t0;
    notes.forEach(([s, m, l], i) => {
      const ti = T(s), dur = l * S16, f = NOTE(m), pk = v * 0.2 * top * (i === 0 ? 1 : 0.92) * this.vary(1, 0.05);
      const scoop = i === 0 || l >= 4 ? (l >= 4 ? 0.955 : 0.97) : 1;
      if (i === 0) { o.frequency.setValueAtTime(f * scoop, ti); }
      else { o.frequency.setValueAtTime(NOTE(notes[i - 1][1]), ti); }
      o.frequency.exponentialRampToValueAtTime(f, ti + (i === 0 ? 0.07 : 0.035));
      // tonguing: a small dip into each new note (legato), then the swell
      if (i > 0) g.gain.linearRampToValueAtTime(pk * 0.55, ti + 0.012);
      g.gain.linearRampToValueAtTime(pk, ti + (i === 0 ? 0.05 : 0.03));
      g.gain.linearRampToValueAtTime(pk * (l >= 4 ? 0.85 : 0.78), ti + Math.max(0.05, dur - 0.03));
      // brightness follows the breath (louder = brighter, like a real reed)
      lp.frequency.linearRampToValueAtTime((role ? 1600 : 2200) * (m > 76 ? 1.1 : 1), ti + 0.04);
      lp.frequency.linearRampToValueAtTime(role ? 1200 : 1650, ti + Math.max(0.06, dur - 0.02));
      // breath: a puff at the attack, a whisper under the tone
      bp.frequency.setValueAtTime(Math.min(3000, f * 3), ti);
      bg.gain.linearRampToValueAtTime(pk * 0.45, ti + 0.02); bg.gain.linearRampToValueAtTime(pk * 0.12, ti + 0.09);
      // vibrato only on held notes, arriving late in the note
      vib.gain.setValueAtTime(0, ti);
      if (dur > 0.3) { vib.gain.setValueAtTime(0, ti + dur * 0.35); vib.gain.linearRampToValueAtTime(role ? 8 : 16, ti + dur * 0.95); }
      end = ti + dur;
    });
    g.gain.linearRampToValueAtTime(0.0001, end + 0.11);
    bg.gain.linearRampToValueAtTime(0.0001, end + 0.06);
    const out = this.out(g, role ? -0.2 : 0.05, this.saxBus);
    g.connect(this.verb); if (!role) g.connect(this.send);
    for (const s of [o, lfo]) s.start(t0);
    br.start(t0, Math.random() * 0.8);
    for (const s of [o, lfo, br]) s.stop(end + 0.14);
    br.onended = () => { lp.disconnect(); bp.disconnect(); bg.disconnect(); vib.disconnect(); if (out !== g) out.disconnect(); };
    this.track([o, lfo, br], g, t0, end + 0.14, role ? 2 : 3);
  }
  // Horn-section stab: three brass voices on chord tones, a quick "blat" brightness and a tiny scoop.
  horn(t, tones, len, v) {
    if (!this.roomFor(2)) return;
    const A = this.ctx, g = A.createGain(), lp = A.createBiquadFilter(), src = [];
    lp.type = "lowpass"; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2300, t + 0.03); lp.frequency.exponentialRampToValueAtTime(1100, t + len + 0.05);
    tones.forEach((m, i) => {
      const o = A.createOscillator(); o.setPeriodicWave(this.wBrass);
      const f = NOTE(m); o.frequency.setValueAtTime(f * 0.975, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); o.detune.value = (i - 1) * 5;
      o.connect(lp); src.push(o);
    });
    const pk = v * 0.09;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.018);
    g.gain.linearRampToValueAtTime(pk * 0.7, t + len); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.09);
    lp.connect(g); this.out(g, 0.15, this.saxBus); g.connect(this.verb);
    for (const o of src) { o.start(t); o.stop(t + len + 0.12); }
    src[0].onended = () => lp.disconnect();
    this.track(src, g, t, t + len + 0.12, 2);
  }
  // Riser: a shaker/air swell (noise through a rising band), organic rather than a synth sweep.
  riser(t, dur) {
    const A = this.ctx, s = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain();
    s.buffer = this.noise; s.loop = true;
    fl.type = "bandpass"; fl.Q.value = 1.4; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(5200, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.92); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    s.connect(fl).connect(g).connect(this.duck); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.08);
    s.onended = () => { fl.disconnect(); };
    this.track([s], g, t, t + dur + 0.08, 2);
  }
  // Press stamp: a pitched thump plus a short metallic slap (now only the assembly machines use it).
  stamp(t, v, accent = false, pan = 0) {
    const dest = pan ? this.ambOut : this.drums;
    const k = this.osc("sine", 130, t, 0.32, null, 0.9 * v);
    k.o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.out(k.g, pan, dest);
    const sl = this.burst(t, 0.05, null, 0.18 * v, "bandpass", 1400, 1.6);
    this.out(sl.g, pan, dest);
    if (accent) { const c = this.osc("triangle", 220, t, 0.25, null, 0.06); this.out(c.g, 0, this.duck); }
  }
  rattle(t, v, pan = 0) { const n = this.burst(t, 0.03, null, v * 0.8, "bandpass", 1900, 2.5); this.out(n.g, pan, pan ? this.ambOut : this.duck); }
  servo(t, v, pan) {
    const A = this.ctx, o = A.createOscillator(), g = A.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(520, t + 0.18); o.frequency.linearRampToValueAtTime(380, t + 0.32);
    const fl = A.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 1400;
    this.env(g, t, 0.03, v * 0.12, 0.32);
    o.connect(fl).connect(g); this.out(g, pan, this.ambOut); o.start(t); o.stop(t + 0.4);
    o.onended = () => { o.disconnect(); fl.disconnect(); g.disconnect(); };
  }
  steam(t, v, pan) { const n = this.burst(t, 0.35, null, v * 0.18, "bandpass", 1800, 0.6, 0.02); this.out(n.g, pan, this.ambOut); }
  // Count-in tick: a woodblock knock (no square waves anywhere).
  tick(t) { const o = this.osc("sine", 1180, t, 0.05, null, 0.09, 0.0008); const o2 = this.osc("sine", 1870, t, 0.025, null, 0.03, 0.0008); o.g.connect(this.musicOut); o2.g.connect(this.musicOut); }

  /* ---------- sound effects ---------- */
  // Effects voiced as their materials. Every call varies pitch and level a little.
  sfx(name, pan = 0) {
    if (!this.started || this.s.sfx === false) return;
    // Polyphony guard: the same effect at most once per 35 ms (a burst of pickups at top speed reads as one
    // bright hit, not a pile-up), and at most 16 effects sounding at once (small pickups give way first).
    const now = this.ctx.currentTime, minor = name === "gear" || name === "screw" || name === "step" || name === "tap";
    if (now - (this.sfxLast[name] ?? -1) < 0.035) return;
    this.sfxLive = this.sfxLive.filter((x) => x > now);
    if (this.sfxLive.length >= (minor ? 12 : 16)) return;
    this.sfxLast[name] = now; this.sfxLive.push(now + 0.45);
    const t = this.ctx.currentTime + 0.005, D = this.sfxOut, V = (x, p) => this.vary(x, p);
    const k = V(1, 0.06); // this call's pitch factor
    const o = (ty, f, d, p, a, dt = 0) => { const v = this.osc(ty, f * k, t + dt, d, null, V(p, 0.08), a); this.out(v.g, pan, D); return v; };
    const nz = (d, p, ty, f, q, a, dt = 0) => { const v = this.burst(t + dt, d, null, V(p, 0.08), ty, f * k, q, a); this.out(v.g, pan, D); return v; };
    // Damped inharmonic ring (struck steel): partial ratios of a free plate, short decays, low-passed.
    const steel = (f0, d, p) => { for (const [r, pp] of [[1, 1], [2.76, 0.45], [5.4, 0.18]]) { const v = this.osc("sine", f0 * r * k, t, d / r ** 0.5, null, V(p * pp, 0.08), 0.002); this.out(v.g, pan, D); } };
    // Woody crack: resonant band-passed noise, a hollow body tone, and a few small debris rattles.
    // Wood: the crack carries the material, so it leads (it sat ~20 dB under the thud before). A splintery
    // resonant band at ~1.1 kHz, a hollow box body (inharmonic, fast-decaying sine modes), then 5-7 debris
    // rattles that fall in level and spread in time. Everything stays below ~2.5 kHz: woody, not hissy.
    const wood = (p) => { nz(0.035, 0.75 * p, "bandpass", 1100, 5, 0.0008); nz(0.09, 0.35 * p, "bandpass", 520, 2.5, 0.001);
      for (const [f, d, pp] of [[230, 0.12, 0.2], [415, 0.08, 0.12], [690, 0.05, 0.07]]) o("sine", f, d, pp * p, 0.001);
      const nd = 5 + Math.floor(Math.random() * 3);
      for (let i = 0; i < nd; i++) nz(0.02, V(0.12 * p * (1 - i / nd), 0.3), "bandpass", V(1500, 0.3), 4, 0.001, 0.05 + i * V(0.04, 0.5)); };
    // Low thud: a sine dropping in pitch (weight without click).
    const thud = (f, d, p) => { const v = o("sine", f, d, p, 0.003); v.o.frequency.exponentialRampToValueAtTime(f * 0.4 * k, t + d * 0.6); };
    if (name === "gear") { o("sine", 1318.5, 0.12, 0.1, 0.004); o("sine", 1975.5, 0.08, 0.04, 0.004); }
    else if (name === "screw") { for (let i = 0; i < 3; i++) nz(0.018, 0.12, "bandpass", 2400, 4, 0.002, i * 0.035); o("triangle", 1046.5, 0.06, 0.045); }
    else if (name === "tool") { const v = o("triangle", 523.25, 0.26, 0.15, 0.012); v.o.frequency.exponentialRampToValueAtTime(1046.5 * k, t + 0.18); o("sine", 1318.5, 0.22, 0.06, 0.01); }
    else if (name === "crate") { wood(1); thud(140, 0.14, 0.18); }   // thud 0.45 -> 0.18: it sat on the kick and hid the wood
    else if (name === "hammer") { thud(110, 0.2, 0.4); steel(320, 0.3, 0.2); nz(0.08, 0.2, "bandpass", 900, 1.2, 0.002); }   // more ring, less sub
    else if (name === "drill") { const v = o("triangle", 420, 0.4, 0.08, 0.02); v.o.frequency.exponentialRampToValueAtTime(680 * k, t + 0.3); nz(0.3, 0.08, "bandpass", 1500, 1.5, 0.02); }
    else if (name === "magnet") {
      const v = o("sawtooth", 60, 0.7, 0.07, 0.05);
      const tr = this.ctx.createOscillator(), tg = this.ctx.createGain(); tr.frequency.value = 18; tg.gain.value = 0.035; tr.connect(tg).connect(v.g.gain); tr.start(t); tr.stop(t + 0.8);
      const w = nz(0.6, 0.1, "bandpass", 400, 2, 0.15); w.fl.frequency.exponentialRampToValueAtTime(1800, t + 0.6);
    }
    // Feet and moves: soft composite, a dull pad with a little air.
    // Feet sit at 300-1200 Hz, above the kick and bass (a sub thud there is masked by the music), soft-attack.
    else if (name === "jump") { const w = nz(0.14, 0.28, "bandpass", 600, 1.6, 0.006); w.fl.frequency.exponentialRampToValueAtTime(1400, t + 0.14); o("sine", 330, 0.05, 0.12, 0.004); }
    else if (name === "step") { nz(0.03, 0.16, "bandpass", V(650, 0.1), 2, 0.003); o("sine", 260, 0.035, 0.09, 0.003); }
    else if (name === "land") { nz(0.07, 0.3, "bandpass", 480, 1.4, 0.004); o("sine", 200, 0.08, 0.2, 0.004); thud(90, 0.1, 0.08); }
    else if (name === "slide") { const w = nz(0.3, 0.1, "lowpass", 1600, 1, 0.012); w.fl.frequency.exponentialRampToValueAtTime(300, t + 0.3); }
    else if (name === "crash_wood") { wood(1.3); thud(90, 0.3, 0.45); }
    else if (name === "crash_steel" || name === "hit") { thud(70, 0.4, 0.55); steel(260, 0.55, 0.2); nz(0.25, 0.28, "bandpass", 700, 0.9, 0.003); }
    else if (name === "fall") { const v = o("sine", 220, 0.6, 0.12, 0.02); v.o.frequency.exponentialRampToValueAtTime(70 * k, t + 0.55); thud(60, 0.35, 0.5, 0.45); }
    else if (name === "pb") { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => { const v = this.osc("sine", f, t + i * 0.07, 0.5, null, i === 3 ? 0.06 : 0.1); this.out(v.g, 0, D); }); this.sweep(); }
    else if (name === "over") { [523.25, 659.25, 783.99].forEach((f, i) => { const v = this.osc("triangle", f, t + i * 0.05, 0.4, null, 0.1); this.out(v.g, 0, D); }); this.riser(t, 0.5); }
    else if (name === "tap") o("triangle", 660, 0.05, 0.04, 0.003);
    else if (name === "power") { const v = o("triangle", 440, 0.3, 0.13, 0.012); v.o.frequency.exponentialRampToValueAtTime(880 * k, t + 0.25); }
  }

  suspend() { if (this.ctx && !this.offline && this.ctx.state === "running") this.ctx.suspend(); }
  resume() { if (this.ctx && !this.offline && this.ctx.state === "suspended") this.ctx.resume(); }

  dispose() {
    clearInterval(this.timer);
    if (this.ctx && !this.offline) this.ctx.close().catch(() => {});
    this.ctx = null; this.started = false;
  }
}

// Render `secs` of the run mix (Overdrive from `energyAt`) to an AudioBuffer, for the demo clip.
// Drives the scheduler the way the live 25 ms timer does (suspend/resume every 25 ms of render time).
export async function render(secs = 16, energyAt = 8) {
  const ctx = new OfflineAudioContext(2, 44100 * secs, 44100);
  const a = new FactoryAudio({ music: true, sfx: true }, ctx);
  a.build();
  a.mood("run", true);
  a.countIn(1, SPB);
  const fake = [{ type: "assembly", z: -8, side: 1 }, { type: "weld", z: -4, side: -1 }];
  for (let i = 1; i * 0.025 < secs - LOOK; i++) {
    const t = i * 0.025;
    ctx.suspend(t).then(() => {
      if (i % 10 === 0) { fake.forEach((s) => (s.z += 4.5)); if (fake[0].z > 22) fake.forEach((s) => (s.z -= 44)); a.ambient(fake); }
      if (t >= energyAt && !a.energy) a.setEnergy(true);
      a.schedule(ctx.currentTime + LOOK);
      ctx.resume();
    });
  }
  return ctx.startRendering();
}
