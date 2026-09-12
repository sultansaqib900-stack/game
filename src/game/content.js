/* ══ NEONVOID content: weapons / passives / enemies / bosses / meta / curve ══
   Weapon fire(w, s, p) helpers available on world `w`:
     w.spawnBullet(o), w.nearest(x,y,r), w.queryEnemies(x,y,r,out),
     w.damageEnemy(e,dmg,o), w.spawnZone(o), w.addBeam(o), w.burst(x,y,color,n),
     w.chainArc(points), w.splash(x,y,r,dmg,color)
════════════════════════════════════════════════════════════════════ */
import { TAU, rand, angleTo, chance } from '../core/engine.js';

export const RARITY = {
  common:    { w: 100, cls: 'r-common' },
  uncommon:  { w: 62,  cls: 'r-uncommon' },
  rare:      { w: 34,  cls: 'r-rare' },
  epic:      { w: 16,  cls: 'r-epic' },
  legendary: { w: 7,   cls: 'r-legendary' },
};

/* ─────────────────────────── WEAPONS ─────────────────────────── */
export const WEAPONS = {
  pulse: {
    name: 'PULSE LANCE', icon: 'bolt', rarity: 'common', color: '#5ce1ff',
    desc: 'Fires a fast bolt at the nearest threat.',
    base: { cd: 0.5, dmg: 16, count: 1, speed: 640, pierce: 0, life: 1.15, area: 1, spread: 0.1, knock: 70, crit: 0.05 },
    levels: [
      { text: '+1 bolt per shot', mods: { count: 1 } },
      { text: '-15% cooldown', mods: { cdMul: 0.85 } },
      { text: '+40% damage', mods: { dmgMul: 1.4 } },
      { text: 'Bolts pierce 1 enemy', mods: { pierce: 1 } },
      { text: '+1 bolt, +20% speed', mods: { count: 1, speedMul: 1.2 } },
      { text: '+60% damage', mods: { dmgMul: 1.6 } },
      { text: 'Pierce +2, +10% crit', mods: { pierce: 2, crit: 0.1 } },
    ],
    fire(w, s, p) {
      const t = w.nearest(p.x, p.y, 900);
      const a = t ? angleTo(p.x, p.y, t.x, t.y) : p.aim;
      for (let i = 0; i < s.count; i++) {
        const off = (i - (s.count - 1) / 2) * (s.spread + 0.06);
        w.spawnBullet({ x: p.x, y: p.y, a: a + off + rand(-0.02, 0.02), speed: s.speed, dmg: s.dmg, pierce: s.pierce, life: s.life, r: 5 * s.area, color: '#7deaff', knock: s.knock, crit: s.crit, src: 'pulse' });
      }
      w.sfx('shoot');
    },
  },
  scatter: {
    name: 'SCATTER CORE', icon: 'scatter', rarity: 'common', color: '#ffd23d',
    desc: 'Short-range cone of shards. Brutal up close.',
    base: { cd: 1.15, dmg: 9, count: 5, speed: 520, pierce: 0, life: 0.42, area: 1, spread: 0.55, knock: 130, crit: 0.05 },
    levels: [
      { text: '+2 shards', mods: { count: 2 } },
      { text: '+30% damage', mods: { dmgMul: 1.3 } },
      { text: 'Wider cone, +25% range', mods: { spread: 0.18, lifeMul: 1.25 } },
      { text: '+3 shards', mods: { count: 3 } },
      { text: 'Shards pierce 1', mods: { pierce: 1 } },
      { text: '+50% damage', mods: { dmgMul: 1.5 } },
      { text: '+4 shards, huge knockback', mods: { count: 4, knock: 120 } },
    ],
    fire(w, s, p) {
      const t = w.nearest(p.x, p.y, 520);
      const a = t ? angleTo(p.x, p.y, t.x, t.y) : p.aim;
      for (let i = 0; i < s.count; i++) {
        const off = (i - (s.count - 1) / 2) * (s.spread * 2 / Math.max(1, s.count - 1)) + rand(-0.06, 0.06);
        w.spawnBullet({ x: p.x, y: p.y, a: a + off, speed: s.speed * rand(0.85, 1.15), dmg: s.dmg, pierce: s.pierce, life: s.life, r: 4 * s.area, color: '#ffe27a', knock: s.knock, crit: s.crit, src: 'scatter' });
      }
      w.sfx('scatter');
    },
  },
  orbit: {
    name: 'VOID BLADES', icon: 'orbit', rarity: 'uncommon', color: '#c46bff',
    desc: 'Blades orbit you, slicing anything they touch.',
    base: { cd: 0, dmg: 16, count: 2, speed: 2.4, pierce: 99, life: 0, area: 1, orbitR: 86, knock: 90, crit: 0.05, hitCd: 0.42 },
    levels: [
      { text: '+1 blade', mods: { count: 1 } },
      { text: '+35% damage', mods: { dmgMul: 1.35 } },
      { text: 'Wider orbit (+25%)', mods: { orbitR: 24 } },
      { text: '+1 blade, faster spin', mods: { count: 1, speed: 0.7 } },
      { text: '+45% damage', mods: { dmgMul: 1.45 } },
      { text: '+1 blade', mods: { count: 1 } },
      { text: 'Blades leave a burning trail', mods: { special: 'trail' } },
    ],
    fire() {},   // handled by world.updateOrbitals
  },
  nova: {
    name: 'NOVA PULSE', icon: 'nova', rarity: 'uncommon', color: '#ff5d9e',
    desc: 'Periodic shockwave ring blasts everything around you.',
    base: { cd: 3.4, dmg: 26, count: 1, speed: 420, pierce: 99, life: 0, area: 1, radius: 150, knock: 220, crit: 0 },
    levels: [
      { text: '+30% radius', mods: { radius: 45 } },
      { text: '+40% damage', mods: { dmgMul: 1.4 } },
      { text: '-20% cooldown', mods: { cdMul: 0.8 } },
      { text: '+35% radius', mods: { radius: 52 } },
      { text: '+50% damage', mods: { dmgMul: 1.5 } },
      { text: 'Double ring', mods: { count: 1 } },
      { text: 'Nova briefly slows enemies', mods: { special: 'slow' } },
    ],
    fire(w, s, p) {
      for (let i = 0; i < s.count; i++) {
        w.spawnZone({ type: 'nova', x: p.x, y: p.y, r: 10, maxR: s.radius * (1 + i * 0.35), grow: s.speed, dmg: s.dmg, color: '#ff5d9e', knock: s.knock, slow: s.special === 'slow' ? 0.9 : 0, life: 0.6 });
      }
      w.sfx('nova'); w.shake(5);
    },
  },
  rail: {
    name: 'ION RAIL', icon: 'rail', rarity: 'rare', color: '#8fb4ff',
    desc: 'Charges, then fires a piercing beam through everything.',
    base: { cd: 2.6, dmg: 52, count: 1, speed: 0, pierce: 99, life: 0, area: 1, len: 780, width: 26, knock: 160, crit: 0.1 },
    levels: [
      { text: '+25% beam length', mods: { len: 195 } },
      { text: '+45% damage', mods: { dmgMul: 1.45 } },
      { text: '-20% cooldown', mods: { cdMul: 0.8 } },
      { text: 'Wider beam (+60%)', mods: { width: 16 } },
      { text: '+60% damage', mods: { dmgMul: 1.6 } },
      { text: 'Beam ignites: burns for 3s', mods: { special: 'burn' } },
      { text: 'Twin rails', mods: { count: 1 } },
    ],
    fire(w, s, p) {
      const t = w.nearest(p.x, p.y, 1100);
      const a = t ? angleTo(p.x, p.y, t.x, t.y) : p.aim;
      for (let b = 0; b < s.count; b++) {
        const ang = a + (b - (s.count - 1) / 2) * 0.5;
        w.fireBeam({ x: p.x, y: p.y, a: ang, len: s.len, width: s.width, dmg: s.dmg, knock: s.knock, crit: s.crit, color: '#9fc4ff', burn: s.special === 'burn' ? 3 : 0 });
      }
      w.sfx('rail'); w.shake(4);
    },
  },
  missile: {
    name: 'SWARM MISSILES', icon: 'missile', rarity: 'rare', color: '#ff9d3d',
    desc: 'Homing missiles with splash damage.',
    base: { cd: 2.2, dmg: 30, count: 2, speed: 330, pierce: 0, life: 2.6, area: 1, splash: 74, knock: 90, crit: 0, homing: 5.2 },
    levels: [
      { text: '+1 missile', mods: { count: 1 } },
      { text: '+35% splash radius', mods: { splash: 26 } },
      { text: '+40% damage', mods: { dmgMul: 1.4 } },
      { text: '+2 missiles', mods: { count: 2 } },
      { text: 'Faster lock-on', mods: { homing: 2.4 } },
      { text: '+50% damage', mods: { dmgMul: 1.5 } },
      { text: 'Cluster warheads', mods: { special: 'cluster' } },
    ],
    fire(w, s, p) {
      for (let i = 0; i < s.count; i++) {
        const a = rand(0, TAU);
        w.spawnBullet({ x: p.x, y: p.y, a, speed: s.speed, dmg: s.dmg, pierce: 0, life: s.life, r: 6 * s.area, color: '#ffb45c', knock: s.knock, crit: s.crit, homing: s.homing, splash: s.splash, cluster: s.special === 'cluster', src: 'missile', trail: true });
      }
      w.sfx('missile');
    },
  },
  chain: {
    name: 'ARC CHAIN', icon: 'chain', rarity: 'epic', color: '#7dff9e',
    desc: 'Lightning arcs between nearby enemies.',
    base: { cd: 1.7, dmg: 24, count: 3, speed: 0, pierce: 0, life: 0, area: 1, range: 300, knock: 40, crit: 0.08 },
    levels: [
      { text: '+1 chain jump', mods: { count: 1 } },
      { text: '+40% damage', mods: { dmgMul: 1.4 } },
      { text: '+25% jump range', mods: { range: 75 } },
      { text: '+2 jumps', mods: { count: 2 } },
      { text: '-25% cooldown', mods: { cdMul: 0.75 } },
      { text: '+60% damage', mods: { dmgMul: 1.6 } },
      { text: 'Arcs stun for 0.4s', mods: { special: 'stun' } },
    ],
    fire(w, s, p) {
      const out = [];
      let cur = w.nearest(p.x, p.y, s.range + 120);
      if (!cur) return;
      const hit = new Set();
      let px = p.x, py = p.y, dmg = s.dmg;
      out.push([px, py]);
      for (let i = 0; i < s.count && cur; i++) {
        out.push([cur.x, cur.y]);
        w.damageEnemy(cur, dmg, { crit: s.crit, knock: s.knock, color: '#7dff9e', stun: s.special === 'stun' ? 0.4 : 0, src: 'chain' });
        dmg *= 0.82; hit.add(cur);
        px = cur.x; py = cur.y;
        cur = w.nearest(px, py, s.range, hit);
      }
      w.chainArc(out);
      w.sfx('chain');
    },
  },
  drone: {
    name: 'SENTINEL DRONES', icon: 'drone', rarity: 'epic', color: '#5cffd4',
    desc: 'Orbiting turrets that auto-fire at the nearest enemy.',
    base: { cd: 0.9, dmg: 11, count: 1, speed: 600, pierce: 0, life: 1.0, area: 1, orbitR: 62, orbitSpeed: 1.1, knock: 50, crit: 0.05 },
    levels: [
      { text: '+1 drone', mods: { count: 1 } },
      { text: '+35% drone damage', mods: { dmgMul: 1.35 } },
      { text: '-20% fire cooldown', mods: { cdMul: 0.8 } },
      { text: '+1 drone', mods: { count: 1 } },
      { text: 'Drone bolts pierce 1', mods: { pierce: 1 } },
      { text: '+50% drone damage', mods: { dmgMul: 1.5 } },
      { text: '+1 drone, rapid fire', mods: { count: 1, cdMul: 0.8 } },
    ],
    fire() {},   // handled by world.updateDrones
  },
  aura: {
    name: 'EMBER AURA', icon: 'aura', rarity: 'uncommon', color: '#ff7a3d',
    desc: 'Sears everything near you and slows it down.',
    base: { cd: 0.5, dmg: 7, count: 1, speed: 0, pierce: 0, life: 0, area: 1, radius: 110, knock: 0, crit: 0, slow: 0.35 },
    levels: [
      { text: '+20% radius', mods: { radius: 22 } },
      { text: '+40% burn damage', mods: { dmgMul: 1.4 } },
      { text: '+20% radius', mods: { radius: 24 } },
      { text: 'Stronger slow (50%)', mods: { slow: 0.15 } },
      { text: '+50% burn damage', mods: { dmgMul: 1.5 } },
      { text: '+25% radius', mods: { radius: 28 } },
      { text: 'Aura ignites: stacking burn', mods: { special: 'ignite' } },
    ],
    fire() {},   // handled by world.updateAura (tick damage)
  },
};

