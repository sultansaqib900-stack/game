/* ══ NEONVOID core engine: math, rng, events, pooling, spatial grid, loop, storage ══ */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const approach = (cur, target, d) => (cur < target ? Math.min(cur + d, target) : Math.max(cur - d, target));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const angleLerp = (a, b, t) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; };
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
export const fmtNum = (n) => {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

/* Seeded RNG (mulberry32) — used for run variety & reproducible debug seeds */
export class RNG {
  constructor(seed = (Math.random() * 0xffffffff) >>> 0) { this.s = seed >>> 0; }
  next() { this.s = (this.s + 0x6d2b79f5) >>> 0; let t = this.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[(this.next() * arr.length) | 0]; }
  chance(p) { return this.next() < p; }
}

/* Tiny event bus */
export class Bus {
  constructor() { this.map = new Map(); }
  on(evt, fn) { let a = this.map.get(evt); if (!a) this.map.set(evt, (a = [])); a.push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { const a = this.map.get(evt); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(evt, payload) { const a = this.map.get(evt); if (a) for (let i = 0; i < a.length; i++) a[i](payload); }
}

/* Object pool: obtain/release with dead-flag; iterate .items skipping dead */
export class Pool {
  constructor(factory) { this.factory = factory; this.items = []; this.free = []; }
  obtain() { let o = this.free.pop(); if (!o) { o = this.factory(); this.items.push(o); } o.dead = false; return o; }
  release(o) { if (!o.dead) { o.dead = true; if (this.free.length < 8192) this.free.push(o); } }
  get alive() { let n = 0; for (const o of this.items) if (!o.dead) n++; return n; }
  purge() { this.items = this.items.filter(o => !o.dead); }
}

/* Uniform-grid spatial hash over a bounded arena (enemies live here) */
export class Grid {
  constructor(w, h, cell = 96) {
    this.cell = cell; this.w = w; this.h = h;
    this.cols = Math.ceil(w / cell); this.rows = Math.ceil(h / cell);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }
  clear() { for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0; }
  _idx(x, y) {
    const cx = clamp((x / this.cell) | 0, 0, this.cols - 1);
    const cy = clamp((y / this.cell) | 0, 0, this.rows - 1);
    return cx + cy * this.cols;
  }
  insert(e) { this.cells[this._idx(e.x, e.y)].push(e); }
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = clamp(((x - r) / c) | 0, 0, this.cols - 1), x1 = clamp(((x + r) / c) | 0, 0, this.cols - 1);
    const y0 = clamp(((y - r) / c) | 0, 0, this.rows - 1), y1 = clamp(((y + r) / c) | 0, 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = this.cells[cx + cy * this.cols];
      for (let i = 0; i < b.length; i++) out.push(b[i]);
    }
    return out;
  }
}

/* Fixed-timestep loop with accumulator; render receives interpolation alpha */
export class Loop {
  constructor({ update, render, step = 1 / 60, maxSteps = 5 }) {
    this.update = update; this.render = render; this.step = step; this.maxSteps = maxSteps;
    this.acc = 0; this.last = 0; this.running = false; this.raf = 0;
    this._frame = this._frame.bind(this);
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this._frame); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  _frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) { this.update(this.step); this.acc -= this.step; steps++; }
    if (steps === this.maxSteps) this.acc = 0;
    this.render(this.acc / this.step, dt);
    this.raf = requestAnimationFrame(this._frame);
  }
}

/* Namespaced localStorage with JSON + try/catch (private mode safe) */
export const Store = {
  ns: 'neonvoid:v1:',
  get(key, def) {
    try { const v = localStorage.getItem(this.ns + key); return v === null ? def : JSON.parse(v); }
    catch { return def; }
  },
  set(key, val) { try { localStorage.setItem(this.ns + key, JSON.stringify(val)); } catch { /* full/blocked */ } },
  del(key) { try { localStorage.removeItem(this.ns + key); } catch {} },
};
