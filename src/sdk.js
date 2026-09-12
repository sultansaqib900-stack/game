// ---------------------------------------------------------------------------
// Crazy Games SDK wrapper.
//
// Loads the official Crazy Games SDK (https://sdk.crazygames.com) when running
// inside the Crazy Games iframe and silently degrades to no-op stubs when it is
// unavailable (e.g. local development, the live preview, or any other host).
// This means the exact same build works everywhere.
// ---------------------------------------------------------------------------

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

class CrazySDK {
  constructor() {
    this.sdk = null;
    this.isCrazy = false;
    this.initialized = false;
  }

  /** Load the SDK script (if present) and initialise it. Never throws. */
  async init() {
    await this._loadScript();
    const cg = window.CrazyGames;
    if (cg && cg.SDK) {
      this.sdk = cg.SDK;
      this.isCrazy = true;
      try { await this.sdk.init(); } catch (e) { /* ignore */ }
      try { if (this.sdk.responsive && this.sdk.responsive.listen) this.sdk.responsive.listen(); } catch (e) { /* ignore */ }
    }
    this.initialized = true;
  }

  _loadScript() {
    return new Promise((resolve) => {
      if (window.CrazyGames && window.CrazyGames.SDK) return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = finish;
      s.onerror = finish;
      document.head.appendChild(s);
      // Hard timeout so the game never waits forever on a blocked CDN.
      setTimeout(finish, 4000);
    });
  }

  // -- lifecycle -------------------------------------------------------------
  loadingStart() { this._call('game.loadingStart'); }
  loadingStop()  { this._call('game.loadingStop'); }
  gameplayStart() { this._call('game.gameplayStart'); }
  gameplayStop()  { this._call('game.gameplayStop'); }
  happytime()     { this._call('game.happytime'); }

  // -- ads -------------------------------------------------------------------
  /** Resolves true when an ad was watched to completion, false otherwise. */
  requestAd(type) {
    return new Promise((resolve) => {
      if (!this.sdk || !this.sdk.ad || typeof this.sdk.ad.requestAd !== 'function') return resolve(false);
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => {},
          adFinished: () => resolve(true),
          adError: () => resolve(false),
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  // -- persistent data -------------------------------------------------------
  /** Returns the data object stored by Crazy Games, or null. */
  async dataLoad() {
    if (!this.sdk || !this.sdk.data || typeof this.sdk.data.load !== 'function') return null;
    try { return await this.sdk.data.load(); } catch (e) { return null; }
  }

  async dataSave(data) {
    if (!this.sdk || !this.sdk.data || typeof this.sdk.data.save !== 'function') return;
    try { await this.sdk.data.save(data); } catch (e) { /* ignore */ }
  }

  _call(path) {
    if (!this.sdk) return;
    try {
      const parts = path.split('.');
      let obj = this.sdk;
      for (const p of parts) obj = obj[p];
      if (typeof obj === 'function') obj.call(this.sdk.game || this.sdk);
    } catch (e) { /* ignore */ }
  }
}

export const sdk = new CrazySDK();
