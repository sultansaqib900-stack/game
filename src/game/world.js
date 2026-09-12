/* ══ NEONVOID world simulation: pools, collisions, weapons, enemy AI, bosses ══ */
import { TAU, Pool, Grid, clamp, rand, randInt, chance, dist, angleTo, angleLerp, pick } from '../core/engine.js';
import { ENEMIES, BOSSES } from './content.js';
import { audio } from '../audio/audio.js';

export const ARENA = { w: 3200, h: 2400 };

export class World {
  constructor(game) {
    this.game = game;
    this.grid = new Grid(ARENA.w, ARENA.h, 100);
    this.enemies = new Pool(() => ({}));
    this.bullets = new Pool(() => ({}));
    this.ebullets = new Pool(() => ({}));
    this.pickups = new Pool(() => ({}));
    this.particles = new Pool(() => ({}));
    this.texts = new Pool(() => ({}));
    this.zones = new Pool(() => ({}));
    this.beams = []; this.arcs = [];
    this.eid = 0;
    this._q = []; this._q2 = [];
  }

  reset() {
    for (const p of [this.enemies, this.bullets, this.ebullets, this.pickups, this.particles, this.texts, this.zones]) {
      for (const o of p.items) o.dead = true;
      p.free = p.items.slice();
    }
    this.beams.length = 0; this.arcs.length = 0;
    this.eid = 0;
    this.player = this.makePlayer();
  }

  makePlayer() {
    const m = this.game.mods;
    const maxHp = Math.round((110 + (m.hpAdd || 0)) * (m.hpMul || 1));
    return {
      x: ARENA.w / 2, y: ARENA.h / 2, vx: 0, vy: 0, r: 14,
      hp: maxHp, maxHp, speed: 250, aim: -Math.PI / 2,
      level: 1, xp: 0, coins: 0, kills: 0, dmgDealt: 0, streak: 0, bestStreak: 0, streakT: 0,
      weapons: [], passives: {}, orbitals: [], drones: [],
      dashCd: 0, dashT: 0, dashCdMax: 3.2, iframes: 0, hurtT: 0, regenT: 0,
      magnetR: 90, thrust: 0,
    };
  }

  /* aim helper: nearest-enemy auto-aim, or cursor aim when Settings → AIM: CURSOR */
  aimAngleFrom(x, y) {
    if (this.game.save.settings.aim === 'cursor' && this.game.input.pointer.has) {
      const c = this.game.cursorWorld();
      return Math.atan2(c.y - y, c.x - x);
    }
    const t = this.nearest(x, y, 900);
    return t ? angleTo(x, y, t.x, t.y) : this.player.aim;
  }
  aimAngle(p) { return this.aimAngleFrom(p.x, p.y); }

