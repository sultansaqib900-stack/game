/* ══ NEONVOID UI: screens, HUD, level-up cards, hangar shop, settings, consent, ad buttons ══ */
import { fmtTime, fmtNum, clamp } from '../core/engine.js';
import { ads } from '../ads/ads.js';
import { audio } from '../audio/audio.js';
import { META, WEAPONS, PASSIVES, metaCost, xpForLevel } from '../game/content.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = ['boot', 'menu', 'how', 'hangar', 'settings', 'pause', 'levelup', 'over'].map(n => $('scr-' + n));
    this.byName = {}; this.screens.forEach(s => this.byName[s.id.replace('scr-', '')] = s);
    this.backTarget = 'menu';
    this.toastT = 0;
    this.bind();
    hydrateIcons();
  }

  /* ── wiring ────────────────────────────────────────────────────── */
  bind() {
    const g = this.game;
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { audio.sfx('ui'); fn(e); }); };

    on('btn-play', () => { g._banked = false; g.startRun(); });
    on('btn-hangar', () => this.show('hangar'));
    on('btn-how', () => this.show('how'));
    on('btn-how-play', () => { g._banked = false; g.startRun(); });
    on('btn-pause-how', () => { this.backTarget = 'pause'; this.show('how'); });
    on('btn-settings', () => { this.backTarget = this.current === 'pause' ? 'pause' : 'menu'; this.renderSettings(); this.show('settings'); });
    on('btn-resume', () => g.resume());
    on('btn-pause-settings', () => { this.backTarget = 'pause'; this.renderSettings(); this.show('settings'); });
    on('btn-quit', () => g.toMenu());
    on('btn-pause', () => g.pause());
    on('btn-reroll', () => { if (g.rerolls > 0) g.rerollPool(false); else audio.sfx('deny'); });
    on('btn-reroll-ad', async () => {
      const r = await ads.showRewarded('free_reroll');
      if (r.completed) g.rerollPool(true);
    });
    on('btn-skip', () => { g.world.player.coins += 10; g.pendingLevels--; g.toast('+10 COINS (skip)'); if (g.pendingLevels > 0) g.openLevelUp(); else { g.state = 'play'; g.input.enabled = true; ads.gameplayStart(); g.emit('state', 'play'); } });
    on('btn-revive', async () => {
      const btn = $('btn-revive'); btn.disabled = true;
      const ok = await g.tryRevive();
      btn.disabled = false;
      if (!ok) g.toast('REVIVE UNAVAILABLE');
    });
    on('btn-double', async () => {
      const ok = await g.doubleCoins();
      if (ok) { $('over-coins').textContent = '+' + fmtNum(g.coinsEarned); $('btn-double').disabled = true; g.toast('COINS DOUBLED'); }
    });
    on('btn-continue', () => { g.bankCoins(); g.toMenu(); });
    on('btn-crate', async () => {
      const today = new Date().toDateString();
      if (g.save.crateDay === today) { g.toast('CRATE ALREADY OPENED TODAY'); audio.sfx('deny'); return; }
      const r = await ads.showRewarded('daily_crate');
      if (r.completed) {
        g.save.crateDay = today;
        const coins = 150 + Math.floor(Math.random() * 250);
        g.save.coins += coins; g.persist();
        g.toast('CRATE OPENED: +' + coins + ' COINS'); audio.sfx('chest');
        this.renderHangar();
      }
    });
    on('btn-test-ad', async () => { const r = await ads.showRewarded('test'); g.toast(r.completed ? 'REWARDED FLOW OK' : 'REWARDED NOT COMPLETED'); });

    // mobile dash button
    const dash = $('btn-dash');
    const press = (e) => { e.preventDefault(); g.input.press('dash'); };
    const rel = () => g.input.release('dash');
    dash.addEventListener('pointerdown', press);
    addEventListener('pointerup', rel); addEventListener('pointercancel', rel);

    document.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => {
      audio.sfx('ui');
      const t = el.dataset.go;
      if (t === 'back') this.show(this.backTarget === 'pause' ? 'pause' : 'menu');
      else this.show(t);
    }));
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      audio.sfx('ui');
      if (t.dataset.tab === 'settings') { this.backTarget = 'hangar'; this.renderSettings(); this.show('settings'); return; }
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      this.hangarTab = t.dataset.tab; this.renderHangar();
    }));

    // consent
    on('consent-yes', () => { this.game.save.consent = true; this.game.persist(); ads.setConsent(true); $('consent').hidden = true; });
    on('consent-no', () => { this.game.save.consent = false; this.game.persist(); ads.setConsent(false); $('consent').hidden = true; });

    // game events
    g.on('state', (s) => this.onState(s));
    g.on('hud', () => this.hud());
    g.on('items', () => this.hudItems());
    g.on('levelup', (offers) => this.renderLevelUp(offers));
    g.on('over', (o) => this.renderOver(o));
    g.on('boss', (e) => { $('hud-boss').hidden = !e; if (e) $('hud-bossname').textContent = e.name; });
    g.on('toast', (m) => this.toast(m));
    g.on('hint', () => this.showHint());
    ads.on('status', () => this.renderAdStatus());
    ads.on('ready', () => this.renderAdStatus());
    ads.on('log', (m) => this.toast('[ads] ' + m));
    ads.on('consent:needed', () => { if (this.game.save.consent === null) $('consent').hidden = false; });
    ads.on('ad:start', () => { audio.sfx('ad'); });
  }

  /* ── screens ───────────────────────────────────────────────────── */
  show(name) {
    this.current = name;
    for (const s of this.screens) s.hidden = s.id !== 'scr-' + name;
    $('hud').hidden = !(name === 'play' || name === 'pause' || name === 'levelup');
    // banners only on menus
    if (['menu', 'hangar', 'settings'].includes(name)) ads.showBanner($('banner-slot'));
    else ads.hideBanner();
    if (name === 'hangar') this.renderHangar();
    if (name === 'menu') this.renderMenu();
    hydrateIcons();
  }
  onState(s) {
    if (s === 'play') { this.show('none'); $('hud').hidden = false; this.hud(); this.hudItems(); }
    else if (s === 'menu') this.show('menu');
    else if (s === 'pause') this.show('pause');
    else if (s === 'levelup') this.show('levelup');
    else if (s === 'over' || s === 'win') this.show('over');
  }
  renderMenu() {
    const b = this.game.save.best;
    $('best-time').textContent = b.time ? fmtTime(b.time) : '—';
    $('best-level').textContent = b.level || '—';
    $('best-kills').textContent = b.kills ? fmtNum(b.kills) : '—';
    $('menu-coins').textContent = fmtNum(this.game.save.coins);
  }

  /* ── HUD ───────────────────────────────────────────────────────── */
  hud() {
    const g = this.game, p = g.world.player;
    if (!p || $('hud').hidden) return;
    const need = xpForLevel(p.level);
    $('hud-level').textContent = 'LV ' + p.level;
    $('hud-xp').style.width = clamp(p.xp / need * 100, 0, 100) + '%';
    $('hud-timer').textContent = fmtTime(g.time);
    $('hud-coins').textContent = fmtNum(p.coins);
    $('hud-kills').textContent = fmtNum(p.kills);
    $('hud-hp').style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
    const st = $('hud-streak');
    if (p.streak >= 5) { st.textContent = 'x' + p.streak + ' STREAK'; st.classList.add('on'); }
    else st.classList.remove('on');
    if (g.boss && !$('hud-boss').hidden) $('hud-bosshp').style.width = clamp(g.boss.hp / g.boss.maxHp * 100, 0, 100) + '%';
    // dash ring
    const cdMax = p.dashCdMax * (g.mods.dashMul || 1);
    const frac = 1 - clamp(p.dashCd / cdMax, 0, 1);
    const ring = $('dash-ring');
    ring.style.strokeDashoffset = String(276.5 * (1 - frac));
    $('btn-dash').classList.toggle('ready', frac >= 1);
    // touch controls visibility (idle base ring sits left-middle like the concept art)
    const touch = g.input.touch;
    const stickEl = $('touch-stick');
    stickEl.hidden = !touch || g.state !== 'play';
    if (touch && g.state === 'play') {
      if (g.input.stick.active) {
        const s = g.input.stickScreen;
        stickEl.style.left = (s.x - 66) + 'px'; stickEl.style.top = (s.y - 66) + 'px';
        stickEl.firstElementChild.style.transform = `translate(${s.dx}px,${s.dy}px)`;
      } else {
        stickEl.style.left = 'calc(14vw - 66px)'; stickEl.style.top = 'calc(62vh - 66px)';
        stickEl.firstElementChild.style.transform = 'translate(0,0)';
      }
    }
  }
  hudItems() {
    const p = this.game.world.player;
    const el = $('hud-items');
    let html = '';
    for (const w of p.weapons) html += `<span class="item-ic" style="color:${w.def.color}" title="${w.def.name} LV${w.level}">${icon(w.def.icon)}<b class="lv">${w.level}</b></span>`;
    for (const [id, lvl] of Object.entries(p.passives)) { const d = PASSIVES[id]; if (d) html += `<span class="item-ic" style="color:${d.color}" title="${d.name} LV${lvl}">${icon(d.icon)}<b class="lv">${lvl}</b></span>`; }
    el.innerHTML = html;
  }

  /* ── level up ──────────────────────────────────────────────────── */
  renderLevelUp(offers) {
    const g = this.game;
    $('cards').innerHTML = offers.map((o, i) => {
      const rarity = o.rarity || 'common';
      const cls = 'r-' + rarity;
      const max = o.kind === 'weapon' ? o.def.levels.length + 1 : o.kind === 'passive' ? o.def.max : 1;
      const lvl = o.kind === 'filler' ? 1 : o.level;
      const pips = Array.from({ length: max }, (_, k) => `<i class="pip ${k < lvl ? 'on' : ''}"></i>`).join('');
      const text = o.kind === 'weapon' ? (o.isNew ? o.def.desc : (o.def.levels[o.level - 2]?.text || o.def.desc))
        : o.kind === 'passive' ? o.def.desc : o.desc;
      return `<button class="card ${cls}" data-offer="${i}">
        <span class="hex">${icon(o.def?.icon || o.icon)}</span>
        <b>${o.def?.name || o.name}</b>
        <span class="pill">${o.isNew ? 'NEW' : 'LV ' + o.level}</span>
        <p>${text}</p>
        <span class="pips">${pips}</span>
      </button>`;
    }).join('');
    $('cards').querySelectorAll('[data-offer]').forEach(b => b.addEventListener('click', () => {
      audio.sfx('ui');
      g.chooseOffer(g.offers[+b.dataset.offer]);
    }));
    $('reroll-count').textContent = g.rerolls;
    $('btn-reroll').disabled = g.rerolls <= 0;
    $('btn-reroll-ad').hidden = !ads.rewardedAvailable;
    // dynamic bonus-card ad button
    let bc = $('btn-bonus-card');
    if (!bc) {
      bc = document.createElement('button');
      bc.id = 'btn-bonus-card'; bc.className = 'btn btn-ad btn-violet';
      bc.innerHTML = `${icon('play')}+1 CARD — WATCH AD`;
      bc.addEventListener('click', async () => {
        const r = await ads.showRewarded('bonus_card');
        if (r.completed) { g.bonusCards++; g.openLevelUpExtra(); }
      });
      document.querySelector('.levelup-actions').appendChild(bc);
    }
    bc.hidden = !ads.rewardedAvailable;
    hydrateIcons($('cards'));
  }

  /* ── game over ─────────────────────────────────────────────────── */
  renderOver({ win, rec }) {
    const g = this.game, p = g.world.player;
    $('over-title').textContent = win ? 'PROTOCOL BROKEN' : 'SIGNAL LOST';
    $('over-title').className = 'scr-title big ' + (win ? 'glow-cyan' : 'glow-magenta');
    $('over-sub').textContent = (win ? 'VOID CLEARED AT ' : 'RUN TERMINATED AT ') + fmtTime(rec.time);
    $('over-stats').innerHTML = [
      ['target', 'LEVEL', p.level], ['skull', 'KILLS', fmtNum(p.kills)],
      ['coin', 'COINS', fmtNum(p.coins)], ['flame', 'DAMAGE', fmtNum(p.dmgDealt)],
      ['clock', 'TIME', fmtTime(rec.time)], ['star', 'BEST STREAK', 'x' + p.bestStreak],
    ].map(([ic, k, v]) => `<div class="kv"><span>${icon(ic)}${k}</span><b>${v}</b></div>`).join('');
    // coin count-up
    clearInterval(this._coinIv);
    const coinEl = $('over-coins'), target = g.coinsEarned, t0 = performance.now();
    this._coinIv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      coinEl.textContent = '+' + fmtNum(target * (1 - Math.pow(1 - k, 3)));
      if (k >= 1) clearInterval(this._coinIv);
    }, 33);
    const canRevive = ads.rewardedAvailable && g.revivesUsed < g.reviveCharges;
    $('btn-revive').hidden = !canRevive;
    $('revive-tag').textContent = (g.reviveCharges - g.revivesUsed) + ' LEFT';
    $('btn-double').hidden = !ads.rewardedAvailable || g.doubled;
    $('btn-double').disabled = g.doubled;
    hydrateIcons($('over-stats'));
  }

  /* ── hangar ────────────────────────────────────────────────────── */
  renderHangar() {
    const g = this.game;
    $('hangar-coins').textContent = fmtNum(g.save.coins);
    const tab = this.hangarTab || 'upgrades';
    $('hangar-grid').hidden = tab === 'runs';
    $('hangar-runs').hidden = tab !== 'runs';
    $('btn-crate').hidden = tab !== 'upgrades' || !ads.rewardedAvailable;
    if (tab === 'runs') {
      $('hangar-runs').innerHTML = g.save.runs.length ? g.save.runs.map(r =>
        `<div class="run-row"><span>${new Date(r.date).toLocaleDateString()}</span><b>${r.win ? '★ WIN' : 'LOST'}</b><span>${fmtTime(r.time)}</span><span>LV ${r.level}</span><span>${fmtNum(r.kills)} kills</span><b style="color:var(--gold)">+${fmtNum(r.coins)}</b></div>`).join('')
        : '<div class="run-row"><span>No runs recorded yet. Deploy and survive.</span></div>';
      return;
    }
    if (tab === 'weapons') {
      $('hangar-grid').innerHTML = [...Object.values(WEAPONS), ...Object.values(PASSIVES)].map(d =>
        `<div class="shop-card"><div class="head"><span class="hex" style="color:${d.color}">${icon(d.icon)}</span><div><b>${d.name}</b><div class="eff" style="color:${d.color}">${d.rarity.toUpperCase()}</div></div></div><div class="eff" style="color:#9fb3c8">${d.desc}</div></div>`).join('');
      hydrateIcons($('hangar-grid'));
      return;
    }
    $('hangar-grid').innerHTML = Object.entries(META).map(([id, d]) => {
      const lvl = g.save.meta[id] || 0;
      const maxed = lvl >= d.max;
      const cost = metaCost(d, lvl);
      const afford = g.save.coins >= cost;
      return `<button class="shop-card ${maxed ? 'max' : afford ? 'afford' : 'locked'}" data-meta="${id}">
        <div class="head"><span class="hex">${icon(d.icon)}</span><div><b>${d.name}</b><div class="eff">${d.eff}</div></div></div>
        <div class="pips">${Array.from({ length: d.max }, (_, k) => `<i class="pip ${k < lvl ? 'on' : ''}"></i>`).join('')}</div>
        <span class="price">${maxed ? 'MAX' : icon('coin') + fmtNum(cost)}</span>
      </button>`;
    }).join('');
    $('hangar-grid').querySelectorAll('[data-meta]').forEach(b => b.addEventListener('click', () => {
      if (g.buyMeta(b.dataset.meta)) this.renderHangar();
    }));
    this.renderAdStatus();
    hydrateIcons($('hangar-grid'));
  }
  renderAdStatus() {
    const s = ads.status();
    const set = (id, ok, warn, txt) => {
      const dot = $(id); dot.className = 'dot' + (ok ? '' : warn ? ' warn' : ' off');
      $(id + '-t').textContent = txt;
    };
    set('st-rewarded', s.rewarded, false, 'REWARDED ' + (s.rewarded ? (s.rewardedNative ? 'READY' : 'READY (MOCK)') : 'OFF'));
    set('st-provider', s.provider !== 'none' && s.provider !== 'off', s.provider === 'mock', 'PROVIDER: ' + s.provider.toUpperCase());
    set('st-banner', s.banner, false, 'BANNER ' + (s.banner ? 'ON (MENUS)' : 'OFF'));
  }

  /* ── settings ──────────────────────────────────────────────────── */
  renderSettings() {
    const s = this.game.save.settings;
    const row = (label, ctrl) => `<div class="set-row"><span>${label}</span>${ctrl}</div>`;
    const slider = (id, val) => `<input type="range" min="0" max="1" step="0.05" value="${val}" data-set="${id}">`;
    const toggle = (id, on) => `<button class="toggle ${on ? 'on' : ''}" data-toggle="${id}"><i></i></button>`;
    $('settings-panel').innerHTML =
      row('MUSIC VOLUME', slider('music', s.music)) +
      row('SFX VOLUME', slider('sfx', s.sfx)) +
      row('MUTE ALL', toggle('muted', s.muted)) +
      row('SCREEN SHAKE', toggle('shake', s.shake)) +
      row('REDUCE FLASH', toggle('reduceFlash', s.reduceFlash)) +
      row('AIM MODE', `<button class="btn btn-ghost btn-sm" data-cycle="aim">${(s.aim || 'auto').toUpperCase()}</button>`) +
      row('QUALITY', `<button class="btn btn-ghost btn-sm" data-cycle="quality">${s.quality.toUpperCase()}</button>`);
    $('settings-panel').querySelectorAll('[data-set]').forEach(el => el.addEventListener('input', () => {
      s[el.dataset.set] = +el.value; this.game.applySettings(); this.game.persist();
    }));
    $('settings-panel').querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => {
      const k = el.dataset.toggle; s[k] = !s[k]; el.classList.toggle('on', s[k]);
      this.game.applySettings(); this.game.persist(); audio.sfx('ui');
    }));
    $('settings-panel').querySelectorAll('[data-fs]').forEach(el => el.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch?.(() => {});
    }));
    $('settings-panel').querySelectorAll('[data-cycle]').forEach(el => el.addEventListener('click', () => {
      const kind = el.dataset.cycle;
      if (kind === 'aim') {
        const order = ['auto', 'cursor'];
        s.aim = order[(order.indexOf(s.aim || 'auto') + 1) % order.length];
        el.textContent = s.aim.toUpperCase();
        this.game.toast(s.aim === 'cursor' ? 'AIM: FIRE TOWARDS CURSOR' : 'AIM: AUTO-TARGET NEAREST');
      } else {
        const order = ['auto', 'low', 'med', 'high'];
        s.quality = order[(order.indexOf(s.quality) + 1) % order.length];
        el.textContent = s.quality.toUpperCase();
        this.game.quality = s.quality === 'auto' ? (innerWidth < 800 ? 'med' : 'high') : s.quality;
        this.game.applySettings();
      }
      this.game.persist();
    }));
  }

  showHint() {
    const el = $('hint');
    el.innerHTML = '<b>MOVE</b> WASD / STICK &nbsp;·&nbsp; <b>DASH</b> SPACE &nbsp;·&nbsp; WEAPONS <b>AUTO-FIRE</b><br>collect ◆ XP shards · survive the clock';
    el.hidden = false; el.classList.remove('out');
    clearTimeout(this._hintT); clearTimeout(this._hintT2);
    this._hintT = setTimeout(() => el.classList.add('out'), 6500);
    this._hintT2 = setTimeout(() => { el.hidden = true; }, 7200);
  }
  toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { el.hidden = true; }, 2600);
  }
}
