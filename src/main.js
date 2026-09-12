// ---------------------------------------------------------------------------
// Gem Cascade — a match-3 puzzle game built with Phaser 3 for Crazy Games.
// ---------------------------------------------------------------------------

import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BOARD_ROWS,
  BOARD_COLS,
  GEM_TYPE_COUNT,
  GEM_COLORS,
  LEVELS,
  SCORE,
  starThresholds,
  SPECIAL_KEYS,
} from './config.js';
import { generateAllTextures } from './textures.js';
import {
  label,
  paintBackground,
  makeButton,
  makeIconButton,
  toast,
  starRow,
  fmt,
  panelTexture,
  textStyle,
} from './ui.js';
import { sdk } from './sdk.js';
import { sfx } from './sfx.js';
import {
  loadSave,
  getSave,
  recordResult,
  setMutedPref,
} from './storage.js';
import {
  createBoard,
  findMatches,
  resolveMatches,
  applyGravity,
  hasValidMoves,
  wouldMatch,
  collectTypeCells,
  reshuffle,
} from './board.js';

const Phaser = window.Phaser;

// Board layout (all scenes assume 720x1280 and Scale.FIT letterboxing).
const R = BOARD_ROWS;
const C = BOARD_COLS;
const CELL = 80;
const BOARD_PX = CELL * C;                 // 640
const ORIGIN_X = (GAME_WIDTH - BOARD_PX) / 2; // 40
const ORIGIN_Y = 170;
const GEM_SCALE = CELL / 64;               // 1.25

const cellXY = (r, c) => ({
  x: ORIGIN_X + c * CELL + CELL / 2,
  y: ORIGIN_Y + r * CELL + CELL / 2,
});

const LAST_LEVEL = LEVELS.length; // 20

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.scene.start('Preload');
  }
}

// ---------------------------------------------------------------------------
// Preload (all assets are procedural; fonts load here, then textures generate)
// ---------------------------------------------------------------------------
class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create() {
    sdk.loadingStart();

    // Load the Google font (optional — game works fine with fallbacks).
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap';
    document.head.appendChild(link);

    let loadFont;
    try {
      loadFont = (document.fonts && document.fonts.load)
        ? document.fonts.load('800 32px Poppins').catch(() => {})
        : Promise.resolve();
    } catch (e) {
      loadFont = Promise.resolve();
    }

    const timeout = new Promise((resolve) => this.time.delayedCall(2500, resolve));

    Promise.race([loadFont, timeout]).then(() => {
      // Generate gem + icon + particle textures once font fallback is safe.
      generateAllTextures(this);
      sdk.loadingStop();
      this.scene.start('Menu');
    });
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    paintBackground(this);
    const saveData = getSave();

    // Title
    label(this, GAME_WIDTH / 2, 150, 'GEM', 150, '#ffffff', { fontStyle: '800' });
    label(this, GAME_WIDTH / 2, 265, 'CASCADE', 66, '#c9b6ff', { fontStyle: '800' });

    // Gem logo (bobbing)
    const logo = this.add.image(GAME_WIDTH / 2, 520, 'g5').setScale(4.2);
    this.tweens.add({ targets: logo, y: 495, scale: 4.5, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    label(this, GAME_WIDTH / 2, 660, 'Match 3+ gems to score big!', 32, '#e6defc');

    // stats
    const unlocked = saveData.unlocked || 1;
    const totalStars = Object.values(saveData.stars || {}).reduce((a, b) => a + (b || 0), 0);
    label(this, GAME_WIDTH / 2, 720, `Levels unlocked: ${Math.min(unlocked, LAST_LEVEL)}/${LAST_LEVEL}`, 26, '#b8a8e8');
    label(this, GAME_WIDTH / 2, 758, `Stars collected: ${totalStars}`, 26, '#b8a8e8');

    // Play button
    makeButton(this, GAME_WIDTH / 2, 900, 420, 110, 'PLAY', () => {
      sfx.unlock();
      sfx.click();
      this.scene.start('LevelSelect');
    }, { fontSize: 46, color: 0x8b5cf6, colorOver: 0xa78bfa });

    // Mute toggle
    this.makeMuteButton();

    label(this, GAME_WIDTH / 2, 1240, 'v1.0 · match-3 puzzle', 22, '#6f5aa8');
  }

  makeMuteButton() {
    const muted = sfx.mutedState;
    this.muteBtn = makeIconButton(this, GAME_WIDTH - 44, 44, 64, muted ? 'icon_mute' : 'icon_sound', () => {
      const next = !sfx.mutedState;
      sfx.setMuted(next);
      setMutedPref(next, sdk);
      this.muteBtn.removeAll(true);
      this.muteBtn.destroy();
      this.makeMuteButton();
      sfx.unlock();
    });
  }
}

// ---------------------------------------------------------------------------
// Level Select
// ---------------------------------------------------------------------------
class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create() {
    paintBackground(this);
    const saveData = getSave();
    const unlocked = saveData.unlocked || 1;