  /* ── helpers exposed to weapon fire() ─────────────────────────── */
  sfx(n, o) { audio.sfx(n, o); }
  shake(v) { this.game.shake(v); }
  spawnBullet(o) {
    const b = this.bullets.obtain();
    b.x = o.x; b.y = o.y; b.a = o.a; b.speed = o.speed; b.dmg = o.dmg; b.pierce = o.pierce || 0;
    b.life = o.life; b.maxLife = o.life; b.r = o.r || 5; b.color = o.color || '#fff'; b.knock = o.knock || 0;
    b.crit = o.crit || 0; b.homing = o.homing || 0; b.splash = o.splash || 0; b.src = o.src || '';
    b.trail = !!o.trail; b.cluster = !!o.cluster;
    b.vx = Math.cos(o.a) * o.speed; b.vy = Math.sin(o.a) * o.speed;
    if (!b.hit) b.hit = new Set(); else b.hit.clear();
    return b;
  }
  nearest(x, y, r, exclude) {
    const q = this.grid.query(x, y, r, this._q);
    let best = null, bd = r * r;
    for (const e of q) {
      if (e.dead || (exclude && exclude.has(e))) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  queryEnemies(x, y, r, out) { return this.grid.query(x, y, r, out || this._q2); }
  burst(x, y, color, n = 8, speed = 180, size = 3) {
    const cap = this.game.quality === 'low' ? 140 : this.game.quality === 'med' ? 320 : 620;
    if (this.particles.alive > cap) return;
    for (let i = 0; i < n; i++) {
      const p = this.particles.obtain(), a = rand(0, TAU), s = rand(speed * 0.3, speed);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.maxLife = rand(0.25, 0.6); p.color = color; p.size = rand(size * 0.6, size * 1.5); p.type = 'dot'; p.drag = 4;
    }
  }
  ring(x, y, color, r0 = 6, r1 = 60, life = 0.4) {
    const p = this.particles.obtain();
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.life = p.maxLife = life; p.color = color; p.size = r0; p.grow = r1; p.type = 'ring'; p.drag = 0;
  }
  addText(x, y, txt, color, size = 14, crit = false) {
    if (this.texts.alive > 60) return;
    const t = this.texts.obtain();
    t.x = x + rand(-6, 6); t.y = y - 8; t.txt = txt; t.color = color; t.size = size; t.crit = crit;
    t.life = t.maxLife = crit ? 0.9 : 0.7; t.vy = -60;
  }
  chainArc(pts) { this.arcs.push({ pts, life: 0.22, maxLife: 0.22 }); }
  addBeam(o) { this.beams.push({ ...o, life: 0.22, maxLife: 0.22 }); }
  fireBeam(o) {
    this.addBeam(o);
    const mx = o.x + Math.cos(o.a) * o.len / 2, my = o.y + Math.sin(o.a) * o.len / 2;
    const q = this.queryEnemies(mx, my, o.len / 2 + 80);
    const ca = Math.cos(o.a), sa = Math.sin(o.a);
    for (const e of q) {
      if (e.dead) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      const along = dx * ca + dy * sa;
      if (along < -e.r || along > o.len + e.r) continue;
      const perp = Math.abs(-dx * sa + dy * ca);
      if (perp < o.width / 2 + e.r) {
        this.damageEnemy(e, o.dmg, { critChance: o.crit, knock: o.knock, kx: ca, ky: sa, color: o.color, src: 'rail' });
        if (o.burn) { e.burn = o.burn; e.burnDps = o.dmg * 0.35; }
      }
    }
  }
  splash(x, y, r, dmg, color, o = {}) {
    this.ring(x, y, color, 8, r, 0.35);
    this.burst(x, y, color, 14, 260, 3.4);
    const q = this.queryEnemies(x, y, r + 40);
    for (const e of q) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < r + e.r) {
        const fall = 1 - 0.5 * (d / (r + e.r));
        this.damageEnemy(e, dmg * fall, { knock: 120, kx: (e.x - x) / (d || 1), ky: (e.y - y) / (d || 1), color, src: o.src || 'splash' });
      }
    }
    this.shake(3);
  }
  spawnZone(o) { const z = this.zones.obtain(); Object.assign(z, o); z.life = o.life || 0.5; z.maxLife = z.life; if (!z.hits) z.hits = new Set(); else z.hits.clear(); return z; }

