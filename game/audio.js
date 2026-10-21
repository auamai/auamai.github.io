// Servo Sprint: music and sound, all synthesised with WebAudio (no files, no licences to track).
// The groove is built from machine sounds: a press stamp for the kick, pneumatic hiss for hats,
// an anvil clank for the snare, conveyor rattle for the shaker, servo whirs for risers, over a low
// motor hum, with a light synth line on top. Layers follow the game: soft and filtered in the menu,
// full in a run, an extra layer in Overdrive or with the golden wrench, ducked when paused or over.
// Machines beside the line add their own sounds, panned to their side, under the music.
// Works on an OfflineAudioContext too (render(), used to make the demo clip).

const BPM = 124;
const SPB = 60 / BPM;            // seconds per beat
const STEPS = 32;                // two bars of 16ths
// A minor, kept to a friendly pentatonic.
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BASS = [45, 45, 45, 48, 43, 43, 50, 47];           // per half bar
const LEAD = [69, -1, 72, -1, 76, 74, 72, -1, 69, -1, 67, 69, -1, 72, -1, -1,
              69, -1, 72, -1, 76, -1, 79, 76, 74, -1, 72, 74, -1, 69, -1, -1];
const ARP = [57, 64, 69, 72, 57, 64, 69, 74, 55, 62, 67, 71, 55, 62, 67, 72];
// Answer phrase and a second bass line, so the 2-bar loop becomes an 8-bar phrase (A A' B A'').
const LEAD_B = [72, -1, 76, -1, 79, 76, 74, -1, 72, -1, 69, 72, -1, 74, -1, -1,
                76, -1, 74, -1, 72, -1, 69, 67, 69, -1, -1, -1, -1, -1, -1, -1];
const BASS_B = [41, 41, 43, 43, 45, 45, 40, 43];

export class FactoryAudio {
  constructor(settings, ctx = null) {
    this.s = settings;           // { music, sfx, musicVol, sfxVol } (booleans + 0..1)
    this.ctx = ctx;
    this.offline = !!ctx;
    this.level = "menu";         // menu | run | pause | over
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
    this.master = A.createGain(); this.master.gain.value = 0.8;   // makes up the lower ceiling
    // The mute fader: every sound passes through it, so mute is instant and click-free (a 60 ms fade).
    this.fader = A.createGain(); this.fader.gain.value = 1;
    this.master.connect(shelf).connect(dip).connect(comp).connect(lim).connect(this.fader).connect(A.destination);
    this.musicOut = A.createGain();
    this.filter = A.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 900; this.filter.Q.value = 0.7;
    this.musicOut.connect(this.filter).connect(this.master);
    this.sfxOut = A.createGain(); this.sfxOut.connect(this.master);
    this.ambOut = A.createGain(); this.ambOut.gain.value = 0.55; this.ambOut.connect(this.filter);
    // Two separate gains: `bus` follows the game state (pause/over duck, kick included) and `duck` only
    // pumps off the kick. Keeping them apart stops a queued kick from undoing the pause duck.
    this.bus = A.createGain(); this.bus.connect(this.musicOut);
    // Keep the motor hum and bass out of the kick's sub range (the run mix was ~85% energy below 250 Hz).
    const lowcut = A.createBiquadFilter(); lowcut.type = "highpass"; lowcut.frequency.value = 70; lowcut.Q.value = 0.6;
    this.duck = A.createGain(); this.duck.connect(lowcut).connect(this.bus);
    this.phrase = 0;
    // Echo for the lead.
    this.delay = A.createDelay(1); this.delay.delayTime.value = SPB * 0.75;
    const fb = A.createGain(); fb.gain.value = 0.28;
    const dl = A.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 2400;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.duck);
    // Noise buffer, shared.
    const n = A.sampleRate;
    this.noise = A.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // Motor hum bed: two detuned saws, low-passed, always on (gain follows the level).
    this.hum = A.createGain(); this.hum.gain.value = 0;
    const hf = A.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 140;
    for (const [f, dt] of [[55, -4], [110.4, 3]]) {
      const o = A.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = dt;
      o.connect(hf); o.start();
    }
    const lfo = A.createOscillator(), lg = A.createGain();
    lfo.frequency.value = 0.23; lg.gain.value = 40; lfo.connect(lg).connect(hf.frequency); lfo.start();
    hf.connect(this.hum).connect(this.duck);
    // Laser whine near the laser cells: a quiet continuous voice, gain and pan from the game.
    this.whine = A.createGain(); this.whine.gain.value = 0;
    this.whinePan = A.createStereoPanner ? A.createStereoPanner() : null;
    const wo = A.createOscillator(); wo.type = "sine"; wo.frequency.value = 880;   // was a 1760 Hz triangle: a constant tone in the ear's most sensitive band
    const wl = A.createOscillator(), wlg = A.createGain(); wl.frequency.value = 6; wlg.gain.value = 18; wl.connect(wlg).connect(wo.frequency); wl.start();
    wo.connect(this.whine); wo.start();
    if (this.whinePan) this.whine.connect(this.whinePan).connect(this.ambOut); else this.whine.connect(this.ambOut);