    label(this, GAME_WIDTH / 2, 90, 'SELECT LEVEL', 56, '#ffffff', { fontStyle: '800' });

    // Back button
    makeIconButton(this, 56, 56, 64, 'icon_back', () => {
      sfx.click();
      this.scene.start('Menu');
    });

    // Grid: 4 columns
    const cols = 4;
    const cellW = 140;
    const gap = 18;
    const startX = (GAME_WIDTH - (cols * cellW + (cols - 1) * gap)) / 2 + cellW / 2;
    const startY = 240;

    for (let i = 0; i < LAST_LEVEL; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cellW + gap);
      const y = startY + row * (cellW + gap);
      const levelNumber = i + 1;
      const isUnlocked = levelNumber <= unlocked;

      this.makeLevelCell(x, y, cellW, levelNumber, isUnlocked);
    }

    // total stars footer
    const totalStars = Object.values(saveData.stars || {}).reduce((a, b) => a + (b || 0), 0);
    label(this, GAME_WIDTH / 2, 1220, `Total stars: ${totalStars} / ${LAST_LEVEL * 3}`, 28, '#b8a8e8');
  }

  makeLevelCell(x, y, size, levelNumber, isUnlocked) {
    const c = this.add.container(x, y).setDepth(100);

    if (isUnlocked) {
      const bg = this.add.image(0, 0, panelTexture(this, `lvl_on_${size}`, size, size, 24, 0x2c1a52, 1))
        .setInteractive({ useHandCursor: true });
      const num = this.add.text(0, -22, `${levelNumber}`, textStyle(46, '#ffffff', { fontStyle: '800' })).setOrigin(0.5);
      const stars = getSave().stars[levelNumber] || 0;
      const rowIcons = starRow(this, 0, 30, stars, 26, 32);

      c.add([bg, num, ...rowIcons]);

      bg.on('pointerdown', () => {
        sfx.unlock();
        sfx.click();
        this.scene.start('Game', { level: levelNumber - 1 });
      });
      bg.on('pointerover', () => {
        this.tweens.add({ targets: c, scale: 1.07, duration: 120 });
        bg.setTexture(panelTexture(this, `lvl_on_h_${size}`, size, size, 24, 0x4c2a7a, 1));
      });
      bg.on('pointerout', () => {
        this.tweens.add({ targets: c, scale: 1, duration: 120 });
        bg.setTexture(panelTexture(this, `lvl_on_${size}`, size, size, 24, 0x2c1a52, 1));
      });
    } else {
      const bg = this.add.image(0, 0, panelTexture(this, `lvl_off_${size}`, size, size, 24, 0x1a1038, 0.7));
      const lock = this.add.image(0, 4, 'icon_lock').setScale(0.7);
      const num = this.add.text(0, -34, `${levelNumber}`, textStyle(30, '#6f5aa8', { fontStyle: '700' })).setOrigin(0.5);
      c.add([bg, lock, num]);
      bg.setInteractive({ useHandCursor: false });
      bg.on('pointerdown', () => {
        sfx.unlock();
        sfx.invalid();
        toast(this, `Complete level ${levelNumber - 1} to unlock!`, '#ffd23f');
      });
    }
  }
}

