/* ══ NEONVOID AdManager: one API over every provider, with policy + fail-open ══
   Placements used by the game:
     rewarded  → 'revive' | 'double_coins' | 'free_reroll' | 'daily_crate' | 'starter_boost' | 'test'
     interstitial → 'post_run'
   Rules enforced here:
     · rewarded ads are ALWAYS opt-in (a click), never automatic
     · rewarded fails open on SDK error/timeout (failOpen in adConfig)
     · interstitials throttled: min gap, min run length, max per hour, never back-to-back
     · gameplay (audio/loop/input) is suspended around every ad via gameplayStop/Start
     · banner only on menus, and only when policy.banner.enabled
════════════════════════════════════════════════════════════════════ */
import { Bus } from '../core/engine.js';
import { AD_CONFIG } from './adConfig.js';
import { PROVIDERS, MockProvider } from './providers.js';

const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res({ completed: false, reason: 'timeout' }), ms))]);

class AdManager extends Bus {
  constructor() {
    super();
    this.provider = null;
    this.providerName = 'none';
    this.enabled = true;
    this.debug = false;
    this.consent = null;                    // null=unknown, true/false after choice
    this.context = { runSeconds: 0 };
    this._history = [];                     // {type, placement, ts, completed}
    this._mock = new MockProvider();
    this.bannerEl = null;
    this._lastInterstitial = 0;
    this._lastInterstitialRun = -1;
  }

  get params() { return new URLSearchParams(location.search); }

  async init() {
    this.debug = this.params.has('adsDebug');
    const forced = this.params.get('ads');
    if (forced === 'off') { this.enabled = false; this.providerName = 'off'; this._log('ads disabled via ?ads=off'); return; }
    await this._mock.init();
    const want = forced || AD_CONFIG.provider;
    this.providerName = want === 'auto' ? this._autodetect() : want;
    this.provider = await this._tryLoad(this.providerName);
    if (!this.provider) { this.providerName = 'mock'; this.provider = this._mock; }
    // consent gate for real networks
    if (AD_CONFIG.consentGate && this.consent === null && this.providerName !== 'mock') {
      this.emit('consent:needed');
    }
    this._log(`provider ready: ${this.providerName}${this.provider !== this._mock ? '' : ' (placeholder ads)'}`);
    this.emit('ready', this.status());
  }

  _autodetect() {
    if (window.PokiSDK) return 'poki';
    if (window.CrazyGames?.SDK) return 'crazygames';
    if (AD_CONFIG.gpt.slotPath) return 'gpt';
    if (AD_CONFIG.adsense.client) return 'adsense';
    return 'mock';
  }

  async _tryLoad(name) {
    const Ctor = PROVIDERS[name];
    if (!Ctor) return null;
    const p = new Ctor();
    try {
      await p.init(name === 'gpt' ? AD_CONFIG.gpt : name === 'adsense' ? AD_CONFIG.adsense : AD_CONFIG[name] || {});
      this._log(`${name}: initialized`);
      return p;
    } catch (e) {
      this._log(`${name}: unavailable (${e.message}) → fallback`);
      return null;
    }
  }

  /* ── consent ─────────────────────────────────────────────────────── */
  setConsent(granted) {
    this.consent = granted;
    this.provider?.setConsent?.(granted);
    this._mock.setConsent(granted);
    this.emit('status', this.status());
  }

  /* ── portal / gameplay lifecycle ─────────────────────────────────── */
  gameplayStart() { this.provider?.gameplayStart?.(); }
  gameplayStop() { this.provider?.gameplayStop?.(); }

