/* ══ NEONVOID ad providers: mock / gpt / adsense / poki / crazygames ══
   Every provider implements:
     id, supported:{rewarded,interstitial,banner}
     init(cfg) → Promise
     showRewarded(placement) → Promise<{completed, reason?}>
     showInterstitial(placement) → Promise
     mountBanner(el) / unmountBanner()
     gameplayStart() / gameplayStop()          (portal lifecycle)
     setConsent(granted)                        (personalized vs NPA)
════════════════════════════════════════════════════════════════════ */

export function loadScript(src, attrs = {}) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    for (const k in attrs) s.setAttribute(k, attrs[k]);
    s.onload = res; s.onerror = () => rej(new Error('script failed: ' + src));
    document.head.appendChild(s);
  });
}

/* ── MOCK: fully working placeholder ads so every flow is testable offline ── */
export class MockProvider {
  id = 'mock';
  supported = { rewarded: true, interstitial: true, banner: true };
  npa = false;
  async init() { this.root = document.getElementById('ad-root'); }
  setConsent(g) { this.npa = !g; }
  gameplayStart() {} gameplayStop() {}
  _overlay({ type, placement, seconds }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'mock-ad';
      wrap.innerHTML = `
        <div class="label">ADVERTISEMENT${this.npa ? ' · NON-PERSONALIZED' : ''}</div>
        <div class="frame">
          <h3>${type === 'rewarded' ? 'REWARDED AD' : 'INTERSTITIAL'}</h3>
          <div class="count">${seconds}</div>
          <p>MOCK AD · placement: <b style="color:#e8f6ff">${placement}</b><br>
             No network configured — set provider + IDs in <b style="color:#e8f6ff">src/ads/adConfig.js</b></p>
        </div>
        <button class="btn btn-ghost btn-sm" data-skip>SKIP (DEV)</button>`;
      this.root.appendChild(wrap);
      const count = wrap.querySelector('.count');
      let left = seconds;
      const tick = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(tick); wrap.remove(); resolve({ completed: true }); }
        else count.textContent = left;
      }, 1000);
      wrap.querySelector('[data-skip]').onclick = () => {
        clearInterval(tick); wrap.remove();
        resolve({ completed: false, reason: type === 'rewarded' ? 'skipped' : 'skipped' });
      };
    });
  }
  showRewarded(placement) { return this._overlay({ type: 'rewarded', placement, seconds: 5 }); }
  showInterstitial(placement) { return this._overlay({ type: 'interstitial', placement, seconds: 3 }).then(() => ({})); }
  mountBanner(el) {
    el.innerHTML = `<div style="font-family:monospace;font-size:.65rem;letter-spacing:.4em;color:#7d8ba3;
      padding:10px 0;text-align:center">ADVERTISEMENT · MOCK BANNER 728×90</div>`;
  }
  unmountBanner(el) { el.innerHTML = ''; }
}

/* ── GPT: Google Ad Manager — rewarded out-of-page slot + banner ── */
export class GPTProvider {
  id = 'gpt';
  supported = { rewarded: true, interstitial: false, banner: true };
  npa = false;
  async init(cfg) {
    if (!cfg.slotPath) throw new Error('gpt: slotPath missing');
    await loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js');
    const gt = window.googletag = window.googletag || { cmd: [] };
    await new Promise((res) => gt.cmd.push(() => {
      this._rewarded = gt.defineOutOfPageSlot(cfg.slotPath, gt.enums.OutOfPageFormat.REWARDED);
      if (this._rewarded) this._rewarded.addService(gt.pubads());
      this._banner = gt.defineSlot(cfg.slotPath, cfg.bannerSize || [728, 90], cfg.bannerDiv || 'nv-banner')
        .addService(gt.pubads());
      gt.pubads().addEventListener('rewardedSlotGranted', (e) => this._grant && this._grant({ completed: true, payload: e.payload }));
      gt.pubads().addEventListener('rewardedSlotClosed', () => this._grant && this._grant({ completed: false, reason: 'closed' }));
      gt.enableServices();
      res();
    }));
    this.cfg = cfg;
  }
  setConsent(g) {
    this.npa = !g;
    window.googletag?.cmd.push(() => window.googletag.pubads().setRequestNonPersonalizedAds(g ? 0 : 1));
  }
  showRewarded() {
    return new Promise((resolve) => {
      this._grant = resolve;
      const to = setTimeout(() => resolve({ completed: false, reason: 'timeout' }), 25000);
      const done = (r) => { clearTimeout(to); this._grant = null; resolve(r); };
      this._grant = (r) => done(r);
      window.googletag.cmd.push(() => window.googletag.display(this._rewarded));
    });
  }
  showInterstitial() { return Promise.resolve({}); }   // GPT has no midgame video; interstitials come from portals
  mountBanner(el) {
    el.innerHTML = `<div id="${this.cfg.bannerDiv || 'nv-banner'}" style="min-width:728px;min-height:90px"></div>`;
    window.googletag?.cmd.push(() => window.googletag.display(this.cfg.bannerDiv || 'nv-banner'));
  }
  unmountBanner(el) { el.innerHTML = ''; }
  gameplayStart() {} gameplayStop() {}
}

