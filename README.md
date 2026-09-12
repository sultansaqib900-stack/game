# NEONVOID — Survivor Protocol

A polished, zero-dependency **2D neon survivors-like auto-shooter roguelite** for the web,
with a **provider-agnostic ad monetization layer** built in from day one.

No build step. No npm install. Open `index.html` through any static server and play.

---

## Quick start

```bash
node tools/serve.mjs          # → http://localhost:8080
node tools/serve.mjs 3000     # custom port
```

Or host the folder anywhere static (GitHub Pages, Netlify, S3, a portal build).

**Controls** — WASD / arrows / touch joystick to move · `Space`/`Shift`/touch button to dash (i-frames) ·
weapons auto-fire & auto-aim · `Esc`/`P` pause · gamepad supported.

---

## The game

- **Run loop**: survive escalating waves in a bounded neon arena, collect XP shards, draft upgrades,
  beat 3 bosses (5:00 / 10:00 / 15:00), break the protocol at 20:00.
- **9 weapons** (pulse, scatter, orbit blades, nova, ion rail, homing missiles, arc chain, sentinel drones,
  ember aura) each with 7 upgrade levels and distinct firing code.
- **12 passives** (cooldown, damage, speed, area, multishot, magnet, regen, armor, crit, greed, lifesteal, luck).
- **8 enemy archetypes** with real behaviors (chase / swarm wobble / keep-distance shooters / orbit-then-dash /
  teleporting phantoms / splitting brutes / elite titans) + **3 bosses** with radial, spiral, charge, sweep and
  summon patterns.
- **Drafting**: rarity-weighted 3-card level-up (4 with meta), rerolls, ad-funded rerolls & bonus cards, chests.
- **Meta progression**: 12 permanent hangar upgrades bought with run coins; local run history & best-run board.
- **Juice**: screen shake, hit-stop flashes, particles, damage numbers, knockback, dash ghosts, boss telegraphs,
  dynamic zoom, low-HP vignette — all toggleable (screen shake / reduce flash) for accessibility.
- **100% procedural audio**: WebAudio synth SFX + a layered 132 BPM step-sequencer soundtrack whose intensity
  rises with the run. No audio files.
- **Performance**: object pooling, uniform-grid spatial hashing, glow-sprite caching, entity caps per quality
  tier, DPR cap. `Settings → Quality` = auto/low/med/high.
- **Mobile**: virtual joystick + dash button, safe-area insets, portrait-tolerant layout, PWA manifest.

## Testing

```bash
node tools/headless-test.mjs
```

Boots the real modules under a DOM/canvas shim and asserts: boot, spawning, combat, multi-level draft queue,
rewarded-ad reroll, chests/bombs, boss events, death → revive-via-ad, coin banking, meta shop, interstitial
policy (min gap / min run / back-to-back), pause/resume, and 200-entity stress.

---

## 💰 Ads integration

### Architecture

```
src/ads/adConfig.js    ← ★ the only file you edit: provider + IDs + policy
src/ads/ads.js         ← AdManager: policy, throttling, fail-open, lifecycle, events
src/ads/providers.js   ← mock | gpt | adsense | poki | crazygames adapters
ads.txt                ← copy to your domain root (required to get paid)
```

One API, five providers, chosen by `AD_CONFIG.provider` (`'auto'` = portal SDK → your IDs → mock):

| Provider | Rewarded | Interstitial | Banner | Needs |
|---|---|---|---|---|
| `mock` | ✅ | ✅ | ✅ | nothing — placeholder ads, full flow testable offline |
| `gpt` (Ad Manager) | ✅ out-of-page slot | — | ✅ | ad unit path |
| `adsense` | — (AdSense has no rewarded video) | — | ✅ | client + slot id |
| `poki` | ✅ `rewardedBreak()` | ✅ `commercialBreak()` | — | publish on Poki |
| `crazygames` | ✅ `requestAd('rewarded')` | ✅ `requestAd('midgame')` | — | publish on CrazyGames |

If the active provider lacks rewarded video (plain AdSense), `fallbackRewarded: 'mock'` keeps every rewarded
button functional instead of dropping the feature.

### Placements (all on natural breaks, never mid-combat)

| Placement id | Type | Trigger |
|---|---|---|
| `revive` | rewarded | game-over “REVIVE — WATCH AD” (1 + meta charges) |
| `double_coins` | rewarded | game-over “DOUBLE COINS — WATCH AD” |
| `free_reroll` | rewarded | level-up “FREE REROLL — WATCH AD” |
| `bonus_card` | rewarded | level-up “+1 CARD — WATCH AD” |
| `daily_crate` | rewarded | hangar daily crate |
| `test` | rewarded | hangar “TEST REWARDED AD” |
| `post_run` | interstitial | automatic behind the run summary, throttled |
| *(banner)* | display | menus only, `policy.banner.enabled` (default **off**) |

### Rules enforced by AdManager

- rewarded ads are **always opt-in** (a click); never automatic;
- **fail-open**: SDK error/timeout still grants the reward — players are never punished;
- interstitial policy: ≥120 s gap, run ≥90 s, ≤4/hour, never back-to-back on the same run;
- gameplay (audio, loop, input) suspends around every ad and portal hooks fire
  (`gameplayStop` → ad → `gameplayStart`), as Poki/CrazyGames require;
- GDPR consent gate before real SDKs load (stored on-device; NPA flag applied to GPT).

### Go live

1. **Now / testing**: nothing to do — `mock` serves placeholder ads. Try `?adsDebug=1` for a live ad log,
   `?ads=mock`, `?ads=off` to force modes.
2. **AdSense** (your own site): paste `client` + `bannerSlot` in `adConfig.js`, put `ads.txt` at the domain
   root with your publisher id. Ads appear automatically once Google approves the site — no code change later.
3. **Ad Manager rewarded video**: set `gpt.slotPath` (+ div ids). Rewarded slots are defined as out-of-page
   REWARDED format and resolve via `rewardedSlotGranted`.
4. **Portals (fastest real revenue + rewarded video)**: publish the folder to Poki/CrazyGames; `auto`
   detection picks their injected SDK, no ids needed.

---

## Project structure

```
index.html            shell: canvas, HUD, screens, banner slot, consent
src/style.css         neon design system (bars, cards, buttons, panels)
src/main.js           bootstrap, audio unlock, consent gate
src/core/engine.js    math, RNG, bus, pools, spatial grid, fixed-step loop, storage
src/core/input.js     keyboard / pointer / touch joystick / gamepad
src/audio/audio.js    procedural SFX synth + step-sequencer music
src/game/content.js   weapons, passives, enemies, bosses, meta, XP curve
src/game/world.js     simulation: collisions, weapon behaviors, AI, damage pipeline
src/game/render.js    canvas renderer: glow sprites, parallax, particles, overlays
src/game/game.js      run state machine, director, progression, meta, ad hooks
src/ui/ui.js          screens, HUD, cards, hangar, settings, ad buttons
src/ui/icons.js       inline SVG icon set
src/ads/*             ad layer (see above)
tools/serve.mjs       zero-dependency static server
tools/headless-test.mjs  CI-friendly smoke test
mockups/              the UI concept art this build implements
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` publishes the repo root to Pages on push to `main`
(or manual dispatch). Any static host works equally — the game is plain files.

## Debugging in the console

`window.NV` exposes `{ game, ui, ads, audio }`, e.g. `NV.game.save.coins += 10000`,
`NV.game.world.spawnBoss(2)`, `NV.ads.showRewarded('test')`.
