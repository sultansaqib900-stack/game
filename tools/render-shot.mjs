/* Renders REAL gameplay frames to PNG using @napi-rs/canvas as the 2D backend,
   so the canvas art can be inspected and iterated without a browser.
   Usage: node tools/render-shot.mjs                                            */
import { createCanvas, Canvas as NapiCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';

const noop = () => {};
class ClassList { constructor(){this.s=new Set()} add(...c){c.forEach(x=>this.s.add(x))} remove(...c){c.forEach(x=>this.s.delete(x))} toggle(c,f){f?this.s.add(c):this.s.delete(c)} contains(c){return this.s.has(c)} }
class El {
  constructor(tag='div'){ this.tagName=tag; this.style={}; this.classList=new ClassList(); this.dataset={};
    this.children=[]; this.hidden=false; this.disabled=false; this.textContent=''; this._html=''; this.firstElementChild=null; }
  get innerHTML(){return this._html} set innerHTML(v){this._html=v; this.firstElementChild=this.firstElementChild||new El()}
  addEventListener(){} removeEventListener(){} appendChild(c){this.children.push(c); this.firstElementChild=this.firstElementChild||c; return c}
  remove(){} querySelector(){return new El()} querySelectorAll(){return []}
  setAttribute(){} getAttribute(){return null}
}
class CanvasEl extends El {
  constructor(w=300,h=150){ super('canvas'); this._napi = createCanvas(w,h); }
  get width(){ return this._napi.width; } set width(v){ this._napi.width = v; }
  get height(){ return this._napi.height; } set height(v){ this._napi.height = v; }
  getContext(kind){
    if (!this._ctx) {
      this._ctx = this._napi.getContext(kind);
      const raw = this._ctx.drawImage.bind(this._ctx);
      this._ctx.drawImage = (img, ...a) => raw(img instanceof CanvasEl ? img._napi : img, ...a);
    }
    return this._ctx;
  }
  png(){ return this._napi.toBuffer('image/png'); }
}
const els = new Map();
const byId = id => { if(!els.has(id)){ const e = id==='game' ? new CanvasEl() : new El(); e.id=id; els.set(id,e);} return els.get(id); };

globalThis.window = globalThis;
globalThis.location = { search:'', href:'http://localhost/', pathname:'/' };
globalThis.document = { hidden:false, getElementById:byId, createElement:t=>t==='canvas'?new CanvasEl():new El(t),
  querySelector:()=>new El(), querySelectorAll:()=>[], addEventListener:noop, removeEventListener:noop, head:new El(), body:new El() };
globalThis.addEventListener = noop; globalThis.removeEventListener = noop;
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.matchMedia = () => ({ matches:false, addEventListener:noop });
const st = new Map();
globalThis.localStorage = { getItem:k=>st.has(k)?st.get(k):null, setItem:(k,v)=>st.set(k,String(v)), removeItem:k=>st.delete(k) };
let rafQ = [];
globalThis.requestAnimationFrame = cb => { rafQ.push(cb); return rafQ.length; };
globalThis.cancelAnimationFrame = noop;

const { Game } = await import('../src/game/game.js');
const { WEAPONS } = await import('../src/game/content.js');

const canvasEl = byId('game');
const game = new Game(canvasEl);
game.boot();
game.startRun();

const p = game.world.player;
for (const id of ['scatter','orbit','nova','missile','chain','drone','aura']) {
  p.weapons.push({ id, def: WEAPONS[id], level: 3, cd: 0.15 });
}
p.passives = { overclock:2, amplifier:2, critcore:2, greed:2 };
game.computeMods();
p.level = 12; p.coins = 312; p.kills = 847;

let t = 0;
const pump = (n) => { for (let i=0;i<n;i++){ t+=16.7; const q=rafQ; rafQ=[]; q.forEach(cb=>cb(t)); } };

// pack the arena like the concept art
const types = ['grunt','runner','swarm','brute','spitter','orbiter'];
for (let i=0;i<64;i++){ const a=Math.random()*6.283, d=130+Math.random()*540;
  game.world.spawnEnemy(types[i%6], p.x+Math.cos(a)*d, p.y+Math.sin(a)*d); }
for (let i=0;i<46;i++){ const a=Math.random()*6.283, d=60+Math.random()*600;
  game.world.spawnPickup(i%5===0?'coin':'xp', p.x+Math.cos(a)*d, p.y+Math.sin(a)*d, 1); }
// wound some enemies so mini hp-bars show
for (const e of game.world.enemies.items) if (!e.dead && Math.random()<0.5) e.hp = e.maxHp * (0.3+Math.random()*0.5);
game.time = 277;
pump(90);
mkdirSync('shots', { recursive: true });
writeFileSync('shots/canvas-gameplay.png', canvasEl.png());
console.log('wrote shots/canvas-gameplay.png  enemies=', game.world.enemies.alive, 'particles=', game.world.particles.alive);

// boss frame
game.time = 301; game.eventIdx = 2; game.director(0.016);
pump(120);
writeFileSync('shots/canvas-boss.png', canvasEl.png());
console.log('wrote shots/canvas-boss.png  boss=', !!game.boss);