  /* ── spawning ─────────────────────────────────────────────────── */
  spawnEnemy(typeId, x, y, o = {}) {
    const def = ENEMIES[typeId];
    const e = this.enemies.obtain();
    const t = this.game.time;
    const scale = 1 + Math.pow(t / 120, 1.15) * 0.45 + t / 420;
    e.id = ++this.eid; e.type = typeId; e.def = def;
    e.x = clamp(x, 20, ARENA.w - 20); e.y = clamp(y, 20, ARENA.h - 20);
    e.vx = 0; e.vy = 0;
    e.maxHp = e.hp = Math.round(def.hp * scale * (o.hpMul || 1));
    e.r = def.r; e.color = def.color; e.flash = 0; e.slow = 0; e.slowT = 0; e.stun = 0;
    e.burn = 0; e.burnDps = 0; e.angle = rand(0, TAU); e.spin = rand(-2, 2);
    e.t = rand(0, 2); e.cd = def.fireCd ? rand(0.5, def.fireCd) : 0; e.blink = def.blinkCd || 0;
    e.state = 0; e.touchCd = 0; e.elite = !!def.elite || !!o.elite; e.boss = false;
    e.knockResist = def.knockResist || 0;
    if (e.elite) { e.maxHp = e.hp = Math.round(e.hp * 2.4); e.r *= 1.25; }
    return e;
  }
  spawnBoss(idx) {
    const def = BOSSES[idx];
    const e = this.spawnEnemy('grunt', this.player.x, this.player.y < ARENA.h / 2 ? this.player.y + 500 : this.player.y - 500);
    e.type = def.id;
    e.def = { ...def, behavior: 'boss', shape: 'hex', dmg: 20 + idx * 6, xp: 150 + idx * 120, coin: 6, speed: def.speed };
    e.boss = true; e.bossIdx = idx;
    e.maxHp = e.hp = def.hp; e.r = def.r; e.color = def.color; e.knockResist = 1; e.elite = false;
    e.patterns = def.patterns; e.pi = 0; e.pt = 2; e.spiralA = 0; e.telegraph = 0; e.name = def.name;
    this.game.onBoss(e);
    audio.sfx('boss'); this.shake(10);
    return e;
  }
  spawnPickup(type, x, y, value = 1) {
    const p = this.pickups.obtain();
    p.type = type; p.x = x; p.y = y; p.value = value; p.t = 0;
    p.vx = rand(-40, 40); p.vy = rand(-40, 40);
    return p;
  }

  /* ── damage pipeline ──────────────────────────────────────────── */
  damageEnemy(e, amount, o = {}) {
    if (e.dead) return 0;
    const p = this.player, m = this.game.mods;
    let dmg = amount * (m.dmgMul || 1);
    let crit = o.crit;
    if (crit === undefined) crit = Math.random() < (o.critChance || 0);
    if (crit) dmg *= (1.6 + (m.critDmgAdd || 0));
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg; e.flash = 1;
    p.dmgDealt += dmg;
    this.addText(e.x, e.y - e.r, String(dmg), crit ? '#ffd23d' : '#ffffff', crit ? 19 : 13, crit);
    if (crit) audio.sfx('crit'); else audio.sfx('hit');
    if (o.knock && e.knockResist < 1) {
      const k = o.knock * (1 - e.knockResist);
      const kx = o.kx !== undefined ? o.kx : Math.cos(o.ka || 0), ky = o.ky !== undefined ? o.ky : Math.sin(o.ka || 0);
      e.vx += kx * k; e.vy += ky * k;
    }
    if (o.stun) e.stun = Math.max(e.stun, o.stun);
    if (o.slow) { e.slow = Math.max(e.slow, o.slow); e.slowT = Math.max(e.slowT, o.slow || 0.9); }
    if (e.hp <= 0) this.killEnemy(e, o);
    return dmg;
  }
  killEnemy(e, o = {}) {
    if (e.dead) return;
    const p = this.player, m = this.game.mods, def = e.def;
    this.enemies.release(e);
    p.kills++; p.streak++; p.streakT = 3; p.bestStreak = Math.max(p.bestStreak, p.streak);
    this.burst(e.x, e.y, e.color, e.boss ? 46 : e.r > 18 ? 18 : 9, e.boss ? 420 : 220, e.boss ? 4 : 3);
    this.ring(e.x, e.y, e.color, e.r * 0.6, e.r * (e.boss ? 5 : 2.2), e.boss ? 0.7 : 0.35);
    audio.sfx(e.boss ? 'boom' : 'die', { pitch: clamp(1.4 - e.r / 40, 0.6, 1.6) });
    if (e.boss) { this.shake(14); this.game.onBossDead(e); }
    else this.shake(Math.min(3, e.r / 9));
    // drops
    const xpVal = (def.xp || 1) * (e.elite ? 3 : 1);
    if (e.r <= 8) this.addXpDirect(xpVal); else this.spawnPickup('xp', e.x, e.y, xpVal);
    const coinChance = (def.coin || 0.05) * (1 + (m.dropAdd || 0)) * (e.elite ? 8 : 1);
    if (chance(coinChance)) this.spawnPickup('coin', e.x, e.y, e.elite ? randInt(8, 16) : 1);
    if (chance(0.006 + (m.dropAdd || 0) * 0.05)) this.spawnPickup('heart', e.x, e.y, 1);
    if (chance(0.004 + (m.dropAdd || 0) * 0.04)) this.spawnPickup('bomb', e.x, e.y, 1);
    if (chance(0.005 + (m.dropAdd || 0) * 0.04)) this.spawnPickup('magnet', e.x, e.y, 1);
    if (def.chest || (e.elite && chance(0.5))) this.spawnPickup('chest', e.x, e.y, 1);
    if (def.split) for (let i = 0; i < def.split; i++) {
      const c = this.spawnEnemy('grunt', e.x + rand(-24, 24), e.y + rand(-24, 24), { hpMul: 0.6 });
      c.maxHp = c.hp = Math.max(6, Math.round(c.hp * 0.5));
    }
    if ((m.leechAdd || 0) && chance(m.leechAdd)) this.healPlayer(1);
  }
  addXpDirect(v) { this.game.gainXp(v * (this.game.mods.xpMul || 1)); }
  healPlayer(v) { const p = this.player; if (p.hp >= p.maxHp) return; p.hp = Math.min(p.maxHp, p.hp + v); if (v >= 1) { audio.sfx('heal'); this.ring(p.x, p.y, '#ff8fb0', 10, 40, 0.4); } }
  damagePlayer(amount, src = '') {
    const p = this.player, m = this.game.mods;
    if (p.iframes > 0 || p.dashT > 0 || this.game.state !== 'play') return;
    const dmg = Math.max(1, Math.round(amount - (m.armorAdd || 0)));
    p.hp -= dmg; p.iframes = 0.9; p.hurtT = 0.35; p.streak = 0;
    this.addText(p.x, p.y - 20, '-' + dmg, '#ff4d5e', 17);
    this.burst(p.x, p.y, '#ff4d5e', 12, 240, 3);
    this.shake(7); audio.sfx('hurt');
    this.game.onPlayerHurt(dmg);
    if (p.hp <= 0) this.game.onPlayerDeath();
  }

