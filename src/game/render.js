/* ══ NEONVOID renderer: procedural neon vector art with cached glow sprites ══ */
import { TAU, clamp } from '../core/engine.js';
import { ARENA } from './world.js';

const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color + 'ff'); grad.addColorStop(0.35, color + '66'); grad.addColorStop(1, color + '00');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}
const hexA = (color, a) => color + Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0');

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.stars = Array.from({ length: 150 }, () => ({ x: Math.random() * ARENA.w, y: Math.random() * ARENA.h, r: Math.random() * 1.6 + 0.4, p: 0.5 + Math.random() * 0.4 }));
    this.resize();
  }
  resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1) * (this.game.quality === 'low' ? 0.75 : 1);
    const w = innerWidth, h = innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
  }
  glow(x, y, r, color, a = 1) {
    const c = this.ctx;
    c.globalAlpha = a;
    c.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    c.globalAlpha = 1;
  }

  render() {
    const { ctx, game } = this, w = game.world, cam = game.cam;
    const q = game.quality;
    const z = cam.zoom * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(z, 0, 0, z,
      this.canvas.width / 2 - cam.x * z + cam.sx * this.dpr,
      this.canvas.height / 2 - cam.y * z + cam.sy * this.dpr);

    this.drawBackground(cam);
    this.drawPickups(w);
    this.drawZones(w);
    ctx.globalCompositeOperation = 'lighter';
    this.drawParticles(w, q);
    ctx.globalCompositeOperation = 'source-over';
    this.drawEnemies(w, q);
    this.drawPlayer(w);
    ctx.globalCompositeOperation = 'lighter';
    this.drawBullets(w, q);
    this.drawBeamsArcs(w);
    ctx.globalCompositeOperation = 'source-over';
    this.drawTexts(w);
    // cursor-aim reticle
    if (game.save.settings.aim === 'cursor' && game.input.pointer.has && game.state === 'play') {
      const c = game.cursorWorld();
      ctx.strokeStyle = 'rgba(232,246,255,.75)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(c.x, c.y, 12, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x - 18, c.y); ctx.lineTo(c.x - 6, c.y); ctx.moveTo(c.x + 6, c.y); ctx.lineTo(c.x + 18, c.y);
      ctx.moveTo(c.x, c.y - 18); ctx.lineTo(c.x, c.y - 6); ctx.moveTo(c.x, c.y + 6); ctx.lineTo(c.x, c.y + 18);
      ctx.stroke();
    }
    // screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawOverlays();
  }

  drawBackground(cam) {
    const { ctx } = this;
    const vw = this.w / cam.zoom, vh = this.h / cam.zoom;
    const x0 = cam.x - vw / 2, y0 = cam.y - vh / 2;
    // nebula blooms (parallax)
    const nebs = [[900, 700, 700, '#0b3a4a'], [2400, 1700, 800, '#3a0b2e'], [1600, 400, 500, '#101a4a']];
    for (const [nx, ny, nr, col] of nebs) {
      const px = nx + (cam.x - ARENA.w / 2) * -0.25, py = ny + (cam.y - ARENA.h / 2) * -0.25;
      const g = ctx.createRadialGradient(px, py, 0, px, py, nr);
      g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
      ctx.fillStyle = g; ctx.fillRect(px - nr, py - nr, nr * 2, nr * 2);
    }
    // stars
    ctx.fillStyle = '#9fd8ff';
    for (const s of this.stars) {
      const px = s.x + (cam.x - ARENA.w / 2) * (s.p - 1) * 0.4;
      const py = s.y + (cam.y - ARENA.h / 2) * (s.p - 1) * 0.4;
      if (px < x0 - 20 || px > x0 + vw + 20 || py < y0 - 20 || py > y0 + vh + 20) continue;
      ctx.globalAlpha = 0.25 + s.p * 0.4;
      ctx.fillRect(px, py, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // grid
    ctx.strokeStyle = 'rgba(56,240,255,.1)'; ctx.lineWidth = 1 / cam.zoom;
    const step = 120;
    ctx.beginPath();
    for (let gx = Math.floor(x0 / step) * step; gx < x0 + vw + step; gx += step) { ctx.moveTo(gx, y0 - 10); ctx.lineTo(gx, y0 + vh + 10); }
    for (let gy = Math.floor(y0 / step) * step; gy < y0 + vh + step; gy += step) { ctx.moveTo(x0 - 10, gy); ctx.lineTo(x0 + vw + 10, gy); }
    ctx.stroke();
    // arena border
    ctx.strokeStyle = 'rgba(56,240,255,.4)'; ctx.lineWidth = 3;
    ctx.shadowColor = '#38f0ff'; ctx.shadowBlur = 18;
    ctx.strokeRect(0, 0, ARENA.w, ARENA.h);
    ctx.shadowBlur = 0;
  }

  drawPickups(w) {
    const { ctx } = this, t = this.game.time;
    for (const k of w.pickups.items) {
      if (k.dead) continue;
      const bob = Math.sin(t * 4 + k.x) * 2;
      const y = k.y + bob;
      switch (k.type) {
        case 'xp':
          this.glow(k.x, y, 12, '#38a6ff', 0.8);
          ctx.fillStyle = '#7fd0ff'; ctx.save(); ctx.translate(k.x, y); ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4, -4, 8, 8); ctx.restore();
          break;
        case 'coin':
          this.glow(k.x, y, 14, '#ffc93d', 0.9);
          ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(k.x, y, 6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#8a6a10'; ctx.beginPath(); ctx.arc(k.x, y, 3, 0, TAU); ctx.fill();
          break;
        case 'heart':
          this.glow(k.x, y, 16, '#ff4d6e', 0.9);
          ctx.fillStyle = '#ff7d94';
          ctx.beginPath(); ctx.arc(k.x - 3.4, y - 2, 4, 0, TAU); ctx.arc(k.x + 3.4, y - 2, 4, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(k.x - 7, y); ctx.lineTo(k.x, y + 8); ctx.lineTo(k.x + 7, y); ctx.fill();
          break;
        case 'bomb':
          this.glow(k.x, y, 16, '#ff9d3d', 0.9);
          ctx.fillStyle = '#ffb45c'; ctx.beginPath(); ctx.arc(k.x, y, 7, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(k.x + 4, y - 6); ctx.lineTo(k.x + 8, y - 10); ctx.stroke();
          break;
        case 'magnet':
          this.glow(k.x, y, 16, '#5cffd4', 0.9);
          ctx.strokeStyle = '#5cffd4'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(k.x, y, 7, Math.PI, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(k.x - 7, y); ctx.lineTo(k.x - 7, y + 6); ctx.moveTo(k.x + 7, y); ctx.lineTo(k.x + 7, y + 6); ctx.stroke();
          break;
        case 'chest':
          this.glow(k.x, y, 26, '#ffc93d', 1);
          ctx.fillStyle = '#b98a1e'; ctx.fillRect(k.x - 11, y - 8, 22, 16);
          ctx.fillStyle = '#ffd76a'; ctx.fillRect(k.x - 11, y - 8, 22, 5);
          ctx.fillStyle = '#fff3c4'; ctx.fillRect(k.x - 2, y - 4, 4, 8);
          break;
      }
    }
  }

  drawZones(w) {
    const { ctx } = this;
    for (const z of w.zones.items) {
      if (z.dead) continue;
      const a = clamp(z.life / z.maxLife, 0, 1);
      ctx.strokeStyle = hexA(z.color.startsWith('#') ? z.color : '#ff5d9e', a * 0.9);
      ctx.lineWidth = 6 * a + 2;
      ctx.shadowColor = z.color; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hexA('#ffffff', a * 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.82, 0, TAU); ctx.stroke();
    }
  }

  shapePath(ctx, shape, r) {
    ctx.beginPath();
    switch (shape) {
      case 'hex': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); break;
      case 'tri': ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.8); ctx.lineTo(-r * 0.7, -r * 0.8); ctx.closePath(); break;
      case 'sq': ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); break;
      case 'dia': ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.75, 0); ctx.closePath(); break;
      default: ctx.arc(0, 0, r * 0.8, 0, TAU);
    }
  }

  drawEnemies(w, q) {
    const { ctx } = this;
    for (const e of w.enemies.items) {
      if (e.dead) continue;
      const c = e.flash > 0.4 ? '#ffffff' : e.color;
      if (q !== 'low') this.glow(e.x, e.y, e.r * (e.boss ? 2.6 : 1.9), e.color, e.boss ? 0.85 : 0.5);
      ctx.save(); ctx.translate(e.x, e.y);
      if (e.elite || e.boss) {
        ctx.strokeStyle = hexA(e.color, 0.5 + Math.sin(this.game.time * 6) * 0.2);
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 8, 0, TAU); ctx.stroke();
      }
      ctx.rotate(e.def.behavior === 'chase' || e.def.behavior === 'swarm' ? Math.atan2(e.vy, e.vx) : e.angle);
      this.shapePath(ctx, e.def.shape, e.r);
      ctx.fillStyle = hexA(e.color, 0.13); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = e.boss ? 4.5 : 2.6;
      ctx.shadowColor = e.color; ctx.shadowBlur = q === 'low' ? 0 : 14;
      ctx.stroke(); ctx.stroke(); ctx.shadowBlur = 0;
      // inner core
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.22, 0, TAU); ctx.fill();
      ctx.restore();
      // telegraph
      if (e.telegraph > 0) {
        ctx.strokeStyle = hexA('#ffffff', 0.35 + Math.sin(this.game.time * 30) * 0.25);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.chargeA) * 620, e.y + Math.sin(e.chargeA) * 620); ctx.stroke();
      }
      // hp bar for big ones
      if ((e.boss || e.elite || e.maxHp > 80) && e.hp < e.maxHp) {
        const bw = e.r * 2.2;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw, 4);
        ctx.fillStyle = e.boss ? '#ff3d9e' : '#ff4d5e';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
      }
    }
  }

  drawPlayer(w) {
    const { ctx } = this, p = w.player;
    if (this.game.state === 'over' && p.hp <= 0) return;
    const blink = p.iframes > 0 && Math.floor(this.game.time * 20) % 2 === 0;
    // magnet ring faint
    ctx.strokeStyle = 'rgba(92,225,255,.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.magnetR * (this.game.mods.magnetMul || 1), 0, TAU); ctx.stroke();
    if (blink) return;
    // shield ring (concept-art signature circle around the ship)
    ctx.strokeStyle = 'rgba(120,235,255,.4)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,235,255,.12)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, TAU); ctx.stroke();
    this.glow(p.x, p.y, 52, '#38f0ff', 0.9);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim + Math.PI / 2); ctx.scale(1.18, 1.18);
    // thruster
    if (p.thrust > 0.15) {
      ctx.fillStyle = hexA('#7deaff', 0.55 * p.thrust);
      ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 12 + 16 * p.thrust + Math.random() * 6); ctx.lineTo(5, 12); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0, -17); ctx.lineTo(12, 12); ctx.lineTo(0, 6); ctx.lineTo(-12, 12); ctx.closePath();
    ctx.fillStyle = 'rgba(56,240,255,.3)'; ctx.fill();
    ctx.strokeStyle = p.dashT > 0 ? '#ffffff' : '#8ff4ff'; ctx.lineWidth = 2.4;
    ctx.shadowColor = '#38f0ff'; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.arc(0, -3, 3.4, 0, TAU); ctx.fill();
    ctx.restore();
    // dash shield ring
    if (p.dashT > 0) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, TAU); ctx.stroke(); }
    // hurt ring
    if (p.hurtT > 0) { ctx.strokeStyle = hexA('#ff4d5e', p.hurtT * 2); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 20 + (0.35 - p.hurtT) * 60, 0, TAU); ctx.stroke(); }
  }

  drawBullets(w, q) {
    const { ctx } = this;
    for (const b of w.bullets.items) {
      if (b.dead) continue;
      const len = b.src === 'scatter' ? 11 : 21;
      if (q !== 'low') this.glow(b.x, b.y, b.r * 4.4, b.color, 0.8);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, len * 0.6, b.r * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.ellipse(-len * 0.4, 0, len * 0.55, b.r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    for (const b of w.ebullets.items) {
      if (b.dead) continue;
      this.glow(b.x, b.y, b.r * 3.4, b.color, 0.8);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
    }
  }

  drawBeamsArcs(w) {
    const { ctx } = this;
    for (const b of w.beams) {
      const a = b.life / b.maxLife;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      const g = ctx.createLinearGradient(0, 0, b.len, 0);
      g.addColorStop(0, hexA(b.color, a)); g.addColorStop(1, hexA(b.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, -b.width * a / 2, b.len, b.width * a);
      ctx.fillStyle = hexA('#ffffff', a * 0.9);
      ctx.fillRect(0, -b.width * a / 6, b.len, b.width * a / 3);
      ctx.restore();
    }
    for (const arc of w.arcs) {
      const a = arc.life / arc.maxLife;
      ctx.strokeStyle = hexA('#7dff9e', a); ctx.lineWidth = 3 * a + 1;
      ctx.shadowColor = '#7dff9e'; ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let i = 0; i < arc.pts.length; i++) {
        const [x, y] = arc.pts[i];
        const jx = i > 0 && i < arc.pts.length - 1 ? (Math.random() - 0.5) * 14 : 0;
        i ? ctx.lineTo(x + jx, y + jx) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }

  drawParticles(w, q) {
    const { ctx } = this;
    for (const p of w.particles.items) {
      if (p.dead) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === 'ring') {
        ctx.strokeStyle = hexA(p.color.startsWith('#') ? p.color : '#ffffff', a * 0.8);
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = hexA(p.color.startsWith('#') ? p.color : '#ffffff', a);
        const s = p.size * a;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
  }

  drawTexts(w) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    for (const t of w.texts.items) {
      if (t.dead) continue;
      const a = clamp(t.life / t.maxLife, 0, 1);
      const s = (t.size + 2) * (t.crit ? 1 + (1 - a) * 0.4 : 1);
      ctx.font = `800 ${s}px ui-monospace,monospace`;
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(3,4,9,${a * 0.8})`;
      ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = hexA(t.color.startsWith('#') ? t.color : '#fff', a);
      ctx.shadowColor = t.color; ctx.shadowBlur = t.crit ? 10 : 0;
      ctx.fillText(t.txt, t.x, t.y);
      ctx.shadowBlur = 0;
    }
  }

  drawOverlays() {
    const { ctx, game } = this;
    const W = this.canvas.width, H = this.canvas.height;
    // vignette
    if (!this._vig || this._vigW !== W || this._vigH !== H) {
      this._vigW = W; this._vigH = H;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
      this._vig = g;
    }
    ctx.fillStyle = this._vig; ctx.fillRect(0, 0, W, H);
    // low hp pulse
    const p = game.world?.player;
    if (p && game.state === 'play' && p.hp / p.maxHp < 0.3) {
      const a = (0.3 - p.hp / p.maxHp) * (0.5 + Math.sin(game.time * 6) * 0.3);
      ctx.fillStyle = `rgba(255,30,60,${clamp(a * 0.35, 0, 0.3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // hit / level flash
    if (game.flash > 0) {
      ctx.fillStyle = hexA(game.flashColor || '#ffffff', game.flash * 0.5);
      ctx.fillRect(0, 0, W, H);
    }
  }
}
