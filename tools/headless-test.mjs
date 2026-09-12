/* Headless smoke test: boots the real game modules with a DOM/canvas shim and
   simulates gameplay frames, level-ups, chests, bombs, death, revive ads, meta shop.
   Run: node tools/headless-test.mjs                                            */

/* ── minimal DOM shim ─────────────────────────────────────────────── */
const noop = () => {};
const gradient = { addColorStop: noop };
function makeCtx() {
  const target = { canvas: null };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => gradient;
      if (k === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach(x => this.set.add(x)); }
  remove(...c) { c.forEach(x => this.set.delete(x)); }
  toggle(c, force) { if (force === undefined) { this.set.has(c) ? this.set.delete(c) : this.set.add(c); } else force ? this.set.add(c) : this.set.delete(c); }
  contains(c) { return this.set.has(c); }
}
class El {
  constructor(tag = 'div') {
    this.tagName = tag; this.style = {}; this.classList = new ClassList(); this.dataset = {};
    this.children = []; this.hidden = false; this.disabled = false; this.textContent = '';
    this._html = ''; this.firstElementChild = null; this.clientWidth = 100; this.clientHeight = 100;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.firstElementChild = this.firstElementChild || new El(); }
  addEventListener() {} removeEventListener() {}
  appendChild(c) { this.children.push(c); c.parentNode = this; this.firstElementChild = this.firstElementChild || c; return c; }
  remove() {}
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
  getContext() { this._ctx = this._ctx || makeCtx(); return this._ctx; }
  setAttribute() {} getAttribute() { return null; }
  focus() {} blur() {}
}
const els = new Map();
const byId = (id) => { if (!els.has(id)) { const e = new El('div'); e.id = id; els.set(id, e); } return els.get(id); };

globalThis.window = globalThis;
globalThis.location = { search: '', href: 'http://localhost:8080/', pathname: '/' };
globalThis.document = {
  hidden: false,
  getElementById: byId,
  createElement: (tag) => new El(tag),
  querySelector: () => new El(),
  querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop,
  head: new El('head'), body: new El('body'),
};
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let rafQ = [];
globalThis.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
globalThis.cancelAnimationFrame = noop;

/* ── boot the game ────────────────────────────────────────────────── */
const { Game } = await import('../src/game/game.js');
const { UI } = await import('../src/ui/ui.js');
const { ads } = await import('../src/ads/ads.js');
const { audio } = await import('../src/audio/audio.js');

const game = new Game(byId('game'));
const ui = new UI(game);
game.boot();

let t = 0;
function pump(frames) {
  for (let i = 0; i < frames; i++) {
    t += 16.7;
    const q = rafQ; rafQ = [];
    q.forEach(cb => cb(t));
  }
}
const assert = (cond, msg) => { if (!cond) { console.error('✗ FAIL:', msg); process.exit(1); } console.log('✓', msg); };

assert(game.state === 'menu', 'boots to menu');

/* ── balance regression: a brand-new run must not melt in seconds ── */
{
  game.startRun();
  const p0 = game.world.player;
  p0.weapons.length = 0;   // worst case: no weapons, standing still
  // three grunts glued to a standing player for 5 simulated seconds
  for (let i = 0; i < 3; i++) game.world.spawnEnemy('grunt', p0.x + 20, p0.y + 20);
  pump(300);
  assert(p0.hp > 60, 'survives 3 point-blank grunts for 5s (hp=' + Math.round(p0.hp) + '/110)');
  // opening spawn pressure stays gentle
  game.startRun();
  pump(60 * 15);
  assert(game.world.enemies.alive < 22, 'opening 15s spawn pressure is gentle (' + game.world.enemies.alive + ' alive)');
  game.toMenu();
}
await ads.init();
assert(ads.providerName === 'mock', 'ad provider falls back to mock without IDs');
assert(ads.rewardedAvailable === true, 'rewarded ads available via mock fallback');

/* simulate a run: move in a circle, auto-combat, force level-ups */
game.startRun();
assert(game.state === 'play', 'run starts');
game.input.move.x = 0.7; game.input.move.y = 0.3;
pump(420);   // ~7s: gentle open means first spawns land after the ramp-in
assert(game.world.enemies.alive > 0, 'enemies spawn (' + game.world.enemies.alive + ' alive)');
game.world.player.x = 1600; game.world.player.y = 1200;
for (let i = 0; i < 40; i++) game.world.spawnEnemy('grunt', 1600 + Math.cos(i) * 120, 1200 + Math.sin(i) * 120);
pump(240);
assert(game.world.player.kills > 0, 'weapons kill enemies (kills=' + game.world.player.kills + ')');
assert(game.world.player.dmgDealt > 0, 'damage recorded');