  /* ── main update ──────────────────────────────────────────────── */
  update(dt) {
    const p = this.player, m = this.game.mods;
    this.updatePlayer(dt);
    this.updateWeapons(dt);
    this.grid.clear();
    for (const e of this.enemies.items) if (!e.dead) this.grid.insert(e);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateEBullets(dt);
    this.updateZones(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    // regen (small base sustain so early mistakes aren't fatal)
    const regen = (m.regenAdd || 0) + 0.35;
    if (regen > 0) { p.regenT += dt; if (p.regenT >= 1) { p.regenT -= 1; this.healPlayer(regen); } }
    // streak decay
    if (p.streakT > 0) { p.streakT -= dt; if (p.streakT <= 0) p.streak = 0; }
    // periodic pool compaction (keeps long runs lean)
    this.purgeT = (this.purgeT || 0) + dt;
    if (this.purgeT > 10) {
      this.purgeT = 0;
      for (const pool of [this.enemies, this.bullets, this.ebullets, this.pickups, this.particles, this.texts, this.zones]) pool.purge();
    }
  }

  updatePlayer(dt) {
    const p = this.player, inp = this.game.input;
    p.iframes = Math.max(0, p.iframes - dt); p.hurtT = Math.max(0, p.hurtT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    const m = this.game.mods;
    const spd = p.speed * (m.spdMul || 1);
    let ax = inp.move.x, ay = inp.move.y;
    if (inp.move.x || inp.move.y) p.aim = Math.atan2(inp.move.y, inp.move.x);
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDirX * 900; p.vy = p.dashDirY * 900;
      if (chance(0.7)) this.burst(p.x, p.y, '#5ce1ff', 2, 60, 2.4);
    } else {
      const target = { x: ax * spd, y: ay * spd };
      p.vx += (target.x - p.vx) * Math.min(1, dt * 14);
      p.vy += (target.y - p.vy) * Math.min(1, dt * 14);
    }
    p.x = clamp(p.x + p.vx * dt, p.r, ARENA.w - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, ARENA.h - p.r);
    p.thrust = Math.hypot(p.vx, p.vy) / spd;
    // dash trigger
    if (inp.justPressed('dash') && p.dashCd <= 0 && (ax || ay)) {
      p.dashT = 0.18; p.dashCd = p.dashCdMax * (m.dashMul || 1);
      const l = Math.hypot(ax, ay) || 1;
      p.dashDirX = ax / l; p.dashDirY = ay / l;
      audio.sfx('dash'); this.ring(p.x, p.y, '#5ce1ff', 8, 46, 0.3);
    }
  }

  statFor(weaponInst) { return this.game.weaponStats(weaponInst); }

  updateWeapons(dt) {
    const p = this.player;
    for (const inst of p.weapons) {
      const s = this.statFor(inst);
      if (inst.def.id === 'orbit') { this.updateOrbitals(inst, s, dt); continue; }
      if (inst.def.id === 'drone') { this.updateDrones(inst, s, dt); continue; }
      if (inst.def.id === 'aura') { this.updateAura(inst, s, dt); continue; }
      inst.cd -= dt;
      if (inst.cd <= 0) { inst.cd = s.cd; inst.def.fire(this, s, p); }
    }
  }
  updateOrbitals(inst, s, dt) {
    const p = this.player;
    while (p.orbitals.length < s.count) p.orbitals.push({ a: rand(0, TAU), hit: new Map() });
    p.orbitals.length = Math.min(p.orbitals.length, s.count);
    const R = s.orbitR;
    for (const o of p.orbitals) {
      o.a += s.speed * dt;
      const bx = p.x + Math.cos(o.a) * R, by = p.y + Math.sin(o.a) * R;
      o.x = bx; o.y = by;
      const q = this.queryEnemies(bx, by, 26 * s.area);
      for (const e of q) {
        if (e.dead) continue;
        const last = o.hit.get(e.id) || -9;
        if (this.game.time - last < s.hitCd) continue;
        if (dist(bx, by, e.x, e.y) < 14 * s.area + e.r) {
          o.hit.set(e.id, this.game.time);
          this.damageEnemy(e, s.dmg, { critChance: s.crit, knock: s.knock, ka: angleTo(bx, by, e.x, e.y), color: '#c46bff', src: 'orbit' });
        }
      }
    }
  }
  updateDrones(inst, s, dt) {
    const p = this.player;
    while (p.drones.length < s.count) p.drones.push({ a: rand(0, TAU), cd: rand(0, s.cd) });
    p.drones.length = Math.min(p.drones.length, s.count);
    for (let i = 0; i < p.drones.length; i++) {
      const d = p.drones[i];
      d.a += s.orbitSpeed * dt;
      d.x = p.x + Math.cos(d.a) * s.orbitR; d.y = p.y + Math.sin(d.a) * s.orbitR;
      d.cd -= dt;
      if (d.cd <= 0) {
        const cursor = this.game.save.settings.aim === 'cursor';
        if (cursor || this.nearest(d.x, d.y, 700)) {
          d.cd = s.cd;
          const a = this.aimAngleFrom(d.x, d.y);
          this.spawnBullet({ x: d.x, y: d.y, a, speed: s.speed, dmg: s.dmg, pierce: s.pierce, life: s.life, r: 4 * s.area, color: '#5cffd4', knock: s.knock, crit: s.crit, src: 'drone' });
          audio.sfx('shoot', { pitch: 1.4 });
        }
      }
    }
  }
  updateAura(inst, s, dt) {
    const p = this.player;
    inst.cd -= dt;
    if (inst.cd > 0) return;
    inst.cd = s.cd;
    const R = s.radius * (this.game.mods.areaMul || 1);
    const q = this.queryEnemies(p.x, p.y, R + 40);
    for (const e of q) {
      if (e.dead) continue;
      if (dist(p.x, p.y, e.x, e.y) < R + e.r) {
        this.damageEnemy(e, s.dmg, { critChance: 0, color: '#ff7a3d', src: 'aura' });
        e.slow = Math.max(e.slow, s.slow); e.slowT = Math.max(e.slowT, 0.6);
      }
    }
    if (q.length) this.ring(p.x, p.y, 'rgba(255,122,61,.5)', R * 0.7, R, 0.3);
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies.items) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.touchCd = Math.max(0, e.touchCd - dt);
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.burn > 0) { e.burn -= dt; e.hp -= e.burnDps * dt; if (e.hp <= 0) { this.killEnemy(e); continue; } }
      if (e.stun > 0) { e.stun -= dt; e.vx *= 0.9; e.vy *= 0.9; e.x += e.vx * dt; e.y += e.vy * dt; continue; }
      const slowMul = 1 - (e.slow || 0);
      const spd = e.def.speed * slowMul;
      const d = dist(e.x, e.y, p.x, p.y);
      const a = angleTo(e.x, e.y, p.x, p.y);
      e.angle += e.spin * dt;
      let mx = 0, my = 0;
      switch (e.def.behavior) {
        case 'chase': mx = Math.cos(a) * spd; my = Math.sin(a) * spd; break;
        case 'swarm': { const w = Math.sin(this.game.time * 6 + e.id) * 0.7; mx = Math.cos(a + w) * spd; my = Math.sin(a + w) * spd; break; }
        case 'ranged': {
          const keep = e.def.keep || 260;
          if (d > keep + 40) { mx = Math.cos(a) * spd; my = Math.sin(a) * spd; }
          else if (d < keep - 60) { mx = -Math.cos(a) * spd; my = -Math.sin(a) * spd; }
          else { mx = Math.cos(a + Math.PI / 2) * spd * 0.7; my = Math.sin(a + Math.PI / 2) * spd * 0.7; }
          e.cd -= dt;
          if (e.cd <= 0 && d < 620) {
            e.cd = e.def.fireCd;
            const b = this.ebullets.obtain();
            b.x = e.x; b.y = e.y; b.a = a; b.speed = e.def.projSpeed; b.dmg = e.def.dmg; b.r = 7; b.life = 3.4; b.color = e.color;
            b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
            audio.sfx('shoot', { pitch: 0.6 });
          }
          break;
        }
        case 'orbit': {
          e.t += dt;
          const phase = e.t % 3.4;
          if (phase < 2.2) { const ta = a + Math.PI / 2; mx = Math.cos(ta) * spd + Math.cos(a) * (d - 190) * 0.6; my = Math.sin(ta) * spd + Math.sin(a) * (d - 190) * 0.6; }
          else { mx = Math.cos(a) * spd * 2.1; my = Math.sin(a) * spd * 2.1; }
          break;
        }
        case 'blink': {
          e.blink -= dt;
          if (e.blink <= 0) {
            e.blink = e.def.blinkCd;
            this.burst(e.x, e.y, e.color, 10, 200, 3);
            const na = rand(0, TAU), nd = rand(120, 200);
            e.x = clamp(p.x + Math.cos(na) * nd, 20, ARENA.w - 20);
            e.y = clamp(p.y + Math.sin(na) * nd, 20, ARENA.h - 20);
            this.burst(e.x, e.y, e.color, 10, 200, 3);
          }
          mx = Math.cos(a) * spd; my = Math.sin(a) * spd;
          break;
        }
        case 'boss': this.updateBoss(e, dt, a, d); mx = e.bmx || 0; my = e.bmy || 0; break;
      }
      e.vx += (mx - e.vx) * Math.min(1, dt * 6);
      e.vy += (my - e.vy) * Math.min(1, dt * 6);
      e.x = clamp(e.x + e.vx * dt, e.r, ARENA.w - e.r);
      e.y = clamp(e.y + e.vy * dt, e.r, ARENA.h - e.r);
      // touch damage
      if (e.touchCd <= 0 && d < e.r + p.r + 2) {
        e.touchCd = 1.15;
        this.damagePlayer(e.def.dmg, e.type);
      }
    }
  }

  updateBoss(e, dt, a, d) {
    const spd = e.def.speed;
    e.pt -= dt;
    if (e.telegraph > 0) {
      e.telegraph -= dt; e.bmx = 0; e.bmy = 0;
      if (e.telegraph <= 0) { e.chargeT = 0.7; e.chargeA = a; audio.sfx('dash'); }
      return;
    }
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      e.bmx = Math.cos(e.chargeA) * spd * 7; e.bmy = Math.sin(e.chargeA) * spd * 7;
      return;
    }
    e.bmx = Math.cos(a) * spd; e.bmy = Math.sin(a) * spd;
    if (e.pt <= 0) {
      const pat = e.patterns[e.pi % e.patterns.length]; e.pi++;
      e.pt = 2.6;
      switch (pat) {
        case 'radial': {
          const n = 18 + e.bossIdx * 6;
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * TAU + e.spiralA;
            this.spawnEBullet(e.x, e.y, ang, 210, e.def.dmg || 18, e.color);
          }
          audio.sfx('nova', { pitch: 0.7 }); this.shake(4);
          break;
        }
        case 'spiral': e.spiralT = 1.6; break;
        case 'charge': e.telegraph = 0.8; break;
        case 'summon': {
          const types = ['swarm', 'runner', 'grunt'];
          for (let i = 0; i < 8; i++) {
            const ang = rand(0, TAU);
            this.spawnEnemy(pick(types), e.x + Math.cos(ang) * 90, e.y + Math.sin(ang) * 90);
          }
          this.ring(e.x, e.y, e.color, 30, 160, 0.5);
          break;
        }
        case 'sweep': {
          for (let i = 0; i < 26; i++) {
            const ang = a - 0.9 + (i / 25) * 1.8;
            this.spawnEBullet(e.x, e.y, ang, 260 + (i % 3) * 40, (e.def.dmg || 18) * 0.8, '#ffffff');
          }
          audio.sfx('rail', { pitch: 0.7 });
          break;
        }
      }
    }
    if (e.spiralT > 0) {
      e.spiralT -= dt; e.spiralA += dt * 5;
      e._st = (e._st || 0) - dt;
      if (e._st <= 0) {
        e._st = 0.09;
        this.spawnEBullet(e.x, e.y, e.spiralA, 240, 14, e.color);
        this.spawnEBullet(e.x, e.y, e.spiralA + Math.PI, 240, 14, e.color);
      }
    }
  }
  spawnEBullet(x, y, a, speed, dmg, color) {
    if (this.ebullets.alive > 260) return;
    const b = this.ebullets.obtain();
    b.x = x; b.y = y; b.a = a; b.speed = speed; b.dmg = dmg; b.r = 7; b.life = 4.5; b.color = color;
    b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
  }

  updateBullets(dt) {
    const p = this.player;
    for (const b of this.bullets.items) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.life <= 0) { if (b.splash) this.splash(b.x, b.y, b.splash, b.dmg, b.color, { src: b.src }); this.bullets.release(b); continue; }
      if (b.homing) {
        const t = this.nearest(b.x, b.y, 460);
        if (t) {
          const want = angleTo(b.x, b.y, t.x, t.y);
          b.a = angleLerp(b.a, want, Math.min(1, b.homing * dt));
          b.vx = Math.cos(b.a) * b.speed; b.vy = Math.sin(b.a) * b.speed;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.trail && chance(0.6)) { const t = this.particles.obtain(); t.x = b.x; t.y = b.y; t.vx = 0; t.vy = 0; t.life = t.maxLife = 0.22; t.color = b.color; t.size = 2.4; t.type = 'dot'; t.drag = 0; }
      if (b.x < 0 || b.y < 0 || b.x > ARENA.w || b.y > ARENA.h) { this.bullets.release(b); continue; }
      const q = this.queryEnemies(b.x, b.y, b.r + 34);
      for (const e of q) {
        if (e.dead || b.hit.has(e.id)) continue;
        if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
          b.hit.add(e.id);
          this.damageEnemy(e, b.dmg, { critChance: b.crit, knock: b.knock, ka: b.a, color: b.color, src: b.src });
          if (b.splash) { this.splash(b.x, b.y, b.splash, b.dmg * 0.7, b.color, { src: b.src }); if (b.cluster) for (let i = 0; i < 3; i++) { const a2 = rand(0, TAU); this.spawnBullet({ x: b.x, y: b.y, a: a2, speed: 260, dmg: b.dmg * 0.4, pierce: 0, life: 0.7, r: 4, color: '#ffcf8f', knock: 40, crit: 0, src: 'cluster' }); } this.bullets.release(b); break; }
          if (b.pierce > 0) b.pierce--; else { this.bullets.release(b); break; }
        }
      }
    }
  }

  updateEBullets(dt) {
    const p = this.player;
    for (const b of this.ebullets.items) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.life <= 0) { this.ebullets.release(b); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (dist(b.x, b.y, p.x, p.y) < b.r + p.r) { this.damagePlayer(b.dmg, 'bullet'); this.ebullets.release(b); }
    }
  }

  updateZones(dt) {
    for (const z of this.zones.items) {
      if (z.dead) continue;
      z.life -= dt;
      if (z.type === 'nova') {
        z.r = Math.min(z.maxR, z.r + z.grow * dt * 3);
        const q = this.queryEnemies(z.x, z.y, z.r + 40);
        for (const e of q) {
          if (e.dead || z.hits.has(e.id)) continue;
          if (dist(z.x, z.y, e.x, e.y) < z.r + e.r) {
            z.hits.add(e.id);
            const a = angleTo(z.x, z.y, e.x, e.y);
            this.damageEnemy(e, z.dmg, { knock: z.knock, kx: Math.cos(a), ky: Math.sin(a), color: z.color, slow: z.slow || 0, src: 'nova' });
          }
        }
      }
      if (z.life <= 0) this.zones.release(z);
    }
  }

  updatePickups(dt) {
    const p = this.player, m = this.game.mods;
    const R = p.magnetR * (m.magnetMul || 1);
    for (const k of this.pickups.items) {
      if (k.dead) continue;
      k.t += dt;
      const d = dist(k.x, k.y, p.x, p.y);
      if (d < R || k.pull) {
        k.pull = true;
        const a = angleTo(k.x, k.y, p.x, p.y);
        const s = 620 * (1 - Math.min(0.85, d / R));
        k.vx = Math.cos(a) * Math.max(220, s); k.vy = Math.sin(a) * Math.max(220, s);
      } else { k.vx *= 0.92; k.vy *= 0.92; }
      k.x += k.vx * dt; k.y += k.vy * dt;
      if (d < p.r + 12) {
        this.pickups.release(k);
        switch (k.type) {
          case 'xp': this.game.gainXp(k.value * (m.xpMul || 1)); audio.sfx('xp', { pitch: 1 + Math.min(0.6, p.level * 0.01) }); break;
          case 'coin': p.coins += Math.round(k.value * (m.coinMul || 1)); audio.sfx('coin'); this.addText(p.x, p.y - 24, '+' + k.value, '#ffc93d', 13); break;
          case 'heart': this.healPlayer(Math.round(p.maxHp * 0.25)); break;
          case 'bomb': this.game.useBomb(); break;
          case 'magnet': for (const o of this.pickups.items) if (!o.dead) o.pull = true; audio.sfx('dash'); this.ring(p.x, p.y, '#5cffd4', 20, 420, 0.5); break;
          case 'chest': this.game.openChest(); break;
        }
      }
    }
  }

  updateFx(dt) {
    for (const p of this.particles.items) {
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) { this.particles.release(p); continue; }
      if (p.type === 'ring') { p.size += (p.grow - p.size) * Math.min(1, dt * 12); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const dr = Math.exp(-(p.drag || 3) * dt);
      p.vx *= dr; p.vy *= dr;
    }
    for (const t of this.texts.items) {
      if (t.dead) continue;
      t.life -= dt; t.y += t.vy * dt; t.vy *= 0.92;
      if (t.life <= 0) this.texts.release(t);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) { this.beams[i].life -= dt; if (this.beams[i].life <= 0) this.beams.splice(i, 1); }
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
  }

  bombAll() {
    const p = this.player;
    this.ring(p.x, p.y, '#ff9d3d', 40, 900, 0.8);
    this.shake(16); audio.sfx('boom');
    for (const e of this.enemies.items) {
      if (e.dead || e.boss) continue;
      this.damageEnemy(e, 900, { color: '#ff9d3d', src: 'bomb' });
    }
    for (const b of this.ebullets.items) if (!b.dead) this.ebullets.release(b);
  }
}