    this.step = 0;
    this.spb = SPB;
    this.next = A.currentTime + 0.08;
    this.applyVolumes();
    this.mood(this.level, true);
    if (!this.offline) this.timer = setInterval(() => this.schedule(this.ctx.currentTime + 0.12), 25);
  }

  applyVolumes() {
    if (!this.started) return;
    const t = this.ctx.currentTime, s = this.s;
    const mv = s.music === false ? 0 : (s.musicVol ?? 0.7);
    const fv = s.sfx === false ? 0 : (s.sfxVol ?? 0.8);
    // ~60 ms fades (time constant 0.02 s): fast enough to feel instant, slow enough not to click.
    for (const [g, v] of [[this.musicOut.gain, mv * 1.0 /* was 0.85: run sat at -17 LUFS after the low cut */], [this.sfxOut.gain, fv]]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(v, t, 0.02); }
  }
  // +-pct random variation, so repeated sounds never fatigue.
  vary(x, pct = 0.07) { return x * (1 + (Math.random() * 2 - 1) * pct); }

  // Layers and the low-pass: menu soft, run full, pause and game over ducked.
  mood(level, now = false) {
    this.level = level;
    if (!this.started) return;
    const t = this.ctx.currentTime, k = now ? 0.01 : 0.25;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setTargetAtTime(this.moodFreq(), t, k);
    this.hum.gain.setTargetAtTime(level === "run" ? 0.06 : level === "menu" ? 0.045 : 0.03, t, 0.4);
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(level === "pause" || level === "over" ? 0.5 : 1, t, 0.2);
  }
  moodFreq() { const L = this.level; return L === "run" ? (this.energy ? 16000 : 9000) : L === "menu" ? 950 : 420;
  }

  setEnergy(on) {
    if (on === this.energy) return;
    this.energy = on;
    if (this.started && on) this.riser(this.ctx.currentTime + 0.02, 0.9);
    this.mood(this.level);
  }

  // New best: a quick filter sweep up and back.
  sweep() {
    if (!this.started) return;
    const t = this.ctx.currentTime, f = this.filter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(300, t);
    f.exponentialRampToValueAtTime(16000, t + 0.45);
    f.setTargetAtTime(this.moodFreq(), t + 0.5, 0.3);   // was 950 for every non-run state: game over got bright again on a new best
  }

  // Countdown: lock the groove so 3-2-1 fall on beats 2-3-4 and GO is the downbeat.
  // `beat`: the countdown's beat length; the tempo eases back to BPM over the next bar.
  countIn(n, beat) {
    if (!this.started) return;
    const A = this.ctx, t0 = A.currentTime + 0.03;
    this.spb = beat;
    this.step = (STEPS - (n - 1) * 4) % STEPS;     // GO lands on step 0
    this.next = t0;
    this.easeFrom = t0 + (n - 1) * beat;
    for (let i = 0; i < n - 1; i++) this.tick(t0 + i * beat);
    // GO: the scheduled downbeat kick plays anyway; add only the accent tone (stacking a second stamp doubled the transient).
    const c = this.osc("triangle", 220, this.easeFrom, 0.25, null, 0.06); this.out(c.g, 0, this.duck);
  }

  /* ---------- scheduler ---------- */
  schedule(until) {
    const A = this.ctx;
    while (this.next < until) {
      if (this.s.music !== false) this.play(this.step, this.next);   // music off: keep the clock, build no voices
      // After a count-in, glide the tempo back to the song's own.
      if (this.easeFrom != null && this.next >= this.easeFrom) {
        this.spb += (SPB - this.spb) * 0.08;
        if (Math.abs(this.spb - SPB) < 0.002) { this.spb = SPB; this.easeFrom = null; }
      }
      const sw = this.step % 2 ? -0.012 : 0.012;   // a touch of swing
      this.next += this.spb / 4 + sw * (this.spb / SPB);
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.phrase++;
    }
    void A;
  }

  play(st, t) {
    const L = this.level, run = L === "run", e = this.energy && run, b = st % 16, beat = b % 4 === 0;
    // 8-bar phrase: ph 0 = A, 1 = A with the answer lead, 2 = B (second bass line), 3 = A with a break.
    const ph = this.phrase % 4, brk = run && ph === 3 && st >= 24, hv = () => 0.85 + Math.random() * 0.3;
    // Kick: the press stamp, four on the floor (half time in the menu); drops out for the last half bar of a phrase.
    if (beat && (run || b % 8 === 0) && !brk) this.stamp(t, run ? 1 : 0.7);
    // Snare: anvil clank on 2 and 4, with a short fill in the break.
    if (run && (b === 4 || b === 12) && !brk) this.clank(t, 0.55);
    if (brk && (b === 12 || b === 14 || b === 15)) this.clank(t, 0.3 + (b - 12) * 0.06);
    if (e && b === 14 && st >= 16 && !brk) this.clank(t, 0.25);
    // Hats: pneumatic hiss on the offbeats, 16ths in the high-energy layer; humanised level.
    if (b % 4 === 2) this.hiss(t, (run ? 0.16 : 0.08) * hv(), 0.05);
    else if (e && b % 2 === 1) this.hiss(t, 0.06 * hv(), 0.025);
    // Shaker: the conveyor rattle, every 16th, quiet.
    if (run && !brk) this.rattle(t, (b % 4 === 0 ? 0.05 : 0.03) * hv());
    // Bass, on the half bar, pumping off the kick.
    const bl = run && ph === 2 ? BASS_B : BASS;
    if (run || L === "menu") { if (b % 2 === 0 && b % 4 !== 0) this.bass(t, NOTE(bl[Math.floor(st / 4) % 8]), L === "menu" ? 0.12 : 0.2); }
    // Lead and arp on top (the answer phrase on A' and B).
    const ld = ph === 1 || ph === 2 ? LEAD_B : LEAD;
    if (run) { const m = ld[st]; if (m > 0 && b % 2 === 0) this.lead(t, NOTE(m), 0.09); }
    if (e || L === "menu") { if (b % 2 === 1 || e) this.pluck(t, NOTE(ARP[st % 16] + (e ? 12 : 0)), e ? 0.05 : 0.04); }
    // Servo whir riser before every fourth bar in the run.
    if (run && st === 24 && (this.bar = ((this.bar || 0) + 1)) % 2 === 0) this.riser(t, 0.6);
    // Machines beside the line, on the grid so they sit in the groove.
    const a = this.amb;
    if (a.assembly > 0.02 && (b === 0 || b === 8)) this.stamp(t, 0.45 * a.assembly, false, a.assemblyPan);
    if (a.weld > 0.02 && (b === 6 || (b === 14 && Math.random() < 0.5))) this.steam(t, 0.5 * a.weld, a.weldPan);
    if (a.test > 0.02 && b === 10) this.servo(t, 0.35 * a.test, a.testPan);
    if (a.inventory > 0.02 && b % 2 === 0) this.rattle(t, 0.05 * a.inventory, a.inventoryPan);
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
    this.whine.gain.setTargetAtTime(this.level === "run" ? 0.012 * a.laser : 0, t, 0.2);
    if (this.whinePan && a.laserPan != null) this.whinePan.pan.setTargetAtTime(a.laserPan, t, 0.2);
  }

  /* ---------- voices ---------- */
  out(node, pan, dest) {
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p).connect(dest); }
    else node.connect(dest);
  }
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  osc(type, f, t, dur, dest, peak, a = 0.004) {
    const A = this.ctx, o = A.createOscillator(), g = A.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
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

  // Press stamp: a pitched thump plus a short metallic slap.
  stamp(t, v, accent = false, pan = 0) {
    const dest = pan ? this.ambOut : this.bus;   // the kick now follows the pause/over duck too
    const k = this.osc("sine", 130, t, 0.32, null, 0.9 * v);
    k.o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.out(k.g, pan, dest);
    const sl = this.burst(t, 0.05, null, 0.18 * v, "bandpass", 1400, 1.6);
    this.out(sl.g, pan, dest);
    if (accent) { const c = this.osc("triangle", 220, t, 0.25, null, 0.06); this.out(c.g, 0, this.duck); }
    // Duck the rest on each kick.
    if (!pan && this.duck && this.level === "run") {
      // A 3 ms glide down instead of an instant step: the step clicked on the motor hum every beat.
      const d = this.duck.gain;
      d.setTargetAtTime(0.62, t, 0.003); d.setTargetAtTime(1, t + 0.02, 0.07);
    }
  }
  clank(t, v) {
    for (const [f, p] of [[540, 0.12], [812, 0.08], [1236, 0.05], [1710, 0.025]]) {
      const o = this.osc("triangle", f, t, 0.16, null, p * v * 2.2); this.out(o.g, 0, this.duck);
    }
    const n = this.burst(t, 0.12, null, 0.35 * v, "bandpass", 1800, 1.4); this.out(n.g, 0, this.duck);
  }
  // Hats: high-passed air, then low-passed so they are soft, never sizzling.
  hiss(t, v, d) { const n = this.burst(t, d, null, v * 0.75, "highpass", 5200, 0.7); const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 8200; n.g.connect(lp); this.out(lp, 0, this.duck); }
  rattle(t, v, pan = 0) { const n = this.burst(t, 0.03, null, v * 0.8, "bandpass", 1900, 2.5); this.out(n.g, pan, pan ? this.ambOut : this.duck); }
  bass(t, f, v) {
    const A = this.ctx, o = A.createOscillator(), fl = A.createBiquadFilter(), g = A.createGain();
    o.type = "sawtooth"; o.frequency.value = f;
    fl.type = "lowpass"; fl.Q.value = 2.5; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(160, t + 0.18);
    this.env(g, t, 0.006, v, 0.22);
    o.connect(fl).connect(g).connect(this.duck); o.start(t); o.stop(t + 0.26);
  }
  lead(t, f, v) {
    for (const [ty, m, p] of [["triangle", 1, 1], ["sine", 2, 0.35]]) {
      const o = this.osc(ty, f * m, t, 0.32, null, v * p, 0.01);
      o.g.connect(this.duck); o.g.connect(this.delay);
    }
  }
  pluck(t, f, v) { const o = this.osc("triangle", f, t, 0.14, null, v * 0.8); const fl = this.ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 1800; o.g.connect(fl).connect(this.duck); fl.connect(this.delay); }
  riser(t, dur) {
    const A = this.ctx, o = A.createOscillator(), fl = A.createBiquadFilter(), g = A.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(900, t + dur);
    fl.type = "bandpass"; fl.Q.value = 3; fl.frequency.setValueAtTime(400, t); fl.frequency.exponentialRampToValueAtTime(2000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(fl).connect(g).connect(this.duck); o.start(t); o.stop(t + dur + 0.1);
  }
  servo(t, v, pan) {
    const A = this.ctx, o = A.createOscillator(), g = A.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(520, t + 0.18); o.frequency.linearRampToValueAtTime(380, t + 0.32);
    const fl = A.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 1400;
    this.env(g, t, 0.03, v * 0.12, 0.32);
    o.connect(fl).connect(g); this.out(g, pan, this.ambOut); o.start(t); o.stop(t + 0.4);
  }
  steam(t, v, pan) { const n = this.burst(t, 0.35, null, v * 0.18, "bandpass", 1800, 0.6, 0.02); this.out(n.g, pan, this.ambOut); }
  // Count-in tick: a soft, rounded triangle blip through a low-pass (no square waves anywhere).
  tick(t) { const o = this.osc("triangle", 880, t, 0.07, null, 0.06, 0.003); const fl = this.ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 1800; o.g.connect(fl).connect(this.musicOut); }

  /* ---------- sound effects ---------- */
  // Effects voiced as their materials. Every call varies pitch and level a little.
  sfx(name, pan = 0) {
    if (!this.started || this.s.sfx === false) return;
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
export async function render(secs = 16, energyAt = 8) {
  const ctx = new OfflineAudioContext(2, 44100 * secs, 44100);
  const a = new FactoryAudio({ music: true, sfx: true }, ctx);
  a.level = "run";
  a.build();
  a.mood("run", true);
  const fake = [{ type: "assembly", z: -8, side: 1 }, { type: "weld", z: -4, side: -1 }];
  for (let t = 0; t < secs; t += 0.25) {
    a.next = Math.max(a.next, 0);
    fake.forEach((s) => (s.z += 4.5)); if (fake[0].z > 22) fake.forEach((s) => (s.z -= 44));
    a.ambient(fake);
    if (t >= energyAt && !a.energy) { a.energy = true; a.riser(t, 0.9); a.filter.frequency.setValueAtTime(16000, t); }
    a.schedule(t + 0.25);
  }
  return ctx.startRendering();
}