/* ─────────────────────────── PASSIVES ─────────────────────────── */
export const PASSIVES = {
  overclock: { name: 'OVERCLOCK', icon: 'clock', rarity: 'common', color: '#5ce1ff', max: 5, desc: '-8% weapon cooldown', mods: { cdMul: 0.92 } },
  amplifier: { name: 'AMPLIFIER', icon: 'sword', rarity: 'common', color: '#ff5d7a', max: 5, desc: '+12% all damage', mods: { dmgMul: 1.12 } },
  velocity:  { name: 'VELOCITY', icon: 'speed', rarity: 'common', color: '#b6ff3d', max: 4, desc: '+8% move speed', mods: { spdMul: 1.08 } },
  expansion: { name: 'EXPANSION', icon: 'expand', rarity: 'uncommon', color: '#9b6bff', max: 4, desc: '+12% area & radius', mods: { areaMul: 1.12 } },
  multishot: { name: 'MULTISHOT', icon: 'multi', rarity: 'epic', color: '#ffc93d', max: 3, desc: '+1 projectile', mods: { projAdd: 1 } },
  magnet:    { name: 'MAGNET CORE', icon: 'magnet', rarity: 'common', color: '#5cffd4', max: 4, desc: '+30% pickup radius', mods: { magnetMul: 1.3 } },
  regen:     { name: 'NANOREPAIR', icon: 'heart', rarity: 'uncommon', color: '#ff8fb0', max: 4, desc: '+0.7 HP/sec', mods: { regenAdd: 0.7 } },
  plating:   { name: 'PLATING', icon: 'shield', rarity: 'uncommon', color: '#8fb4ff', max: 4, desc: '+1 armor, +8% max HP', mods: { armorAdd: 1, hpMul: 1.08 } },
  critcore:  { name: 'CRIT CORE', icon: 'target', rarity: 'rare', color: '#ffd23d', max: 4, desc: '+7% crit, +20% crit dmg', mods: { critAdd: 0.07, critDmgAdd: 0.2 } },
  greed:     { name: 'GREED CHIP', icon: 'coin', rarity: 'uncommon', color: '#ffc93d', max: 4, desc: '+15% coins & drops', mods: { coinMul: 1.15, dropAdd: 0.06 } },
  vampiric:  { name: 'VAMPIRIC EDGE', icon: 'fang', rarity: 'rare', color: '#ff3d9e', max: 3, desc: '5% chance to heal 1 on kill', mods: { leechAdd: 0.05 } },
  arcana:    { name: 'ARCANA', icon: 'star', rarity: 'rare', color: '#c46bff', max: 3, desc: 'Better upgrade rarity odds', mods: { luckAdd: 0.35 } },
};

