// ---------------------------------------------------------------------------
// Global game configuration, gem definitions and level data.
// ---------------------------------------------------------------------------

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

export const BOARD_ROWS = 8;
export const BOARD_COLS = 8;
export const GEM_TYPE_COUNT = 6;

// Per-gem colors + the shape used for that gem (shape adds colour-blind support).
export const GEM_COLORS = [
  { base: 0xff4d6d, light: 0xff90a8, dark: 0xc9184a, name: 'rose' },
  { base: 0xff922b, light: 0xffc078, dark: 0xd9480f, name: 'amber' },
  { base: 0xffd23f, light: 0xffe59a, dark: 0xd9a400, name: 'lemon' },
  { base: 0x4ade80, light: 0x96f2a8, dark: 0x1f9d55, name: 'mint' },
  { base: 0x38bdf8, light: 0x8adcff, dark: 0x0e7490, name: 'sky' },
  { base: 0xa78bfa, light: 0xc9b6ff, dark: 0x6d28d9, name: 'grape' },
];

export const GEM_SHAPES = ['circle', 'diamond', 'star', 'hexagon', 'square', 'triangle'];

// Special gem types created from bigger matches.
//   h     -> match of 4 horizontally : clears a full row
//   v     -> match of 4 vertically   : clears a full column
//   flame -> L/T match of 5          : clears a 3x3 area
//   bomb  -> match of 5 in a line    : clears every gem of one colour
export const SPECIAL_KEYS = { h: 'h', v: 'v', flame: 'flame', bomb: 'bomb' };

// Each level: moves available + score target. Star thresholds are derived.
export const LEVELS = [
  { moves: 20, target: 600 },
  { moves: 18, target: 900 },
  { moves: 18, target: 1200 },
  { moves: 17, target: 1500 },
  { moves: 17, target: 1800 },
  { moves: 16, target: 2200 },
  { moves: 16, target: 2600 },
  { moves: 15, target: 3000 },
  { moves: 15, target: 3400 },
  { moves: 15, target: 3900 },
  { moves: 14, target: 4400 },
  { moves: 14, target: 4900 },
  { moves: 13, target: 5400 },
  { moves: 13, target: 6000 },
  { moves: 12, target: 6600 },
  { moves: 12, target: 7300 },
  { moves: 12, target: 8100 },
  { moves: 11, target: 9000 },
  { moves: 11, target: 10000 },
  { moves: 10, target: 11200 },
];

// Score rules.
export const SCORE = {
  PER_GEM: 10,          // multiplied by the cascade/combo counter
  SPECIAL_CREATED: 150, // bonus when a special gem is created
  SPECIAL_TRIGGERED: 60,// bonus per special gem that activates
  MOVE_BONUS: 60,       // per unused move at level end
};

// Star thresholds as a multiplier of the target score.
export const STAR_MULT = [1, 1.35, 1.75];

export function starThresholds(level) {
  return STAR_MULT.map((m) => Math.round(level.target * m));
}