// ---------------------------------------------------------------------------
// HUD (overlaid on top of the Game scene)
// ---------------------------------------------------------------------------
class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    const levelNumber = (this.registry.get('levelNumber') || 0) + 1;
    const target = this.registry.get('target') || 0;

    // Top row
    makeIconButton(this, 48, 44, 60, 'icon_back', () => {
      sfx.click();
      this.scene.stop();
      this.scene.get('Game').stop();
      this.scene.start('LevelSelect');
    });

    this.levelText = label(this, GAME_WIDTH / 2, 42, `LEVEL ${levelNumber}`, 38, '#ffffff', { fontStyle: '800' });

    this.makeMuteButton();

    // Progress bar
    const barX = 70;
    const barW = GAME_WIDTH - 140;
    this.scoreText = label(this, barX, 88, 'SCORE 0', 24, '#e6defc').setOrigin(0, 0.5);
    this.targetText = label(this, GAME_WIDTH - barX, 88, `TARGET ${fmt(target)}`, 24, '#e6defc').setOrigin(1, 0.5);

    this.barBg = this.add.image(barX, 116, panelTexture(this, 'hbar_bg', barW, 24, 12, 0x000000, 0.45)).setOrigin(0, 0.5);
    this.barFill = this.add.image(barX, 116, panelTexture(this, 'hbar_fill', barW, 24, 12, 0xffd23f, 1)).setOrigin(0, 0.5);
    this.barGem = this.add.image(barX, 116, 'g2').setScale(0.5);

    // Moves pill
    this.movesPill = this.add.container(GAME_WIDTH / 2, 152);
    const pillBg = this.add.image(0, 0, panelTexture(this, 'moves_pill', 200, 44, 22, 0x2c1a52, 1));
    this.movesText = this.add.text(0, 0, 'MOVES 0', textStyle(26, '#ffffff', { fontStyle: '800' })).setOrigin(0.5);
    this.movesPill.add([pillBg, this.movesText]);
    this.movesPill.setDepth(100);

    // Events from Game scene
    this.game.events.on('hud:score', this.onScore, this);
    this.game.events.on('hud:moves', this.onMoves, this);
    this.game.events.on('hud:progress', this.onProgress, this);

    this.onMoves(this.registry.get('moves') || 0);
    this.onProgress({ score: 0, target });
  }

  onScore(score) {
    this.scoreText.setText(`SCORE ${fmt(score)}`);
  }

  onMoves(moves) {
    this.movesText.setText(`MOVES ${moves}`);
    this.movesPill.setScale(1.15);
    this.tweens.add({ targets: this.movesPill, scale: 1, duration: 150 });
  }

  onProgress({ score, target }) {
    const p = Phaser.Math.Clamp(score / target, 0, 1);
    this.barFill.setScale(p, 1);
    const barW = GAME_WIDTH - 140;
    const barX = 70;
    this.barGem.setPosition(barX + barW * p, 116);
    this.scoreText.setText(`SCORE ${fmt(score)}`);
  }

  makeMuteButton() {
    const muted = sfx.mutedState;
    this.muteBtn = makeIconButton(this, GAME_WIDTH - 48, 44, 60, muted ? 'icon_mute' : 'icon_sound', () => {
      const next = !sfx.mutedState;
      sfx.setMuted(next);
      setMutedPref(next, sdk);
      this.muteBtn.destroy();
      this.makeMuteButton();
      sfx.unlock();
    });
  }

  shutdown() {
    this.game.events.off('hud:score', this.onScore, this);
    this.game.events.off('hud:moves', this.onMoves, this);
    this.game.events.off('hud:progress', this.onProgress, this);
  }
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init() {
    const idx = (this.scene.settings.data && this.scene.settings.data.level) || 0;
    this.levelIndex = Phaser.Math.Clamp(idx, 0, LAST_LEVEL - 1);
    this.levelNumber = this.levelIndex + 1;
    this.level = LEVELS[this.levelIndex];

    this.board = null;
    this.gems = null;
    this.moves = 0;
    this.score = 0;
    this.state = 'intro'; // intro | idle | busy | resolving | won | lost
    this.selected = null;
    this.pointerStart = null;
    this.hammerMode = false;
    this.boosters = { hammer: 2, hint: 3, reshuffle: 1 };
  }

  create() {
    paintBackground(this);
    this.board = createBoard();
    this.gems = Array.from({ length: R }, () => new Array(C).fill(null));
    this.moves = this.level.moves;

    // board interactive zone
    this.boardZone = this.add
      .zone(ORIGIN_X + BOARD_PX / 2, ORIGIN_Y + BOARD_PX / 2, BOARD_PX, BOARD_PX)
      .setOrigin(0.5)
      .setInteractive();
    this.boardZone.on('pointerdown', (pointer) => this.onBoardDown(pointer));
    this.boardZone.on('pointerup', (pointer) => this.onBoardUp(pointer));

    // launch HUD
    this.registry.set('levelNumber', this.levelIndex);
    this.registry.set('target', this.level.target);
    this.registry.set('moves', this.moves);
    this.scene.launch('Hud');

    // build gem sprites (drop-in animation)
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const cell = this.board[r][c];
        const key = cell.special ? `s_${cell.type}_${cell.special}` : `g${cell.type}`;
        const { x, y } = cellXY(r, c);
        const sp = this.add.image(x, y - 900, key).setScale(GEM_SCALE).setDepth(20);
        this.gems[r][c] = sp;
        this.tweens.add({
          targets: sp,
          y,
          duration: 500,
          ease: 'Bounce.easeOut',
          delay: c * 40 + r * 15,
        });
      }
    }

    // boosters
    this.buildBoosters();

    // hint text
    this.hintText = label(this, GAME_WIDTH / 2, ORIGIN_Y + BOARD_PX + 120, 'Swap two gems to make a match of 3+', 26, '#b8a8e8');

    this.game.events.emit('hud:score', 0);
    this.game.events.emit('hud:moves', this.moves);
    this.game.events.emit('hud:level', { number: this.levelNumber, target: this.level.target });
    this.game.events.emit('hud:progress', { score: 0, target: this.level.target });

    sdk.gameplayStart();

    this.time.delayedCall(700, () => {
      if (this.state === 'intro') this.state = 'idle';
    });
  }

  buildBoosters() {
    const by = ORIGIN_Y + BOARD_PX + 46; // ~856
    const xs = [GAME_WIDTH / 2 - 190, GAME_WIDTH / 2, GAME_WIDTH / 2 + 190];

    const defs = [
      { key: 'hammer', icon: 'icon_hammer', name: 'Smash a gem' },
      { key: 'hint', icon: 'icon_hint', name: 'Show a move' },
      { key: 'reshuffle', icon: 'icon_shuffle', name: 'Shuffle board' },
    ];

    this.boosterButtons = {};
    defs.forEach((d, i) => {
      const x = xs[i];
      const btn = makeIconButton(this, x, by, 84, d.icon, () => this.onBooster(d.key), { color: 0x2c1a52, iconScale: 0.62 });
      this.boosterButtons[d.key] = btn;
      const badge = label(this, x + 26, by - 26, `${this.boosters[d.key]}`, 22, '#ffd23f', { fontStyle: '800' });
      badge.setDepth(210);
      this[`badge_${d.key}`] = badge;
    });
  }

  onBooster(key) {
    if (this.state !== 'idle' && key !== 'hammer') return;
    sfx.unlock();

    if (key === 'hammer') {
      this.hammerMode = !this.hammerMode;
      toast(this, this.hammerMode ? 'Tap a gem to smash it!' : 'Hammer cancelled', '#ffd23f');
      if (this.boosters.hammer <= 0 && this.hammerMode) {
        this.hammerMode = false;
        toast(this, 'No hammers left!');
      }
      return;
    }

    if (this.boosters[key] <= 0) {
      sfx.invalid();
      toast(this, `No ${key === 'hint' ? 'hints' : 'shuffles'} left!`);
      return;
    }

    if (key === 'hint') {
      const pair = this.findHintMove();
      if (!pair) return;
      this.boosters.hint--;
      this.badge_hint.setText(`${this.boosters.hint}`);
      sfx.click();
      this.flashCells(pair, 0xffd23f, 1600);
      return;
    }

    if (key === 'reshuffle') {
      this.boosters.reshuffle--;
      this.badge_reshuffle.setText(`${this.boosters.reshuffle}`);
      this.doReshuffle(true);
    }
  }

  // -- input ----------------------------------------------------------------
  cellFromPointer(p) {
    const cx = Math.floor((p.x - ORIGIN_X) / CELL);
    const cy = Math.floor((p.y - ORIGIN_Y) / CELL);
    if (cx < 0 || cx >= C || cy < 0 || cy >= R) return null;
    return { r: cy, c: cx };
  }

  onBoardDown(pointer) {
    if (this.state !== 'idle') return;
    const cell = this.cellFromPointer(pointer);
    if (!cell) return;

    if (this.hammerMode) {
      this.hammerMode = false;
      this.boosters.hammer--;
      this.badge_hammer.setText(`${this.boosters.hammer}`);
      this.smashCell(cell.r, cell.c);
      return;
    }

    this.pointerStart = cell;
    this.select(cell);
  }

  onBoardUp(pointer) {
    if (this.state !== 'idle' || !this.pointerStart) return;
    const end = this.cellFromPointer(pointer);
    const start = this.pointerStart;
    this.pointerStart = null;

    if (!end) return;
    const dr = Math.abs(end.r - start.r);
    const dc = Math.abs(end.c - start.c);

    if (end.r === start.r && end.c === start.c) {
      this.clearSelection();
      return;
    }
    if (dr + dc !== 1) {
      // not adjacent: reselect
      this.clearSelection();
      this.select(end);
      this.pointerStart = end;
      return;
    }

    this.clearSelection();
    this.trySwap(start, end);
  }

  select(cell) {
    this.clearSelection();
    this.selected = cell;
    const { x, y } = cellXY(cell.r, cell.c);
    const glow = this.add.image(x, y, 'pt_circle').setAlpha(0.3).setScale(1.4).setDepth(15);
    this.tweens.add({ targets: glow, alpha: 0.15, scale: 1.6, duration: 600, yoyo: true, repeat: -1 });
    this.selectedGlow = glow;
    const sp = this.gems[cell.r][cell.c];
    if (sp) this.tweens.add({ targets: sp, scale: GEM_SCALE * 1.12, duration: 120 });
  }

  clearSelection() {
    this.selected = null;
    if (this.selectedGlow) {
      this.tweens.killTweensOf(this.selectedGlow);
      this.selectedGlow.destroy();
      this.selectedGlow = null;
    }
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const sp = this.gems[r][c];
        if (sp) this.tweens.add({ targets: sp, scale: GEM_SCALE, duration: 120 });
      }
    }
  }

  // -- swapping -------------------------------------------------------------
  trySwap(a, b) {
    this.state = 'busy';
    sfx.unlock();
    const swap = () => {
      const tmp = this.board[a.r][a.c];
      this.board[a.r][a.c] = this.board[b.r][b.c];
      this.board[b.r][b.c] = tmp;

      const tmpS = this.gems[a.r][a.c];
      this.gems[a.r][a.c] = this.gems[b.r][b.c];
      this.gems[b.r][b.c] = tmpS;

      const pa = cellXY(a.r, a.c);
      const pb = cellXY(b.r, b.c);
      const sa = this.gems[a.r][a.c];
      const sb = this.gems[b.r][b.c];
      return { pa, pb, sa, sb };
    };

    const { pa, pb, sa, sb } = swap();
    this.tweens.add({ targets: sa, x: pa.x, y: pa.y, duration: 150, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: sb, x: pb.x, y: pb.y, duration: 150, ease: 'Sine.easeOut' });

    this.time.delayedCall(160, () => {
      const groups = findMatches(this.board);
      if (groups.length > 0) {
        sfx.swap();
        this.moves = Math.max(0, this.moves - 1);
        this.game.events.emit('hud:moves', this.moves);
        this.resolveBoard();
      } else {
        // revert
        sfx.invalid();
        const { pa: ra, pb: rb, sa: rsa, sb: rsb } = swap(); // swap back
        this.tweens.add({ targets: rsa, x: ra.x, y: ra.y, duration: 150, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: rsb, x: rb.x, y: rb.y, duration: 150, ease: 'Sine.easeOut' });
        this.time.delayedCall(170, () => {
          this.state = 'idle';
        });
      }
    });
  }

  // -- smashing (hammer) ----------------------------------------------------
  smashCell(r, c) {
    if (this.state !== 'idle') return;
    const cell = this.board[r][c];
    if (!cell) return;
    this.state = 'resolving';
    sfx.boom();
    this.board[r][c] = null;
    const sp = this.gems[r][c];
    this.gems[r][c] = null;
    if (sp) this.popGem(sp, r, c);

    const moves = applyGravity(this.board);
    this.animateGravity(moves).then(() => {
      this.resolveBoard();
    });
  }

  // -- cascade resolution ---------------------------------------------------
  computeRound(groups) {
    const key = (r, c) => r * C + c;
    const removed = new Set();
    for (const g of groups) for (const [r, c] of g.cells) removed.add(key(r, c));

    const { toRemove, spawns } = resolveMatches(this.board, groups);
    toRemove.forEach((k) => removed.add(k));

    // iterative special expansion (handles chain reactions)
    const triggeredKeys = new Set();
    let triggeredCount = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (const k of Array.from(removed)) {
        if (triggeredKeys.has(k)) continue;
        const r = Math.floor(k / C);
        const c = k % C;
        const cell = this.board[r][c];
        if (cell && cell.special) {
          triggeredKeys.add(k);
          triggeredCount++;
          const extra = this.effectCells(cell, r, c);
          for (const [er, ec] of extra) {
            const ek = key(er, ec);
            if (!removed.has(ek)) {
              removed.add(ek);
              changed = true;
            }
          }
        }
      }
    }
    return { removed, spawns, triggeredCount };
  }

  effectCells(cell, r, c) {
    const cells = [];
    if (cell.special === SPECIAL_KEYS.h) {
      for (let cc = 0; cc < C; cc++) cells.push([r, cc]);
    } else if (cell.special === SPECIAL_KEYS.v) {
      for (let rr = 0; rr < R; rr++) cells.push([rr, c]);
    } else if (cell.special === SPECIAL_KEYS.flame) {
      for (let rr = r - 1; rr <= r + 1; rr++) {
        for (let cc = c - 1; cc <= c + 1; cc++) {
          if (rr >= 0 && rr < R && cc >= 0 && cc < C) cells.push([rr, cc]);
        }
      }
    } else if (cell.special === SPECIAL_KEYS.bomb) {
      return collectTypeCells(this.board, cell.type);
    }
    return cells;
  }

  async resolveBoard() {
    if (this.state !== 'resolving' && this.state !== 'busy') return;
    this.state = 'resolving';
    let combo = 0;

    while (true) {
      const groups = findMatches(this.board);
      if (groups.length === 0) break;
      combo++;
      sfx.match(combo);

      const { removed, spawns, triggeredCount } = this.computeRound(groups);

      const gain =
        SCORE.PER_GEM * removed.size * combo +
        SCORE.SPECIAL_TRIGGERED * triggeredCount +
        SCORE.SPECIAL_CREATED * spawns.length;
      this.addScore(gain);

      if (triggeredCount > 0) {
        sfx.boom();
        this.cameras.main.shake(140, 0.005);
      }

      // remove matched / blasted gems
      await this.removeCells(removed, triggeredCount);

      // place newly created special gems
      this.placeSpawns(spawns);

      // gravity
      const moves = applyGravity(this.board);
      await this.animateGravity(moves);

      if (combo >= 2) {
        sfx.cascade();
        this.floatText(GAME_WIDTH / 2, ORIGIN_Y + BOARD_PX / 2, `COMBO x${combo}`, 52, '#ffd23f');
      }
      this.game.events.emit('hud:progress', { score: this.score, target: this.level.target });
    }

    this.state = 'idle';
    this.afterCascade();
  }

  addScore(n) {
    this.score += n;
    this.game.events.emit('hud:score', this.score);
  }

  removeCells(removed, triggeredCount) {
    return new Promise((resolve) => {
      let pending = 0;
      let done = false;
      const finish = () => {
        pending--;
        if (pending <= 0 && !done) {
          done = true;
          resolve();
        }
      };
      for (const k of removed) {
        const r = Math.floor(k / C);
        const c = k % C;
        const cell = this.board[r][c];
        this.board[r][c] = null;
        const sp = this.gems[r][c];
        this.gems[r][c] = null;
        if (sp) {
          pending++;
          this.popGem(sp, r, c, finish);
        }
      }
      if (pending === 0 && !done) {
        done = true;
        resolve();
      }
    });
  }

  popGem(sp, r, c, cb) {
    const { x, y } = cellXY(r, c);
    const type = this.typeOfTexture(sp.texture.key);
    const color = type >= 0 ? GEM_COLORS[type].base : 0xffffff;
    this.popBurst(x, y, color);
    this.tweens.add({
      targets: sp,
      scale: 0.05,
      alpha: 0,
      angle: Phaser.Math.Between(-120, 120),
      duration: 190,
      ease: 'Back.easeIn',
      onComplete: () => {
        sp.destroy();
        cb && cb();
      },
    });
  }

  typeOfTexture(key) {
    // key like "g3" or "s_2_h"
    const m = /^g(\d+)$/.exec(key) || /^s_(\d+)_/.exec(key);
    return m ? parseInt(m[1], 10) : -1;
  }

  placeSpawns(spawns) {
    for (const s of spawns) {
      const { x, y } = cellXY(s.r, s.c);
      const key = `s_${s.type}_${s.special}`;
      const sp = this.add.image(x, y, key).setScale(0.1).setDepth(20);
      this.board[s.r][s.c] = { type: s.type, special: s.special };
      this.gems[s.r][s.c] = sp;
      sfx.special();
      this.popBurst(x, y, GEM_COLORS[s.type].light, 8, 'pt_star');
      this.tweens.add({ targets: sp, scale: GEM_SCALE, duration: 260, ease: 'Back.easeOut' });
    }
  }

  animateGravity(moves) {
    return new Promise((resolve) => {
      let maxDelay = 0;
      for (const m of moves) {
        if (!m.isNew) {
          const sp = this.gems[m.fromR][m.fromC];
          this.gems[m.fromR][m.fromC] = null;
          this.gems[m.toR][m.toC] = sp;
          const { x, y } = cellXY(m.toR, m.toC);
          this.tweens.add({ targets: sp, x, y, duration: 240, ease: 'Bounce.easeOut' });
          maxDelay = Math.max(maxDelay, 240);
        } else {
          const { x, y } = cellXY(m.toR, m.toC);
          const key = m.cell.special ? `s_${m.cell.type}_${m.cell.special}` : `g${m.cell.type}`;
          const sp = this.add.image(x, y, key).setScale(0.05).setDepth(20);
          this.gems[m.toR][m.toC] = sp;
          const delay = 120 + m.toR * 18;
          this.tweens.add({ targets: sp, scale: GEM_SCALE, duration: 200, ease: 'Back.easeOut', delay });
          maxDelay = Math.max(maxDelay, delay + 200);
        }
      }
      this.time.delayedCall(maxDelay + 40, resolve);
    });
  }

  // -- particles / floaters -------------------------------------------------
  popBurst(x, y, color, count = 12, texture = 'pt_circle') {
    const e = this.add.particles(0, 0, texture, {
      x,
      y,
      speed: { min: 70, max: 240 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.55, end: 0 },
      lifespan: { min: 250, max: 520 },
      gravityY: 520,
      tint: color,
      emitting: false,
    });
    e.setDepth(30);
    e.explode(count, x, y);
    this.time.delayedCall(650, () => e.destroy());
  }

  floatText(x, y, str, size, color) {
    const t = this.add.text(x, y, str, textStyle(size, color, { fontStyle: '800' }))
      .setOrigin(0.5)
      .setDepth(300)
      .setStroke('#000000', 6);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  // -- hints / reshuffle ----------------------------------------------------
  findHintMove() {
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (c + 1 < C && wouldMatch(this.board, r, c, r, c + 1)) return [{ r, c }, { r, c: c + 1 }];
        if (r + 1 < R && wouldMatch(this.board, r, c, r + 1, c)) return [{ r, c }, { r: r + 1, c }];
      }
    }
    return null;
  }

  flashCells(pair, color, duration) {
    for (const cell of pair) {
      const { x, y } = cellXY(cell.r, cell.c);
      const glow = this.add.image(x, y, 'pt_circle').setTint(color).setAlpha(0).setScale(0.6).setDepth(15);
      this.tweens.add({ targets: glow, alpha: { from: 0, to: 0.6 }, scale: 1.4, duration: 250, yoyo: true, repeat: Math.floor(duration / 500) });
      this.time.delayedCall(duration, () => glow.destroy());
    }
  }

  doReshuffle(showToast) {
    this.state = 'busy';
    reshuffle(this.board);
    // recreate sprites
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const old = this.gems[r][c];
        if (old) old.destroy();
        this.gems[r][c] = null;
      }
    }
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const cell = this.board[r][c];
        const key = cell.special ? `s_${cell.type}_${cell.special}` : `g${cell.type}`;
        const { x, y } = cellXY(r, c);
        const sp = this.add.image(x, y, key).setScale(0.05).setDepth(20);
        this.gems[r][c] = sp;
        this.tweens.add({ targets: sp, scale: GEM_SCALE, duration: 220, ease: 'Back.easeOut', delay: (r * C + c) * 6 });
      }
    }
    if (showToast) toast(this, 'Board shuffled!', '#4ade80');
    sfx.cascade();
    this.time.delayedCall(600, () => {
      this.state = 'idle';
    });
  }

  // -- post-cascade checks --------------------------------------------------
  afterCascade() {
    if (this.state === 'won' || this.state === 'lost') return;

    if (this.score >= this.level.target) {
      this.win();
      return;
    }
    if (this.moves <= 0) {
      this.lose();
      return;
    }
    if (!hasValidMoves(this.board)) {
      toast(this, 'No moves left — shuffling!');
      this.doReshuffle(false);
    }
  }

  // -- win / lose -----------------------------------------------------------
  win() {
    this.state = 'won';
    // Unused moves convert into bonus points.
    const moveBonus = this.moves * SCORE.MOVE_BONUS;
    this.score += moveBonus;
    this.game.events.emit('hud:score', this.score);
    this.game.events.emit('hud:progress', { score: this.score, target: this.level.target });
    sfx.win();
    sdk.gameplayStop();
    sdk.happytime();
    const stars = this.computeStars();
    const saveData = recordResult(this.levelNumber, stars, this.score, sdk);
    const wonLast = this.levelNumber >= LAST_LEVEL;

    this.time.delayedCall(400, () => this.showWinOverlay(stars, saveData, wonLast, moveBonus));
  }

  computeStars() {
    const th = starThresholds(this.level);
    if (this.score >= th[2]) return 3;
    if (this.score >= th[1]) return 2;
    return 1;
  }

  showWinOverlay(stars, saveData, wonLast, moveBonus) {
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setOrigin(0).setDepth(400);
    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(410);

    const bg = this.add.image(0, 0, panelTexture(this, 'win_panel', 620, 720, 40, 0x231245, 0.98, 0xc9b6ff, 0.35, 3));
    const title = this.add.text(0, -280, 'LEVEL COMPLETE!', textStyle(48, '#4ade80', { fontStyle: '800' })).setOrigin(0.5);
    panel.add([bg, title]);

    // stars animation
    const starImgs = [];
    for (let i = 0; i < 3; i++) {
      const s = this.add.image((i - 1) * 90, -150, 'icon_star').setScale(0);
      starImgs.push(s);
      panel.add(s);
      this.tweens.add({
        targets: s,
        scale: 1,
        duration: 350,
        ease: 'Back.easeOut',
        delay: 300 + (i < stars ? i * 320 : 0),
        onComplete: () => {
          if (i >= stars) s.setTexture('icon_star_gray').setScale(1);
          if (i === stars - 1) sfx.star(i);
        },
      });
    }

    const scoreLine = this.add.text(0, -20, `SCORE  ${fmt(this.score)}`, textStyle(40, '#ffffff', { fontStyle: '800' })).setOrigin(0.5);
    const targetLine = this.add.text(0, 40, `Target: ${fmt(this.level.target)}`, textStyle(26, '#b8a8e8')).setOrigin(0.5);
    const best = (saveData.bestScore && saveData.bestScore[this.levelNumber]) || this.score;
    const bestLine = this.add.text(0, 78, `Best: ${fmt(best)}`, textStyle(24, '#8a7bb8')).setOrigin(0.5);
    panel.add([scoreLine, targetLine, bestLine]);

    if (moveBonus > 0) {
      const bonus = this.add.text(0, 118, `Move bonus: +${fmt(moveBonus)}`, textStyle(24, '#ffd23f')).setOrigin(0.5);
      panel.add(bonus);
    }

    // buttons
    const btnY = 250;
    const nextBtn = makeButton(this, 0, btnY, 340, 92, wonLast ? 'FINISH' : 'NEXT', () => {
      sfx.click();
      if (wonLast) this.scene.start('LevelSelect');
      else this.scene.start('Game', { level: this.levelIndex + 1 });
    }, { fontSize: 36 });
    const menuBtn = makeButton(this, 0, btnY + 116, 340, 84, 'MENU', () => {
      sfx.click();
      this.scene.start('LevelSelect');
    }, { color: 0x4c2a7a, colorOver: 0x6a3fa8, fontSize: 30 });
    panel.add([nextBtn, menuBtn]);
    panel.setAlpha(0);
    panel.setScale(0.8);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  lose() {
    this.state = 'lost';
    sfx.lose();
    sdk.gameplayStop();
    this.time.delayedCall(400, () => this.showLoseOverlay());
  }

  showLoseOverlay() {
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setOrigin(0).setDepth(400);
    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(410);

    const bg = this.add.image(0, 0, panelTexture(this, 'lose_panel', 620, 620, 40, 0x231245, 0.98, 0xff90a8, 0.3, 3));
    const title = this.add.text(0, -230, 'OUT OF MOVES!', textStyle(44, '#ff90a8', { fontStyle: '800' })).setOrigin(0.5);
    const scoreLine = this.add.text(0, -130, `SCORE  ${fmt(this.score)}`, textStyle(40, '#ffffff', { fontStyle: '800' })).setOrigin(0.5);
    const targetLine = this.add.text(0, -78, `Target: ${fmt(this.level.target)}`, textStyle(26, '#b8a8e8')).setOrigin(0.5);
    panel.add([bg, title, scoreLine, targetLine]);

    const retryBtn = makeButton(this, 0, 30, 340, 92, 'RETRY', () => {
      sfx.click();
      this.scene.start('Game', { level: this.levelIndex });
    }, { fontSize: 36, color: 0x8b5cf6, colorOver: 0xa78bfa });
    panel.add(retryBtn);

    const bonusBtn = makeButton(this, 0, 140, 340, 84, '+5 MOVES (AD)', async () => {
      sfx.click();
      const watched = await sdk.requestAd('midgame');
      if (watched || !sdk.isCrazy) {
        this.moves += 5;
        this.game.events.emit('hud:moves', this.moves);
        this.state = 'idle';
        sdk.gameplayStart();
        dim.destroy();
        panel.destroy();
        toast(this, '+5 moves!', '#4ade80');
      } else {
        toast(this, 'Ad skipped — no bonus', '#ff90a8');
      }
    }, { color: 0x4c2a7a, colorOver: 0x6a3fa8, fontSize: 26 });
    panel.add(bonusBtn);

    const menuBtn = makeButton(this, 0, 250, 340, 84, 'MENU', () => {
      sfx.click();
      this.scene.start('LevelSelect');
    }, { color: 0x4c2a7a, colorOver: 0x6a3fa8, fontSize: 30 });
    panel.add([menuBtn]);

    panel.setAlpha(0);
    panel.setScale(0.8);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  shutdown() {
    sdk.gameplayStop();
    if (this.scene.isActive('Hud')) this.scene.stop('Hud');
  }
}

// ---------------------------------------------------------------------------
// Boot config
// ---------------------------------------------------------------------------
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0d0620',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  scene: [BootScene, PreloadScene, MenuScene, LevelSelectScene, GameScene, HudScene],
};

async function boot() {
  await sdk.init();
  const saveData = await loadSave(sdk);
  sfx.setMuted(saveData.muted || false);
  new Phaser.Game(config);
}

window.addEventListener('load', boot);