/* ─────────────────────────── ENEMIES ─────────────────────────── */
export const ENEMIES = {
  grunt:   { name: 'Drifter', behavior: 'chase', hp: 16, speed: 62, dmg: 6, r: 13, color: '#ff5d7a', shape: 'hex', xp: 1, coin: 0.06, weight: 100, minTime: 0 },
  runner:  { name: 'Sprinter', behavior: 'chase', hp: 10, speed: 132, dmg: 5, r: 10, color: '#ffd23d', shape: 'tri', xp: 1, coin: 0.05, weight: 70, minTime: 45 },
  swarm:   { name: 'Mite', behavior: 'swarm', hp: 6, speed: 100, dmg: 3, r: 7, color: '#b6ff3d', shape: 'dot', xp: 0.6, coin: 0.02, weight: 90, minTime: 100, pack: 5 },
  brute:   { name: 'Bulwark', behavior: 'chase', hp: 90, speed: 40, dmg: 12, r: 23, color: '#9b6bff', shape: 'sq', xp: 4, coin: 0.25, weight: 34, minTime: 140, knockResist: 0.65, split: 2 },
  spitter: { name: 'Spitter', behavior: 'ranged', hp: 30, speed: 56, dmg: 8, r: 14, color: '#38f0ff', shape: 'hex', xp: 3, coin: 0.14, weight: 30, minTime: 170, fireCd: 2.6, projSpeed: 250, keep: 280 },
  orbiter: { name: 'Gyrefang', behavior: 'orbit', hp: 40, speed: 112, dmg: 9, r: 15, color: '#ff9d3d', shape: 'tri', xp: 4, coin: 0.16, weight: 26, minTime: 230 },
  phantom: { name: 'Phantom', behavior: 'blink', hp: 50, speed: 72, dmg: 11, r: 15, color: '#c46bff', shape: 'dia', xp: 5, coin: 0.2, weight: 20, minTime: 290, blinkCd: 3.2 },
  titan:   { name: 'Titan', behavior: 'chase', hp: 420, speed: 34, dmg: 20, r: 32, color: '#ff3d5e', shape: 'sq', xp: 26, coin: 1.4, weight: 7, minTime: 320, knockResist: 0.9, elite: true, chest: true },
};