/* level-up flow */
game.gainXp(500);
assert(game.state === 'levelup', 'level-up opens');
assert(game.offers.length === 3, 'three upgrade cards offered');
let guard = 0;
while (game.state === 'levelup' && guard++ < 60) game.chooseOffer(game.offers[0]);
assert(game.state === 'play', 'choosing cards resumes play (multi-level queue drained)');
assert(game.world.player.level > 2, 'multiple levels granted (' + game.world.player.level + ')');
assert(game.world.player.weapons.length + Object.keys(game.world.player.passives).length >= 2, 'upgrades applied');

/* reroll via rewarded ad (mock completes after countdown) */
game.gainXp(400);
guard = 0; while (game.state === 'levelup' && guard++ < 60) game.chooseOffer(game.offers[0]);
const adPromise = ads.showRewarded('test');
await new Promise(r => setTimeout(r, 5400));
const adRes = await adPromise;
assert(adRes.completed === true, 'mock rewarded ad completes');
if (game.state !== 'levelup') game.openLevelUp();
game.rerollPool(true);
assert(game.offers.length === 3, 'ad-funded reroll rebuilds three offers');
guard = 0; while (game.state === 'levelup' && guard++ < 60) game.chooseOffer(game.offers[0]);

/* chest, bomb, pickups */
game.openChest();
game.useBomb();
game.world.spawnPickup('coin', game.world.player.x, game.world.player.y, 5);
game.world.spawnPickup('xp', game.world.player.x + 4, game.world.player.y, 3);
pump(60);

/* boss + horde events fire over a long simulated run */
game.time = 301; game.eventIdx = 0; game.director(0.016);
pump(60);
assert(!!game.boss, 'boss spawns at 5:00 event');
game.world.damageEnemy(game.boss, 999999, { src: 'test' });
pump(30);
assert(!game.boss, 'boss dies and clears');

/* death → game over → revive via rewarded ad */
game.world.player.hp = 1; game.world.player.iframes = 0;
game.damagePlayerTest = null;
game.world.damagePlayer(999);
assert(game.state === 'over', 'death ends the run');
assert(game.save.runs.length === 1, 'run recorded');
const revived = await game.tryRevive();
assert(revived === true, 'revive via rewarded ad restores play');
assert(game.state === 'play' && game.world.player.hp > 0, 'player alive after revive');

/* end again, bank coins, meta shop */
game.world.player.iframes = 0; game.world.damagePlayer(99999);
assert(game.state === 'over', 'second death ends run');
const before = game.save.coins;
game.bankCoins();
assert(game.save.coins > before, 'coins banked to save (' + game.save.coins + ')');
game.save.coins = 100000; game.persist();
assert(game.buyMeta('vitality') === true, 'meta upgrade purchasable');
assert(game.save.meta.vitality === 1, 'meta level stored');

/* interstitial policy */
assert(ads._history.some(h => h.type === 'interstitial'), 'post-run interstitial fired automatically');
assert(ads.canShowInterstitial().why === 'too-soon' || ads.canShowInterstitial().ok === false, 'second interstitial throttled (min gap)');
ads._lastInterstitial = 0; ads._history.length = 0;
assert(ads.canShowInterstitial().why === 'back-to-back', 'never back-to-back on the same run');
ads._lastInterstitialRun = -1;
ads.context.runSeconds = 200;
assert(ads.canShowInterstitial().ok === true, 'interstitial allowed after long run once gap elapsed');
ads.context.runSeconds = 10;
assert(ads.canShowInterstitial().ok === false, 'interstitial blocked for short runs');

/* render path exercised every pump; do a big one with lots of entities */
game.toMenu(); game.startRun();
for (let i = 0; i < 200; i++) game.world.spawnEnemy(['grunt', 'runner', 'brute', 'spitter', 'orbiter', 'phantom', 'swarm'][i % 7], 400 + (i % 20) * 100, 300 + (i % 12) * 100);
pump(300);
assert(game.world.enemies.alive > 100, 'handles 100+ entities (' + game.world.enemies.alive + ')');
game.pause(); assert(game.state === 'pause', 'pause works');
game.resume(); assert(game.state === 'play', 'resume works');

console.log('\nALL HEADLESS CHECKS PASSED');
console.log('kills:', game.world.player.kills, '| level:', game.world.player.level, '| enemies:', game.world.enemies.alive, '| particles:', game.world.particles.alive);
process.exit(0);