/* ── ADSENSE: display banner only (no rewarded video exists in AdSense) ── */
export class AdSenseProvider {
  id = 'adsense';
  supported = { rewarded: false, interstitial: false, banner: true };
  npa = false;
  async init(cfg) {
    if (!cfg.client) throw new Error('adsense: client missing');
    this.cfg = cfg;
    await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.client}`,
      { crossorigin: 'anonymous' });
  }
  setConsent(g) { this.npa = !g; }   // consent is handled by Google's own funding-choices message
  showRewarded() { return Promise.resolve({ completed: false, reason: 'unsupported' }); }
  showInterstitial() { return Promise.resolve({}); }
  mountBanner(el) {
    el.innerHTML = `<ins class="adsbygoogle" style="display:block;width:100%;max-width:728px;height:90px"
      data-ad-client="${this.cfg.client}" data-ad-slot="${this.cfg.bannerSlot}" data-ad-format="horizontal"
      data-full-width-responsive="true"></ins>`;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
  }
  unmountBanner(el) { el.innerHTML = ''; }
  gameplayStart() {} gameplayStop() {}
}

/* ── POKI portal SDK ── */
export class PokiProvider {
  id = 'poki';
  supported = { rewarded: true, interstitial: true, banner: false };
  async init() {
    if (!window.PokiSDK) await loadScript('https://game-cdn.poki.gg/scripts/v2/poki-sdk.js');
    await window.PokiSDK.init();
    this.sdk = window.PokiSDK;
  }
  setConsent() {}
  showRewarded() {
    return this.sdk.rewardedBreak()
      .then((ok) => ({ completed: !!ok, reason: ok ? undefined : 'closed' }))
      .catch(() => ({ completed: false, reason: 'error' }));
  }
  showInterstitial() { return this.sdk.commercialBreak().catch(() => {}); }
  mountBanner() {} unmountBanner() {}
  gameplayStart() { this.sdk?.gameplayStart?.(); }
  gameplayStop() { this.sdk?.gameplayStop?.(); }
}

/* ── CRAZYGAMES portal SDK (v2/v3 tolerant) ── */
export class CrazyGamesProvider {
  id = 'crazygames';
  supported = { rewarded: true, interstitial: true, banner: false };
  async init() {
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) throw new Error('crazygames: SDK not injected (are you on the portal?)');
    await sdk.init?.('game');
    this.sdk = sdk;
    this.loadingFinished();
  }
  loadingFinished() { this.sdk?.game?.loadingFinished?.(); }
  setConsent() {}
  showRewarded() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (r) => { if (!settled) { settled = true; resolve(r); } };
      const to = setTimeout(() => done({ completed: false, reason: 'timeout' }), 25000);
      try {
        this.sdk.ad.requestAd('rewarded', {
          adStarted: () => {},
          adFinished: () => { clearTimeout(to); done({ completed: true }); },
          adError: () => { clearTimeout(to); done({ completed: false, reason: 'error' }); },
        });
      } catch { clearTimeout(to); done({ completed: false, reason: 'error' }); }
    });
  }
  showInterstitial() {
    return new Promise((resolve) => {
      try {
        this.sdk.ad.requestAd('midgame', { adFinished: () => resolve({}), adError: () => resolve({}) });
      } catch { resolve({}); }
    });
  }
  mountBanner() {} unmountBanner() {}
  gameplayStart() { this.sdk?.game?.gameplayStart?.(); }
  gameplayStop() { this.sdk?.game?.gameplayStop?.(); }
  happyTime() { this.sdk?.game?.happyTime?.(); }
}

export const PROVIDERS = { mock: MockProvider, gpt: GPTProvider, adsense: AdSenseProvider, poki: PokiProvider, crazygames: CrazyGamesProvider };
