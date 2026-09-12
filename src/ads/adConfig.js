/* ════════════════════════════════════════════════════════════════════
   NEONVOID AD CONFIGURATION — ★ the only ad file you need to edit ★
   ────────────────────────────────────────────────────────────────────
   provider: 'auto'    detect portal SDK → your IDs → mock
             'mock'    built-in placeholder ads (test the full flow, no account)
             'gpt'     Google Ad Manager (Google Publisher Tags): rewarded + banner
             'adsense' Google AdSense: banner only (AdSense has no rewarded video)
             'poki'    Poki portal SDK: rewarded + interstitial breaks
             'crazygames'  CrazyGames portal SDK: rewarded + midgame breaks
   Query overrides for testing: ?ads=mock  ?ads=off  ?adsDebug=1
   ════════════════════════════════════════════════════════════════════ */
export const AD_CONFIG = {
  provider: 'auto',

  /* Google Ad Manager (GPT). slotPath comes from Ad Manager, e.g. '/21804929279/neonvoid' */
  gpt: {
    slotPath: '',                 // ← paste your ad unit path, e.g. '/123456789/neonvoid'
    rewardedDiv: 'nv-rewarded',   // out-of-page rewarded slot div id
    bannerDiv: 'nv-banner',       // banner slot div id
    bannerSize: [728, 90],
  },

  /* Google AdSense — banner display ads on menus only. */
  adsense: {
    client: '',                   // ← 'ca-pub-XXXXXXXXXXXXXXXX' once your account is approved
    bannerSlot: '',               // ← ad unit id, e.g. '1234567890'
  },

  /* Portal SDKs need no ids here (they identify the game by URL / injected SDK). */
  poki: {},
  crazygames: {},

  policy: {
    rewarded: { enabled: true },
    interstitial: {
      enabled: true,
      minGapSec: 120,     // min seconds between two interstitials
      minRunSec: 90,      // never show one after a run shorter than this
      maxPerHour: 4,
      neverBackToBack: true,
    },
    banner: { enabled: false },   // menus only when on; banners in gameplay hurt retention
  },

  /* If a rewarded SDK errors/times out, grant the reward anyway (players never punished). */
  failOpen: true,
  /* When the active provider has no rewarded video (e.g. plain AdSense), show the mock
     rewarded flow instead of dropping the feature. Set to 'none' to disable. */
  fallbackRewarded: 'mock',
  /* Ask for cookie consent before loading ad SDKs (GDPR). Stored on device. */
  consentGate: true,
};
