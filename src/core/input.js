/* ══ NEONVOID input: keyboard + pointer (mouse/touch joystick) + gamepad ══ */
import { clamp } from './engine.js';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyK: 'dash',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.down = new Set();          // pressed this frame
    this.move = { x: 0, y: 0 };
    this.touch = false;             // true once a touch is seen (enables on-screen controls)
    this.stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.pointer = { sx: 0, sy: 0, has: false };   // mouse position (screen px) for cursor aim
    this.enabled = true;
    this.onPause = null;            // callback wired by game
    this._pointers = new Map();

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const a = KEYMAP[e.code];
      if (a) { this.held.add(a); this.down.add(a); if (a === 'pause' && this.onPause) this.onPause(); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.held.delete(a); });
    addEventListener('blur', () => { this.held.clear(); this._endStick(); });

    canvas.addEventListener('pointerdown', (e) => this._pointerDown(e));
    addEventListener('pointermove', (e) => this._pointerMove(e));
    addEventListener('pointerup', (e) => this._pointerUp(e));
    addEventListener('pointercancel', (e) => this._pointerUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pointerDown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') {
      this.touch = true;
      if (!this.stick.active) {
        this.stick.active = true; this.stick.id = e.pointerId;
        this.stick.ox = e.clientX; this.stick.oy = e.clientY; this.stick.x = 0; this.stick.y = 0;
      }
      this._pointers.set(e.pointerId, true);
    }
    e.preventDefault();
  }
  _pointerMove(e) {
    if (e.pointerType === 'mouse') { this.pointer.sx = e.clientX; this.pointer.sy = e.clientY; this.pointer.has = true; }
    if (this.stick.active && e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const m = Math.hypot(dx, dy), max = 56;
      if (m > max) { dx = dx / m * max; dy = dy / m * max; }
      this.stick.x = dx / max; this.stick.y = dy / max;
    }
  }
  _pointerUp(e) {
    if (this.stick.active && e.pointerId === this.stick.id) this._endStick();
    this._pointers.delete(e.pointerId);
  }
  _endStick() { this.stick.active = false; this.stick.id = -1; this.stick.x = 0; this.stick.y = 0; }

  /* virtual buttons from DOM (mobile dash / pause) */
  press(action) { this.held.add(action); this.down.add(action); }
  release(action) { this.held.delete(action); }

  update() {
    // keyboard
    let x = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    let y = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
    // touch joystick overrides
    if (this.stick.active && (this.stick.x || this.stick.y)) { x = this.stick.x; y = this.stick.y; }
    // gamepad
    const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (gp) {
      const gx = gp.axes[0] || 0, gy = gp.axes[1] || 0;
      if (Math.hypot(gx, gy) > 0.22) { x = gx; y = gy; }
      if (gp.buttons[0]?.pressed || gp.buttons[5]?.pressed) this.held.add('dash');
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.move.x = x; this.move.y = y;
  }
  endFrame() { this.down.clear(); }
  justPressed(a) { return this.down.has(a); }
  isHeld(a) { return this.held.has(a); }
  get stickScreen() { // where to draw the virtual stick (CSS px)
    return this.stick.active ? { x: this.stick.ox, y: this.stick.oy, dx: this.stick.x * 56, dy: this.stick.y * 56 } : null;
  }
}