/* ─────────────────────────── BOSSES ─────────────────────────── */
export const BOSSES = [
  { id: 'warden', name: 'THE WARDEN', hp: 2600, r: 46, color: '#ff3d9e', speed: 52, patterns: ['radial', 'charge', 'summon'] },
  { id: 'hive', name: 'HIVEMIND', hp: 6200, r: 52, color: '#b6ff3d', speed: 46, patterns: ['spiral', 'summon', 'radial'] },
  { id: 'null', name: 'NULL SOVEREIGN', hp: 14000, r: 58, color: '#c46bff', speed: 58, patterns: ['spiral', 'radial', 'charge', 'sweep', 'summon'] },
];

/* Scripted run events (seconds). Hordes also repeat every 150s. */
export const EVENTS = [
  { t: 75, type: 'horde', msg: 'SWARM INBOUND' },
  { t: 150, type: 'horde', msg: 'SWARM INBOUND' },
  { t: 300, type: 'boss', boss: 0, msg: 'WARNING: THE WARDEN' },
  { t: 450, type: 'horde', msg: 'MASS SWARM INBOUND' },
  { t: 600, type: 'boss', boss: 1, msg: 'WARNING: HIVEMIND' },
  { t: 750, type: 'horde', msg: 'MASS SWARM INBOUND' },
  { t: 900, type: 'boss', boss: 2, msg: 'FINAL WARNING: NULL SOVEREIGN' },
  { t: 1200, type: 'win', msg: 'PROTOCOL BROKEN' },
];

