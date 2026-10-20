// Factory run: music and sound, all synthesised with WebAudio (no files, no licences to track).
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
    }
    if (this.ctx.state === "suspended" && !this.offline) this.ctx.resume();
    if (!this.started) this.build();
    return true;
  }

  build() {
    const A = this.ctx;
    this.started = true;
    const comp = A.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.18;
    this.master = A.createGain(); this.master.gain.value = 0.8;
    this.master.connect(comp).connect(A.destination);
    this.musicOut = A.createGain();
    this.filter = A.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 900; this.filter.Q.value = 0.7;
    this.musicOut.connect(this.filter).connect(this.master);
    this.sfxOut = A.createGain(); this.sfxOut.connect(this.master);
    this.ambOut = A.createGain(); this.ambOut.gain.value = 0.55; this.ambOut.connect(this.filter);
    // Sidechain-ish duck for everything but the kick.
    this.duck = A.createGain(); this.duck.connect(this.musicOut);
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
    const hf = A.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 170;
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
    const wo = A.createOscillator(); wo.type = "triangle"; wo.frequency.value = 1760;
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
    this.musicOut.gain.setTargetAtTime(mv * 0.85, t, 0.05);
    this.sfxOut.gain.setTargetAtTime(fv, t, 0.03);
  }

  // Layers and the low-pass: menu soft, run full, pause and game over ducked.
  mood(level, now = false) {
    this.level = level;
    if (!this.started) return;
    const t = this.ctx.currentTime, k = now ? 0.01 : 0.25;
    const f = level === "run" ? (this.energy ? 16000 : 9000) : level === "menu" ? 950 : 420;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setTargetAtTime(f, t, k);
    this.hum.gain.setTargetAtTime(level === "run" ? 0.09 : level === "menu" ? 0.06 : 0.04, t, 0.4);
    this.duck.gain.setTargetAtTime(level === "pause" || level === "over" ? 0.55 : 1, t, 0.2);
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
    f.setTargetAtTime(this.level === "run" ? (this.energy ? 16000 : 9000) : 950, t + 0.5, 0.3);
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
    this.stamp(this.easeFrom, 1.2, true);
  }

  /* ---------- scheduler ---------- */
  schedule(until) {
    const A = this.ctx;
    while (this.next < until) {
      this.play(this.step, this.next);
      // After a count-in, glide the tempo back to the song's own.
      if (this.easeFrom != null && this.next >= this.easeFrom) {
        this.spb += (SPB - this.spb) * 0.08;
        if (Math.abs(this.spb - SPB) < 0.002) { this.spb = SPB; this.easeFrom = null; }
      }
      const sw = this.step % 2 ? -0.012 : 0.012;   // a touch of swing
      this.next += this.spb / 4 + sw * (this.spb / SPB);
      this.step = (this.step + 1) % STEPS;
    }
    void A;
  }

  play(st, t) {
    const L = this.level, run = L === "run", e = this.energy && run, b = st % 16, beat = b % 4 === 0;
    // Kick: the press stamp, four on the floor (half time in the menu).
    if (beat && (run || b % 8 === 0)) this.stamp(t, run ? 1 : 0.7);
    // Snare: anvil clank on 2 and 4.
    if (run && (b === 4 || b === 12)) this.clank(t, 0.55);
    if (e && b === 14 && st >= 16) this.clank(t, 0.25);
    // Hats: pneumatic hiss on the offbeats, 16ths in the high-energy layer.
    if (b % 4 === 2) this.hiss(t, run ? 0.16 : 0.08, 0.05);
    else if (e && b % 2 === 1) this.hiss(t, 0.06, 0.025);
    // Shaker: the conveyor rattle, every 16th, quiet.
    if (run) this.rattle(t, b % 4 === 0 ? 0.05 : 0.03);
    // Bass, on the half bar, pumping off the kick.
    if (run || L === "menu") { if (b % 2 === 0 && b % 4 !== 0) this.bass(t, NOTE(BASS[Math.floor(st / 4) % 8] - 12 + 12), L === "menu" ? 0.12 : 0.2); }
    // Lead and arp on top.
    if (run) { const m = LEAD[st]; if (m > 0 && b % 2 === 0) this.lead(t, NOTE(m), 0.09); }
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
    return { o, g };
  }
  burst(t, dur, dest, peak, type, f, q = 1, a = 0.002) {
    const A = this.ctx, s = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain();
    s.buffer = this.noise; s.loopStart = 0; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    this.env(g, t, a, peak, dur);
    s.connect(fl).connect(g);
    s.start(t, Math.random() * 0.8); s.stop(t + a + dur + 0.02);
    return { s, fl, g };
  }

  // Press stamp: a pitched thump plus a short metallic slap.
  stamp(t, v, accent = false, pan = 0) {
    const dest = pan ? this.ambOut : this.musicOut;
    const k = this.osc("sine", 130, t, 0.32, null, 0.9 * v);
    k.o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.out(k.g, pan, dest);
    const sl = this.burst(t, 0.05, null, 0.25 * v, "bandpass", 2300, 2);
    this.out(sl.g, pan, dest);
    if (accent) { const c = this.osc("square", 220, t, 0.25, null, 0.06); this.out(c.g, 0, this.duck); }
    // Duck the rest on each kick.
    if (!pan && this.duck && this.level === "run") {
      const d = this.duck.gain, base = 1;
      d.setValueAtTime(base * 0.62, t); d.setTargetAtTime(base, t + 0.02, 0.07);
    }
  }
  clank(t, v) {
    for (const [f, p] of [[540, 0.12], [812, 0.09], [1236, 0.07], [1710, 0.05]]) {
      const o = this.osc("triangle", f, t, 0.16, null, p * v * 2.2); this.out(o.g, 0, this.duck);
    }
    const n = this.burst(t, 0.12, null, 0.35 * v, "bandpass", 1800, 1.4); this.out(n.g, 0, this.duck);
  }
  hiss(t, v, d) { const n = this.burst(t, d, null, v, "highpass", 7200, 0.7); this.out(n.g, 0, this.duck); }
  rattle(t, v, pan = 0) { const n = this.burst(t, 0.03, null, v, "bandpass", 4200, 3); this.out(n.g, pan, pan ? this.ambOut : this.duck); }
  bass(t, f, v) {
    const A = this.ctx, o = A.createOscillator(), fl = A.createBiquadFilter(), g = A.createGain();
    o.type = "sawtooth"; o.frequency.value = f;
    fl.type = "lowpass"; fl.Q.value = 6; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(160, t + 0.18);
    this.env(g, t, 0.006, v, 0.22);
    o.connect(fl).connect(g).connect(this.duck); o.start(t); o.stop(t + 0.26);
  }
  lead(t, f, v) {
    for (const [ty, m, p] of [["triangle", 1, 1], ["sine", 2, 0.35]]) {
      const o = this.osc(ty, f * m, t, 0.32, null, v * p, 0.01);
      o.g.connect(this.duck); o.g.connect(this.delay);
    }
  }
  pluck(t, f, v) { const o = this.osc("square", f, t, 0.12, null, v * 0.6); const fl = this.ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 2200; o.g.connect(fl).connect(this.duck); fl.connect(this.delay); }
  riser(t, dur) {
    const A = this.ctx, o = A.createOscillator(), fl = A.createBiquadFilter(), g = A.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(900, t + dur);
    fl.type = "bandpass"; fl.Q.value = 4; fl.frequency.setValueAtTime(400, t); fl.frequency.exponentialRampToValueAtTime(3200, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(fl).connect(g).connect(this.duck); o.start(t); o.stop(t + dur + 0.1);
  }
  servo(t, v, pan) {
    const A = this.ctx, o = A.createOscillator(), g = A.createGain();
    o.type = "square"; o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(520, t + 0.18); o.frequency.linearRampToValueAtTime(380, t + 0.32);
    const fl = A.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 1400;
    this.env(g, t, 0.03, v * 0.12, 0.32);
    o.connect(fl).connect(g); this.out(g, pan, this.ambOut); o.start(t); o.stop(t + 0.4);
  }
  steam(t, v, pan) { const n = this.burst(t, 0.35, null, v * 0.22, "highpass", 3000, 0.5, 0.02); this.out(n.g, pan, this.ambOut); }
  tick(t) { const o = this.osc("square", 1320, t, 0.04, null, 0.07); o.g.connect(this.musicOut); }

  /* ---------- sound effects ---------- */
  sfx(name, pan = 0) {
    if (!this.started || this.s.sfx === false) return;
    const t = this.ctx.currentTime + 0.005, D = this.sfxOut;
    const o = (ty, f, d, p, a) => { const v = this.osc(ty, f, t, d, null, p, a); this.out(v.g, pan, D); return v; };
    const nz = (d, p, ty, f, q, a, dt = 0) => { const v = this.burst(t + dt, d, null, p, ty, f, q, a); this.out(v.g, pan, D); return v; };
    if (name === "gear") { o("sine", 2637, 0.09, 0.12); o("sine", 3951, 0.06, 0.07); }
    else if (name === "screw") { for (let i = 0; i < 3; i++) nz(0.018, 0.22, "bandpass", 5200, 6, 0.001, i * 0.035); o("triangle", 1568, 0.05, 0.05); }
    else if (name === "tool") { const v = o("triangle", 660, 0.25, 0.18, 0.01); v.o.frequency.exponentialRampToValueAtTime(1320, t + 0.18); o("sine", 2637, 0.2, 0.08); }
    else if (name === "hammer") {
      for (const [f, p] of [[180, 0.4], [287, 0.25], [431, 0.18], [1150, 0.08]]) o("triangle", f, 0.35, p);
      nz(0.2, 0.5, "lowpass", 2400, 0.8); const k = o("sine", 110, 0.25, 0.7); k.o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    } else if (name === "drill") { const v = o("sawtooth", 900, 0.4, 0.06, 0.02); v.o.frequency.exponentialRampToValueAtTime(1500, t + 0.3); nz(0.3, 0.12, "bandpass", 3000, 2, 0.02); }
    else if (name === "magnet") {
      const v = o("sawtooth", 60, 0.7, 0.08, 0.05);
      const tr = this.ctx.createOscillator(), tg = this.ctx.createGain(); tr.frequency.value = 18; tg.gain.value = 0.04; tr.connect(tg).connect(v.g.gain); tr.start(t); tr.stop(t + 0.8);
      const w = nz(0.6, 0.12, "bandpass", 400, 2, 0.15); w.fl.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
    } else if (name === "jump") { const w = nz(0.14, 0.14, "bandpass", 900, 2, 0.005); w.fl.frequency.exponentialRampToValueAtTime(2600, t + 0.14); }
    else if (name === "slide") { const w = nz(0.3, 0.12, "lowpass", 2200, 1, 0.01); w.fl.frequency.exponentialRampToValueAtTime(300, t + 0.3); }
    else if (name === "hit") { nz(0.45, 0.6, "lowpass", 1600, 0.7); const k = o("sine", 90, 0.4, 0.8); k.o.frequency.exponentialRampToValueAtTime(30, t + 0.3); for (const f of [233, 377]) o("triangle", f, 0.4, 0.15); }
    else if (name === "pb") { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => { const v = this.osc("sine", f, t + i * 0.07, 0.5, null, 0.12); this.out(v.g, 0, D); }); this.sweep(); }
    else if (name === "over") { [523.25, 659.25, 783.99].forEach((f, i) => { const v = this.osc("triangle", f, t + i * 0.05, 0.4, null, 0.12); this.out(v.g, 0, D); }); this.riser(t, 0.5); }
    else if (name === "tap") o("sine", 1760, 0.03, 0.05);
    else if (name === "power") { const v = o("triangle", 440, 0.3, 0.15, 0.01); v.o.frequency.exponentialRampToValueAtTime(880, t + 0.25); }
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
