# 💎 Gem Cascade

A colorful **match-3 puzzle game** built with **Phaser 3**, designed for the
**Crazy Games** platform (works standalone too).

Swap adjacent gems to make matches of 3 or more, trigger special gems, chain
cascades, and reach the target score before you run out of moves.

## Play

Everything runs in the browser — no build step required:

```bash
# from the repository root
python3 -m http.server 8080
# open http://localhost:8080
```

Or open `index.html` through any static server. Phaser 3 is vendored in
`lib/phaser.min.js`, so the game needs no network to boot (the optional Google
font simply falls back gracefully).

## Features

- 8×8 match-3 board with 6 gem types (colour **and** shape coded for accessibility)
- 4 special gems: row/column clear (match 4), flame bomb (L/T of 5), colour bomb (5 in a line)
- Cascades & combos with multiplied scoring, screen shake and particles
- 20 hand-tuned levels (moves + score target), 3-star rating, move bonus
- Boosters: hammer (smash), hint, reshuffle
- Level select, per-level star record, best scores, persistent progression
- Win / lose flows, with a rewarded-ad "continue" (+5 moves) via the Crazy Games SDK
- Procedural art & audio (Web Audio synth) — zero external assets
- Works with mouse, touch and keyboard-free one-finger input

## Tech & structure

| File | Purpose |
| --- | --- |
| `index.html` | Host page (720×1280, Scale.FIT letterboxing) |
| `lib/phaser.min.js` | Vendored Phaser 3.90 |
| `src/config.js` | Gems, specials, scoring, level data |
| `src/board.js` | Pure match-3 logic (matches, gravity, specials, reshuffle) |
| `src/textures.js` | Procedural gem / icon / particle textures |
| `src/ui.js` | Background, buttons, text, toasts |
| `src/sfx.js` | Web Audio sound effects |
| `src/storage.js` | localStorage + Crazy Games cloud save |
| `src/sdk.js` | Crazy Games SDK v3 wrapper (graceful no-op fallback) |
| `src/main.js` | Scenes: Boot, Preload, Menu, Level Select, Game, HUD |

## Crazy Games integration

The game auto-detects the Crazy Games environment and integrates with the
[SDK v3](https://docs.crazygames.com/sdk/html5/):

- `game.loadingStart/Stop`, `game.gameplayStart/Stop`, `game.happytime`
- `ad.requestAd('midgame')` for the +5 moves continue (falls back to a free
  bonus outside Crazy Games so testing is frictionless)
- `data.save/load` for cross-device progress (with localStorage as a fallback)
- `sdk.responsive.listen()` for window resizing

To publish: upload this folder to the [Crazy Games developer
portal](https://developer.crazygames.com/) as an HTML5 game — no build output
to generate.

## Controls

- **Click / drag** a gem onto an adjacent gem to swap (must form a match)
- **Tap** a booster, then tap a gem to smash it (hammer)
- **Hint** highlights a valid move; **Reshuffle** re-rolls the board
