// ---------------------------------------------------------------------------
// Sound effects: tiny Web Audio synth (no audio assets required).
// ---------------------------------------------------------------------------

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
    }
  }

  /** Must be called from a user gesture at least once (autoplay policy). */
  unlock() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(m) {
    this.muted = !!m;
  }

  get mutedState() {
    return this.muted;
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _tone(freq, dur, type, vol, delay = 0, slide = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this._now() + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  swap()      { this._tone(520, 0.07, 'triangle', 0.16); }
  invalid()   { this._tone(200, 0.14, 'square', 0.10, 0, -60); }
  match(n)    {
    const base = 400 + Math.min(n, 8) * 60;
    this._tone(base, 0.12, 'sine', 0.20);
    this._tone(base * 1.5, 0.16, 'sine', 0.16, 0.06);
  }
  cascade()   { this._tone(660, 0.08, 'triangle', 0.16); this._tone(880, 0.10, 'triangle', 0.14, 0.05); }
  special()   { this._tone(300, 0.10, 'sawtooth', 0.12, 0, 200); this._tone(760, 0.16, 'sine', 0.18, 0.05); }
  boom()      { this._tone(180, 0.30, 'sawtooth', 0.24, 0, -90); this._tone(90, 0.34, 'square', 0.18, 0.02, -40); }
  star(n)     { this._tone(660 + n * 120, 0.14, 'sine', 0.20); this._tone(660 + n * 120 + 240, 0.2, 'sine', 0.16, 0.07); }
  click()     { this._tone(880, 0.05, 'sine', 0.14); }
  win()       {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.20, i * 0.09));
  }
  lose()      {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this._tone(f, 0.28, 'triangle', 0.18, i * 0.12));
  }
}

export const sfx = new Sfx();