/* ─────────────────────────── META UPGRADES ─────────────────────────── */
export const META = {
  vitality:  { name: 'VITALITY', icon: 'heart', max: 6, base: 350, growth: 1.55, eff: '+15 max HP', mods: { hpAdd: 15 } },
  power:     { name: 'POWER', icon: 'sword', max: 6, base: 400, growth: 1.55, eff: '+5% damage', mods: { dmgMul: 1.05 } },
  swift:     { name: 'SWIFT', icon: 'speed', max: 4, base: 350, growth: 1.6, eff: '+4% move speed', mods: { spdMul: 1.04 } },
  guard:     { name: 'GUARD', icon: 'shield', max: 3, base: 600, growth: 1.7, eff: '+1 armor', mods: { armorAdd: 1 } },
  wisdom:    { name: 'WISDOM', icon: 'book', max: 4, base: 450, growth: 1.6, eff: '+8% XP gain', mods: { xpMul: 1.08 } },
  greedm:    { name: 'GREED', icon: 'coin', max: 4, base: 400, growth: 1.6, eff: '+12% coins', mods: { coinMul: 1.12 } },
  revive:    { name: 'REVIVE', icon: 'revive', max: 2, base: 1500, growth: 2.0, eff: '+1 revive charge', mods: { reviveAdd: 1 } },
  headstart: { name: 'HEAD START', icon: 'star', max: 3, base: 900, growth: 1.8, eff: 'Start +1 level', mods: { startLevelAdd: 1 } },
  choice:    { name: 'EXTRA CHOICE', icon: 'layers', max: 1, base: 2600, growth: 1, eff: '+1 upgrade card', mods: { choiceAdd: 1 } },
  reroll:    { name: 'REROLL', icon: 'dice', max: 2, base: 800, growth: 1.8, eff: '+1 reroll per run', mods: { rerollAdd: 1 } },
  dashmaster:{ name: 'DASH MASTER', icon: 'bolt', max: 3, base: 500, growth: 1.7, eff: '-18% dash cooldown', mods: { dashMul: 0.82 } },
  magnetm:   { name: 'TRACTOR', icon: 'magnet', max: 3, base: 300, growth: 1.6, eff: '+25% pickup radius', mods: { magnetMul: 1.25 } },
};
export const metaCost = (def, lvl) => Math.round(def.base * Math.pow(def.growth, lvl));

