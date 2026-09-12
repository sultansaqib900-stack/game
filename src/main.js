/* ══ NEONVOID bootstrap ══ */
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { ads } from './ads/ads.js';
import { audio } from './audio/audio.js';
import { AD_CONFIG } from './ads/adConfig.js';
import { hydrateIcons } from './ui/icons.js';
import * as CONTENT from './game/content.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
const ui = new UI(game);
window.NV = { game, ui, ads, audio, content: CONTENT };   // debug/console handle

addEventListener('resize', () => game.renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'play') game.pause();
});

// audio must be unlocked by a user gesture
const unlock = () => { audio.init(); audio.resume(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

function needsConsent() {
  const p = new URLSearchParams(location.search).get('ads');
  if (p === 'mock' || p === 'off') return false;
  if (game.save.consent !== null) return false;
  return !!(window.PokiSDK || window.CrazyGames?.SDK || AD_CONFIG.gpt.slotPath || AD_CONFIG.adsense.client);
}

async function boot() {
  hydrateIcons();
  game.boot();
  if (needsConsent()) document.getElementById('consent').hidden = false;
  else if (game.save.consent !== null) ads.setConsent(game.save.consent);
  await ads.init();
  ui.renderAdStatus();
  ui.renderMenu();
}
boot();
