/* Visual verification: screenshots every screen of the running game.
   Usage: node tools/shot.mjs [url]      (server must be running)        */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
mkdirSync('shots', { recursive: true });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[CONSOLE.ERROR]', m.text()); });

await page.goto(url, { waitUntil: 'networkidle0' });
await wait(1500);
await page.screenshot({ path: 'shots/01-menu.png' });

/* gameplay: start a run, stock the build, pack the arena like the concept art */
await page.click('#btn-play');
await wait(500);
await page.evaluate(() => {
  const g = NV.game, p = g.world.player, W = NV.content.WEAPONS;
  for (const id of ['scatter', 'orbit', 'nova', 'missile', 'chain', 'drone', 'aura', 'rail']) {
    if (!p.weapons.find(w => w.id === id)) p.weapons.push({ id, def: W[id], level: 3, cd: 0.2 });
  }
  p.passives = { overclock: 2, amplifier: 2, critcore: 1, greed: 2 };
  g.computeMods(); g.emit('items');
  p.level = 12; p.coins = 312; p.kills = 847;
  const types = ['grunt', 'runner', 'swarm', 'brute', 'spitter', 'orbiter'];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * 6.283, d = 120 + Math.random() * 560;
    g.world.spawnEnemy(types[i % 6], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
  }
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.283, d = 60 + Math.random() * 620;
    g.world.spawnPickup(i % 5 === 0 ? 'coin' : 'xp', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1);
  }
  g.time = 277;
});
await wait(4200);
await page.screenshot({ path: 'shots/02-gameplay.png' });

/* level-up draft */
await page.evaluate(() => NV.game.openLevelUp());
await wait(700);
await page.screenshot({ path: 'shots/03-levelup.png' });

/* game over */
await page.evaluate(() => { NV.game.pendingLevels = 0; NV.game.state = 'play'; NV.game.world.player.iframes = 0; NV.game.world.damagePlayer(999999); });
await wait(900);
await page.screenshot({ path: 'shots/04-gameover.png' });

/* hangar */
await page.evaluate(() => {
  NV.game.bankCoins(); NV.game.save.coins = 4280; NV.game.persist();
  NV.game.toMenu(); NV.ui.show('hangar'); NV.ui.renderHangar();
});
await wait(600);
await page.screenshot({ path: 'shots/05-hangar.png' });

await browser.close();
console.log('screenshots written to shots/');