  /* ── rewarded ────────────────────────────────────────────────────── */
  get rewardedAvailable() {
    if (!this.enabled || !AD_CONFIG.policy.rewarded.enabled) return false;
    if (this.provider?.supported.rewarded) return true;
    return AD_CONFIG.fallbackRewarded === 'mock';
  }
  async showRewarded(placement) {
    if (!this.enabled || !AD_CONFIG.policy.rewarded.enabled) return { completed: false, reason: 'disabled' };
    this.emit('ad:start', { type: 'rewarded', placement });
    this.gameplayStop();
    let result;
    try {
      if (this.provider?.supported.rewarded) {
        result = await withTimeout(this.provider.showRewarded(placement), 30000);
      } else if (AD_CONFIG.fallbackRewarded === 'mock') {
        result = await this._mock.showRewarded(placement);
      } else {
        result = { completed: false, reason: 'unsupported' };
      }
    } catch (e) {
      result = { completed: false, reason: 'error' };
    }
    if (!result.completed && AD_CONFIG.failOpen && (result.reason === 'error' || result.reason === 'timeout')) {
      this._log(`rewarded '${placement}' failed (${result.reason}) → fail-open grant`);
      result = { completed: true, failOpen: true, reason: result.reason };
    }
    this._record('rewarded', placement, result.completed);
    this.gameplayStart();
    this.emit('ad:end', { type: 'rewarded', placement, ...result });
    this.emit('status', this.status());
    return result;
  }

  /* ── interstitial (auto, throttled) ──────────────────────────────── */
  canShowInterstitial() {
    const p = AD_CONFIG.policy.interstitial;
    if (!this.enabled || !p.enabled) return { ok: false, why: 'disabled' };
    if (!this.provider?.supported.interstitial && this.providerName !== 'mock') return { ok: false, why: 'unsupported' };
    const now = Date.now();
    if (this.context.runSeconds < p.minRunSec) return { ok: false, why: 'run-too-short' };
    if (now - this._lastInterstitial < p.minGapSec * 1000) return { ok: false, why: 'too-soon' };
    const hour = this._history.filter(h => h.type === 'interstitial' && now - h.ts < 3600e3).length;
    if (hour >= p.maxPerHour) return { ok: false, why: 'hour-cap' };
    if (p.neverBackToBack && this._lastInterstitialRun === this.context.runId) return { ok: false, why: 'back-to-back' };
    return { ok: true };
  }
  async showInterstitial(placement = 'post_run') {
    const gate = this.canShowInterstitial();
    if (!gate.ok) { this._log(`interstitial skipped (${gate.why})`); return { shown: false, reason: gate.why }; }
    this.emit('ad:start', { type: 'interstitial', placement });
    this.gameplayStop();
    try {
      if (this.provider?.supported.interstitial) await withTimeout(this.provider.showInterstitial(placement), 30000);
      else await this._mock.showInterstitial(placement);
    } catch {}
    this._lastInterstitial = Date.now();
    this._lastInterstitialRun = this.context.runId;
    this._record('interstitial', placement, true);
    this.gameplayStart();
    this.emit('ad:end', { type: 'interstitial', placement, shown: true });
    return { shown: true };
  }

  /* ── banner (menus only) ─────────────────────────────────────────── */
  get bannerEnabled() { return this.enabled && AD_CONFIG.policy.banner.enabled && !!this.provider?.supported.banner; }
  showBanner(el) {
    this.bannerEl = el;
    if (!this.bannerEnabled) { el.hidden = true; el.classList.remove('filled'); return; }
    el.hidden = false; el.classList.add('filled');
    this.provider.mountBanner(el);
    this.emit('status', this.status());
  }
  hideBanner() {
    if (this.bannerEl) { this.provider?.unmountBanner?.(this.bannerEl); this.bannerEl.hidden = true; this.bannerEl.classList.remove('filled'); }
  }

  /* ── introspection ───────────────────────────────────────────────── */
  status() {
    return {
      provider: this.providerName,
      rewarded: this.rewardedAvailable,
      rewardedNative: !!this.provider?.supported.rewarded,
      banner: this.bannerEnabled,
      consent: this.consent,
      history: this._history.slice(-12),
    };
  }
  _record(type, placement, completed) {
    this._history.push({ type, placement, completed, ts: Date.now() });
    if (this._history.length > 200) this._history.shift();
    this._log(`${type} '${placement}' → ${completed ? 'completed' : 'not completed'}`);
  }
  _log(msg) {
    if (!this.debug) return;
    console.info('[ads]', msg);
    this.emit('log', msg);
  }
}

export const ads = new AdManager();