/* XP curve: xp needed to go from level n to n+1 */
export const xpForLevel = (n) => Math.floor(6 + n * 5 + Math.pow(n, 1.55) * 2.2);

/* filler offers when everything is maxed */
export const FILLERS = [
  { id: 'f_heal', name: 'FIELD REPAIR', icon: 'heart', rarity: 'common', color: '#ff8fb0', desc: 'Restore 35% max HP' },
  { id: 'f_bomb', name: 'VOID BOMB', icon: 'bomb', rarity: 'uncommon', color: '#ff9d3d', desc: 'Detonate: massive damage to all on screen' },
  { id: 'f_coin', name: 'SALVAGE', icon: 'coin', rarity: 'common', color: '#ffc93d', desc: '+60 coins right now' },
  { id: 'f_magnet', name: 'TRACTOR PULSE', icon: 'magnet', rarity: 'common', color: '#5cffd4', desc: 'Pull every pickup to you' },
];

export const weaponList = () => Object.entries(WEAPONS).map(([id, d]) => ({ id, ...d }));
export const passiveList = () => Object.entries(PASSIVES).map(([id, d]) => ({ id, ...d }));
export const rollRarity = (luck) => {
  const entries = Object.entries(RARITY);
  let total = 0; const weights = entries.map(([k, v]) => { const w = v.w * (1 + (k === 'epic' || k === 'legendary' ? luck : 0)); total += w; return w; });
  let r = Math.random() * total;
  for (let i = 0; i < entries.length; i++) { r -= weights[i]; if (r <= 0) return entries[i][0]; }
  return 'common';
};
export const _unused = { rand, chance };
