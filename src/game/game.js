/* ══ NEONVOID game: run state machine, director, progression, meta, ad hooks ══ */
import { Bus, Loop, Store, clamp, rand, randInt, chance, pick, fmtTime } from '../core/engine.js';
import { Input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { ads } from '../ads/ads.js';
import { World, ARENA } from './world.js';
import { Renderer } from './render.js';
import { WEAPONS, PASSIVES, META, EVENTS, xpForLevel, FILLERS, RARITY, metaCost } from './content.js';

const DEFAULT_SAVE = {
  coins: 0, meta: {}, runs: [],
  best: { time: 0, level: 0, kills: 0 },
  settings: { music: 0.55, sfx: 0.85, muted: false, shake: true, reduceFlash: false, quality: 'auto', aim: 'auto' },
  consent: null, crateDay: 0, howSeen: false,
};

export class Game extends Bus {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.save = Object.assign({}, DEFAULT_SAVE, Store.get('save', {}));
    this.save.settings = Object.assign({}, DEFAULT_SAVE.settings, this.save.settings || {});
    this.quality = this.save.settings.quality === 'auto'
      ? (matchMedia('(pointer:coarse)').matches || innerWidth < 800 ? 'med' : 'high')
      : this.save.settings.quality;
    this.state = 'boot';
    this.time = 0; this.runId = 0;
    this.cam = { x: ARENA.w / 2, y: ARENA.h / 2, zoom: 1, sx: 0, sy: 0 };
    this.shakeAmt = 0; this.flash = 0; this.flashColor = '#ffffff';
    this.mods = {};
    this.pendingLevels = 0;
    this.eventIdx = 0; this.spawnAcc = 0;
    this.offers = []; this.offerCount = 3;
    this.rerolls = 0; this.adRerolls = 0; this.bonusCards = 0;
    this.revivesUsed = 0; this.doubled = false; this.coinsEarned = 0;
    this.world = new World(this);
    this.renderer = new Renderer(canvas, this);
    this.input = new Input(canvas);
    this.input.onPause = () => { if (this.state === 'play') this.pause(); else if (this.state === 'pause') this.resume(); };
    this.loop = new Loop({ update: (dt) => this.update(dt), render: () => this.render() });
    this.hudT = 0;
  }

  /* ── lifecycle ─────────────────────────────────────────────────── */
  boot() {
    this.applySettings();
    this.world.reset();
    this.loop.start();
    this.state = 'menu';
    this.emit('state', 'menu');
  }
  applySettings() {
    const s = this.save.settings;
    audio.setMusic(s.music); audio.setSfx(s.sfx); audio.setMuted(s.muted);
    this.renderer.resize();
  }
  persist() { Store.set('save', this.save); }

  get reviveCharges() { return 1 + (this.mods.reviveAdd || 0); }

  startRun() {
    this.runId++;
    this.computeMods();
    this.world.reset();
    const p = this.world.player;
    this.time = 0; this.eventIdx = 0; this.spawnAcc = 0;
    this.pendingLevels = 0; this.doubled = false; this.revivesUsed = 0;
    this.rerolls = 1 + (this.mods.rerollAdd || 0); this.adRerolls = 0; this.bonusCards = 0;
    p.weapons.push({ id: 'pulse', def: WEAPONS.pulse, level: 1, cd: 0.4 });
    const startLv = 1 + (this.mods.startLevelAdd || 0);
    p.level = startLv;
    this.offerCount = 3 + (this.mods.choiceAdd || 0);
    this.computeMods();
    this.cam.x = p.x; this.cam.y = p.y; this.cam.zoom = 1;
    this.state = 'play';
    this.input.enabled = true;
    audio.resume(); audio.setIntensity(0.2);
    ads.context.runId = this.runId;
    ads.gameplayStart();
    this.emit('state', 'play');
    if (!this.save.howSeen) this.emit('hint');
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause'; this.input.enabled = false;
    audio.setIntensity(0); ads.gameplayStop();
    this.emit('state', 'pause');
  }
  resume() {
    if (this.state !== 'pause') return;
    this.state = 'play'; this.input.enabled = true;
    audio.resume(); ads.gameplayStart();
    this.emit('state', 'play');
  }

  /* ── mods & stats ──────────────────────────────────────────────── */
  computeMods() {
    const m = {};
    const apply = (mods, times = 1) => {
      for (let i = 0; i < times; i++) for (const [k, v] of Object.entries(mods)) {
        if (k.endsWith('Mul')) m[k] = (m[k] ?? 1) * v;
        else m[k] = (m[k] ?? 0) + v;
      }
    };
    for (const [id, lvl] of Object.entries(this.save.meta)) if (lvl > 0 && META[id]) apply(META[id].mods, lvl);
    const p = this.world.player;
    if (p) for (const [id, lvl] of Object.entries(p.passives)) if (PASSIVES[id]) apply(PASSIVES[id].mods, lvl);
    this.mods = m;
    if (p) p.magnetR = 90;
    return m;
  }
  weaponStats(inst) {
    const s = { ...inst.def.base }, m = this.mods;
    for (let i = 0; i < inst.level - 1 && i < inst.def.levels.length; i++) {
      for (const [k, v] of Object.entries(inst.def.levels[i].mods)) {
        if (k === 'dmgMul') s.dmg *= v; else if (k === 'cdMul') s.cd *= v;
        else if (k === 'speedMul') s.speed *= v; else if (k === 'lifeMul') s.life *= v;
        else if (k === 'special') s.special = v; else s[k] = (s[k] || 0) + v;
      }
    }
    const projWeapons = ['pulse', 'scatter', 'missile'];
    if (projWeapons.includes(inst.id)) s.count += (m.projAdd || 0);
    s.dmg *= (m.dmgMul || 1);
    s.cd *= (m.cdMul || 1);
    s.area *= (m.areaMul || 1);
    for (const k of ['radius', 'orbitR', 'len', 'width', 'splash', 'range']) if (s[k]) s[k] *= (m.areaMul || 1);
    s.crit = (s.crit || 0) + (m.critAdd || 0);
    return s;
  }

  /* ── frame ─────────────────────────────────────────────────────── */
  update(dt) {
    this.input.update();
    this.flash = Math.max(0, this.flash - dt * 3);
    this.shakeAmt *= Math.exp(-7 * dt);
    const sh = this.save.settings.shake ? this.shakeAmt : 0;
    this.cam.sx = rand(-sh, sh); this.cam.sy = rand(-sh, sh);
    if (this.state === 'play') {
      this.time += dt;
      ads.context.runSeconds = this.time;
      this.director(dt);
      this.world.update(dt);
      this.updateCamera(dt);
      audio.setIntensity(clamp(0.2 + this.time / 420 + this.world.enemies.alive / 500, 0.2, 1));
      this.hudT -= dt;
      if (this.hudT <= 0) { this.hudT = 0.1; this.emit('hud'); }
    } else if (this.state === 'menu') {
      this.cam.x = ARENA.w / 2 + Math.sin(performance.now() / 4000) * 300;
      this.cam.y = ARENA.h / 2 + Math.cos(performance.now() / 5200) * 200;
      this.cam.zoom = 0.9;
    }
    this.input.endFrame();
  }
  render() { this.renderer.render(); }
  shake(v) { if (this.save.settings.shake) this.shakeAmt = Math.min(18, this.shakeAmt + v); }
  doFlash(color = '#ffffff', v = 0.6) { if (!this.save.settings.reduceFlash) { this.flash = v; this.flashColor = color; } }

  updateCamera(dt) {
    const p = this.world.player;
    const look = 70;
    const tx = clamp(p.x + this.input.move.x * look, 0, ARENA.w);
    const ty = clamp(p.y + this.input.move.y * look, 0, ARENA.h);
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 6);
    const tz = clamp(1.06 - this.world.enemies.alive * 0.00045, 0.86, 1.06);
    this.cam.zoom += (tz - this.cam.zoom) * Math.min(1, dt * 1.5);
  }

  /* ── director / spawns ─────────────────────────────────────────── */
  get aliveCap() { return this.quality === 'low' ? 170 : this.quality === 'med' ? 290 : 420; }
  director(dt) {
    const t = this.time;
    // gentle open (0.5/s) ramping into chaos; first 15s ramp in further
    const ramp = t < 15 ? 0.45 + 0.55 * (t / 15) : 1;
    const rate = (0.5 + (t / 60) * 1.1 + Math.pow(t / 60, 2) * 0.35) * ramp;
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.world.enemies.alive < this.aliveCap) this.spawnRing(1);
    }
    while (this.eventIdx < EVENTS.length && EVENTS[this.eventIdx].t <= t) {
      const ev = EVENTS[this.eventIdx++];
      this.fireEvent(ev);
    }
  }
  spawnRing(n) {
    const p = this.world.player;
    const view = Math.max(this.renderer.w, this.renderer.h) / 2 / this.cam.zoom + 150;
    for (let i = 0; i < n; i++) {
      const type = this.rollEnemyType();
      const a = rand(0, Math.PI * 2);
      const x = clamp(p.x + Math.cos(a) * view, 30, ARENA.w - 30);
      const y = clamp(p.y + Math.sin(a) * view, 30, ARENA.h - 30);
      this.world.spawnEnemy(type, x, y);
      const pack = ENEMIES_REF[type].pack || 0;
      for (let k = 0; k < pack; k++) this.world.spawnEnemy(type, x + rand(-60, 60), y + rand(-60, 60));
    }
  }
  openLevelUpExtra() { this.openLevelUp(this.bonusCards); }
  rollEnemyType() {
    const t = this.time;
    const list = Object.entries(ENEMIES_REF).filter(([, d]) => d.minTime <= t);
    let total = 0; const ws = list.map(([, d]) => { const w = d.weight * (1 + t / 600); total += w; return w; });
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i][0]; }
    return 'grunt';
  }
  fireEvent(ev) {
    this.toast(ev.msg);
    if (ev.type === 'horde') {
      const n = 14 + Math.floor(this.time / 60) * 6;
      for (let i = 0; i < n; i++) this.spawnRing(1);
      this.doFlash('#ff3d9e', 0.35);
    } else if (ev.type === 'boss') this.world.spawnBoss(ev.boss);
    else if (ev.type === 'win') this.endRun(true);
  }
  onBoss(e) { this.boss = e; this.emit('boss', e); this.toast('⚠ ' + e.name); }
  onBossDead(e) {
    this.boss = null; this.emit('boss', null);
    for (let i = 0; i < 6; i++) this.world.spawnPickup('coin', e.x + rand(-60, 60), e.y + rand(-60, 60), randInt(4, 9));
    this.world.spawnPickup('chest', e.x, e.y, 1);
    this.doFlash('#ffffff', 0.7);
  }

  /* ── progression ───────────────────────────────────────────────── */
  gainXp(v) {
    const p = this.world.player;
    p.xp += v;
    while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; this.pendingLevels++; }
    if (this.pendingLevels > 0 && this.state === 'play') this.openLevelUp();
  }
  openLevelUp(extra = 0) {
    this.state = 'levelup'; this.input.enabled = false;
    audio.setIntensity(0.05); ads.gameplayStop();
    this.doFlash('#38f0ff', 0.5); audio.sfx('levelup');
    this.offers = this.buildOffers(this.offerCount + extra);
    this.emit('levelup', this.offers);
  }
  buildOffers(count) {
    const p = this.world.player, luck = this.mods.luckAdd || 0;
    const pool = [];
    for (const [id, def] of Object.entries(WEAPONS)) {
      const inst = p.weapons.find(w => w.id === id);
      if (inst && inst.level > def.levels.length) continue;
      pool.push({ kind: 'weapon', id, def, level: inst ? inst.level + 1 : 1, isNew: !inst, rarity: def.rarity });
    }
    for (const [id, def] of Object.entries(PASSIVES)) {
      const lvl = p.passives[id] || 0;
      if (lvl >= def.max) continue;
      pool.push({ kind: 'passive', id, def, level: lvl + 1, isNew: lvl === 0, rarity: def.rarity });
    }
    const out = [];
    const weight = (o) => RARITY[o.rarity].w * (o.rarity === 'epic' || o.rarity === 'legendary' ? 1 + luck : 1);
    while (out.length < count && pool.length) {
      let total = 0; const ws = pool.map(o => { const w = weight(o); total += w; return w; });
      let r = Math.random() * total, idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) { idx = i; break; } }
      out.push(pool.splice(idx, 1)[0]);
    }
    while (out.length < count) out.push({ ...pick(FILLERS), kind: 'filler', level: 1, isNew: true });
    return out;
  }
  chooseOffer(offer) {
    const p = this.world.player;
    if (offer.kind === 'weapon') {
      const inst = p.weapons.find(w => w.id === offer.id);
      if (inst) inst.level++; else p.weapons.push({ id: offer.id, def: offer.def, level: 1, cd: 0.3 });
    } else if (offer.kind === 'passive') {
      p.passives[offer.id] = (p.passives[offer.id] || 0) + 1;
      this.computeMods();
      if (offer.id === 'plating') p.hp = Math.min(p.maxHp = Math.round(p.maxHp * 1.08), p.hp + 10);
    } else {
      if (offer.id === 'f_heal') this.world.healPlayer(Math.round(p.maxHp * 0.35));
      if (offer.id === 'f_bomb') this.useBomb();
      if (offer.id === 'f_coin') { p.coins += 60; this.toast('+60 COINS'); }
      if (offer.id === 'f_magnet') { for (const o of this.world.pickups.items) if (!o.dead) o.pull = true; }
    }
    audio.sfx('ui');
    this.pendingLevels--;
    this.emit('items');
    if (this.pendingLevels > 0) this.openLevelUp();
    else {
      this.state = 'play'; this.input.enabled = true; ads.gameplayStart();
      this.emit('state', 'play');
    }
  }
  rerollPool(viaAd) {
    if (viaAd) { this.offers = this.buildOffers(this.offerCount + this.bonusCards); }
    else { this.offers = this.buildOffers(this.offerCount + this.bonusCards); this.rerolls--; }
    audio.sfx('ui');
    this.emit('levelup', this.offers);
  }
  openChest() {
    const p = this.world.player;
    audio.sfx('chest'); this.doFlash('#ffc93d', 0.5);
    const pool = this.buildOffers(1);
    const offer = pool[0];
    this.toast('CHEST: ' + offer.name);
    this.chooseOfferSilent(offer);
    p.coins += randInt(10, 24);
  }
  chooseOfferSilent(offer) {
    const p = this.world.player;
    if (offer.kind === 'weapon') { const inst = p.weapons.find(w => w.id === offer.id); if (inst) inst.level++; else p.weapons.push({ id: offer.id, def: offer.def, level: 1, cd: 0.3 }); }
    else if (offer.kind === 'passive') { p.passives[offer.id] = (p.passives[offer.id] || 0) + 1; this.computeMods(); }
    else this.chooseOffer(offer), this.pendingLevels++;   // filler effects, undo level bookkeeping
    this.emit('items');
  }
  useBomb() { this.world.bombAll(); this.toast('VOID BOMB DETONATED'); }

  /* ── death / revive / end ──────────────────────────────────────── */
  onPlayerHurt() { }
  onPlayerDeath() {
    this.endRun(false);
  }
  endRun(win) {
    if (this.state === 'over' || this.state === 'win') return;
    const p = this.world.player;
    this.state = win ? 'win' : 'over';
    this.input.enabled = false;
    audio.setIntensity(0); ads.gameplayStop();
    audio.sfx(win ? 'chest' : 'gameover');
    if (win) this.ads_happy();
    this.coinsEarned = Math.round(p.coins + this.time / 8 + p.level * 2 + (win ? 250 : 0));
    // records
    const rec = { date: Date.now(), time: this.time, level: p.level, kills: p.kills, coins: this.coinsEarned, win };
    this.save.runs.unshift(rec); this.save.runs = this.save.runs.slice(0, 12);
    if (this.time > this.save.best.time) this.save.best.time = this.time;
    if (p.level > this.save.best.level) this.save.best.level = p.level;
    if (p.kills > this.save.best.kills) this.save.best.kills = p.kills;
    if (!this.save.howSeen) { this.save.howSeen = true; this.persist(); }
    this.persist();
    ads.context.runSeconds = this.time;
    this.emit('over', { win, rec });
    // throttled interstitial behind the summary (never during play)
    setTimeout(() => { if (this.state === 'over' || this.state === 'win') ads.showInterstitial('post_run'); }, 1400);
  }
  async tryRevive() {
    if (this.revivesUsed >= this.reviveCharges) return false;
    const res = await ads.showRewarded('revive');
    if (!res.completed) return false;
    this.revivesUsed++;
    const p = this.world.player;
    p.hp = Math.round(p.maxHp * 0.5); p.iframes = 2.5;
    for (const e of this.world.enemies.items) if (!e.dead && !e.boss && Math.hypot(e.x - p.x, e.y - p.y) < 340) this.world.damageEnemy(e, 99999, { src: 'revive' });
    for (const b of this.world.ebullets.items) if (!b.dead) this.world.ebullets.release(b);
    this.state = 'play'; this.input.enabled = true;
    audio.resume(); audio.sfx('revive'); ads.gameplayStart();
    this.doFlash('#b6ff3d', 0.6);
    this.emit('state', 'play');
    return true;
  }
  async doubleCoins() {
    if (this.doubled) return false;
    const res = await ads.showRewarded('double_coins');
    if (!res.completed) return false;
    this.doubled = true;
    this.coinsEarned *= 2;
    return true;
  }
  bankCoins() {
    if (this._banked) return; this._banked = true;
    this.save.coins += this.coinsEarned;
    this.persist();
  }
  toMenu() {
    this._banked = false;
    this.state = 'menu'; this.input.enabled = false;
    this.boss = null;
    audio.setIntensity(0);
    this.emit('state', 'menu');
  }

  /* ── meta shop ─────────────────────────────────────────────────── */
  buyMeta(id) {
    const def = META[id]; const lvl = this.save.meta[id] || 0;
    if (!def || lvl >= def.max) return false;
    const cost = metaCost(def, lvl);
    if (this.save.coins < cost) { audio.sfx('deny'); return false; }
    this.save.coins -= cost; this.save.meta[id] = lvl + 1;
    this.computeMods(); this.persist(); audio.sfx('coin');
    return true;
  }

  toast(msg) { this.emit('toast', msg); }
  ads_happy() { try { ads.provider?.happyTime?.(); } catch {} }
  cursorWorld() {
    const r = this.renderer, cam = this.cam, p = this.input.pointer;
    return { x: cam.x + (p.sx - r.w / 2) / cam.zoom, y: cam.y + (p.sy - r.h / 2) / cam.zoom };
  }
}

/* local alias to avoid circular import cost in hot paths */
import { ENEMIES as ENEMIES_REF } from './content.js';
