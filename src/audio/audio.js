/* ══ NEONVOID audio: 100% procedural WebAudio — SFX synth + layered step-sequencer music ══ */
const NOTE = { A1: 55, C2: 65.41, D2: 73.42, E2: 82.41, G2: 98, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, E5: 659.25 };

class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false;
    this.sfxVol = 0.85; this.musicVol = 0.55; this.muted = false;
    this.intensity = 0; this._step = 0; this._next = 0; this._timer = 0;
    this._throttle = {};
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 8;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol;
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol * 0.9;
    this.sfxBus.connect(this.comp); this.musicBus.connect(this.comp);
    this.comp.connect(this.master); this.master.connect(c.destination);
    // shared noise buffer
    const len = c.sampleRate * 1.2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ready = true;
    this._timer = setInterval(() => this._schedule(), 40);
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 1; }
  setSfx(v) { this.sfxVol = v; if (this.sfxBus) this.sfxBus.gain.value = v; }
  setMusic(v) { this.musicVol = v; if (this.musicBus) this.musicBus.gain.value = v * 0.9; }

  /* ---- synth primitives ---- */
  _env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  tone({ f = 440, f2 = 0, dur = 0.15, type = 'square', vol = 0.3, at = 0, bus }) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    this._env(g, t, 0.005, dur, vol);
    o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noise({ dur = 0.2, vol = 0.3, freq = 1200, q = 1, type = 'bandpass', f2 = 0, at = 0 }) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur);
    const g = c.createGain(); this._env(g, t, 0.004, dur, vol);
    s.connect(fl); fl.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + dur + 0.05);
  }
  /* throttled high-frequency sfx (xp pickups etc.) */
  _ok(name, ms) { const n = performance.now(); if (this._throttle[name] && n - this._throttle[name] < ms) return false; this._throttle[name] = n; return true; }

  sfx(name, opt = {}) {
    if (!this.ready || this.muted) return;
    const p = opt.pitch || 1;
    switch (name) {
      case 'shoot': this.tone({ f: 620 * p, f2: 220, dur: 0.09, type: 'square', vol: 0.12 }); break;
      case 'scatter': this.noise({ dur: 0.12, vol: 0.16, freq: 900, f2: 300 }); this.tone({ f: 300, f2: 120, dur: 0.1, vol: 0.12 }); break;
      case 'rail': this.tone({ f: 180, f2: 1400, dur: 0.22, type: 'sawtooth', vol: 0.16 }); this.noise({ dur: 0.2, vol: 0.1, freq: 3000, f2: 600 }); break;
      case 'missile': this.noise({ dur: 0.3, vol: 0.12, freq: 500, f2: 2400, type: 'lowpass' }); break;
      case 'chain': this.tone({ f: 1500 * p, f2: 400, dur: 0.12, type: 'sawtooth', vol: 0.1 }); this.noise({ dur: 0.08, vol: 0.08, freq: 4000 }); break;
      case 'nova': this.tone({ f: 120, f2: 60, dur: 0.35, type: 'sine', vol: 0.3 }); this.noise({ dur: 0.3, vol: 0.12, freq: 800, f2: 120 }); break;
      case 'hit': if (this._ok('hit', 30)) this.noise({ dur: 0.05, vol: 0.1, freq: 2200 * p, q: 2 }); break;
      case 'crit': this.noise({ dur: 0.07, vol: 0.16, freq: 3200, q: 3 }); this.tone({ f: 900, f2: 300, dur: 0.08, vol: 0.1 }); break;
      case 'die': if (this._ok('die', 40)) { this.noise({ dur: 0.18, vol: 0.16, freq: 700, f2: 90 }); this.tone({ f: 220 * p, f2: 60, dur: 0.16, type: 'triangle', vol: 0.12 }); } break;
      case 'boom': this.noise({ dur: 0.5, vol: 0.34, freq: 900, f2: 60, type: 'lowpass' }); this.tone({ f: 90, f2: 34, dur: 0.5, type: 'sine', vol: 0.34 }); break;
      case 'hurt': this.tone({ f: 260, f2: 70, dur: 0.28, type: 'sawtooth', vol: 0.3 }); this.noise({ dur: 0.2, vol: 0.2, freq: 500, f2: 120 }); break;
      case 'xp': if (this._ok('xp', 55)) this.tone({ f: 880 * p, f2: 1320 * p, dur: 0.06, type: 'sine', vol: 0.06 }); break;
      case 'coin': this.tone({ f: 988, dur: 0.06, type: 'square', vol: 0.12 }); this.tone({ f: 1319, dur: 0.14, type: 'square', vol: 0.12, at: 0.06 }); break;
      case 'heal': this.tone({ f: 523, dur: 0.1, type: 'sine', vol: 0.16 }); this.tone({ f: 784, dur: 0.18, type: 'sine', vol: 0.16, at: 0.09 }); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.16, type: 'triangle', vol: 0.2, at: i * 0.07 })); break;
      case 'dash': this.noise({ dur: 0.22, vol: 0.16, freq: 400, f2: 3200, type: 'bandpass', q: 1.4 }); break;
      case 'ui': this.tone({ f: 700, f2: 900, dur: 0.06, type: 'square', vol: 0.1 }); break;
      case 'deny': this.tone({ f: 220, f2: 160, dur: 0.14, type: 'square', vol: 0.14 }); break;
      case 'chest': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.2, type: 'triangle', vol: 0.18, at: i * 0.06 })); break;
      case 'boss': this.tone({ f: 70, f2: 45, dur: 1.1, type: 'sawtooth', vol: 0.34 }); this.noise({ dur: 0.9, vol: 0.16, freq: 300, f2: 80, type: 'lowpass' }); break;
      case 'gameover': [440, 349, 293, 220].forEach((f, i) => this.tone({ f, dur: 0.4, type: 'sawtooth', vol: 0.18, at: i * 0.18 })); break;
      case 'revive': [261, 392, 523, 659, 784].forEach((f, i) => this.tone({ f, dur: 0.24, type: 'triangle', vol: 0.2, at: i * 0.08 })); break;
      case 'ad': this.tone({ f: 660, dur: 0.08, type: 'sine', vol: 0.12 }); this.tone({ f: 880, dur: 0.12, type: 'sine', vol: 0.12, at: 0.08 }); break;
    }
  }

  /* ---- music: 16-step sequencer, layers appear with intensity (0..1) ---- */
  setIntensity(v) { this.intensity = v; }
  _schedule() {
    if (!this.ready || this.muted || !this.musicBus) return;
    if (this.ctx.state !== 'running') return;
    const spb = 60 / 132 / 4;                 // 16th notes @132bpm
    if (this._next < this.ctx.currentTime) this._next = this.ctx.currentTime + 0.05;
    while (this._next < this.ctx.currentTime + 0.15) {
      this._playStep(this._step, this._next, spb);
      this._next += spb; this._step = (this._step + 1) % 64;
    }
  }
  _playStep(s, t, spb) {
    const I = this.intensity, bar = (s / 16) | 0, st = s % 16;
    const bus = this.musicBus, c = this.ctx;
    const mk = (type, f, dur, vol, filt) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      let node = o;
      if (filt) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filt; o.connect(fl); node = fl; }
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      node.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    };
    // pad: one chord per bar
    if (st === 0) {
      const chords = [[NOTE.A2, NOTE.C3, NOTE.E3], [NOTE.C2, NOTE.G2, NOTE.C3], [NOTE.D2, NOTE.A2, NOTE.D3], [NOTE.E2, NOTE.G2, NOTE.B ? 246 : NOTE.B || 246.94]];
      const ch = chords[bar % 4];
      ch.forEach(f => mk('sawtooth', f, spb * 15, 0.035, 700 + I * 900));
    }
    // bass
    if (I > 0.12 && (st % 4 === 0 || st === 6 || st === 14)) {
      const line = [NOTE.A1, NOTE.A1, NOTE.C2, NOTE.G2][bar % 4];
      mk('square', st === 14 ? line * 2 : line, spb * 1.8, 0.09, 420);
    }
    // kick
    if (I > 0.3 && st % 4 === 0) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2);
    }
    // hats
    if (I > 0.5 && st % 2 === 1) {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const fl = c.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 7000;
      const g = c.createGain(); g.gain.setValueAtTime(st % 4 === 3 ? 0.09 : 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(fl); fl.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.08);
    }
    // arp lead
    if (I > 0.68) {
      const arp = [NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.G4];
      if (st % 2 === 0) mk('triangle', arp[(st / 2 + bar) % 8], spb * 1.4, 0.05, 2600);
    }
  }
}
export const audio = new AudioEngine();
