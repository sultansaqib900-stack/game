// ---------------------------------------------------------------------------
// Pure match-3 board logic (no rendering).
//
// The board is a 2D array board[row][col]. Each cell is either null (hole) or:
//   { type: 0..5, special: null | 'h' | 'v' | 'flame' | 'bomb' }
//
// ---------------------------------------------------------------------------

import { BOARD_ROWS, BOARD_COLS, GEM_TYPE_COUNT, SPECIAL_KEYS } from './config.js';

const R = BOARD_ROWS;
const C = BOARD_COLS;

export function createBoard() {
  const board = Array.from({ length: R }, () => new Array(C).fill(null));
  let guard = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      let t = randomType();
      while (makesMatch(board, r, c, t) && guard++ < 200) t = randomType();
      board[r][c] = { type: t, special: null };
    }
  }
  return board;
}

export function randomType() {
  return Math.floor(Math.random() * GEM_TYPE_COUNT);
}

/** Would placing `type` at (r, c) create an immediate 3-in-a-row? */
export function makesMatch(board, r, c, type) {
  // horizontal
  let count = 1;
  let cc = c - 1;
  while (cc >= 0 && board[r][cc] && board[r][cc].type === type) { count++; cc--; }
  cc = c + 1;
  while (cc < C && board[r][cc] && board[r][cc].type === type) { count++; cc++; }
  if (count >= 3) return true;
  // vertical
  count = 1;
  let rr = r - 1;
  while (rr >= 0 && board[rr][c] && board[rr][c].type === type) { count++; rr--; }
  rr = r + 1;
  while (rr < R && board[rr][c] && board[rr][c].type === type) { count++; rr++; }
  return count >= 3;
}

export function cellAt(board, r, c) {
  if (r < 0 || r >= R || c < 0 || c >= C) return null;
  return board[r][c];
}

/** True when a board cell is empty (has been cleared / fallen away). */
export function hasEmpty(board) {
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!board[r][c]) return true;
    }
  }
  return false;
}

/** True when at least one legal move exists (checks the first one found). */
export function hasValidMoves(board) {
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (wouldMatch(board, r, c, r, c + 1)) return true;
      if (wouldMatch(board, r, c, r + 1, c)) return true;
    }
  }
  return false;
}

/** Would swapping (r1,c1) with (r2,c2) produce at least one 3-match? */
export function wouldMatch(board, r1, c1, r2, c2) {
  const a = cellAt(board, r1, c1);
  const b = cellAt(board, r2, c2);
  if (!a || !b) return false;
  // simulate
  board[r1][c1] = b;
  board[r2][c2] = a;
  const matched = findMatches(board).length > 0;
  board[r1][c1] = a;
  board[r2][c2] = b;
  return matched;
}

/**
 * Find every contiguous run (horizontal or vertical) of 3+ same-type gems.
 * Returns a list of match groups: { cells: [[r,c],...], type, len, orientation }.
 */
export function findMatches(board) {
  const seen = new Set();
  const groups = [];

  const key = (r, c) => r * C + c;

  const scanLine = (r, c, dr, dc) => {
    const cell = board[r][c];
    if (!cell) return;
    const type = cell.type;
    let rr = r, cc = c, n = 0;
    const cells = [];
    while (rr >= 0 && rr < R && cc >= 0 && cc < C && board[rr][cc] && board[rr][cc].type === type) {
      cells.push([rr, cc]);
      n++;
      rr += dr;
      cc += dc;
    }
    if (n >= 3) {
      let fresh = false;
      for (const [cr, cl] of cells) if (!seen.has(key(cr, cl))) fresh = true;
      if (fresh) {
        groups.push({
          cells,
          type,
          len: n,
          orientation: dr === 0 ? 'h' : 'v',
        });
        for (const [cr, cl] of cells) seen.add(key(cr, cl));
      }
    }
  };

  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!board[r][c]) continue;
      if (c === 0 || !board[r][c - 1] || board[r][c - 1].type !== board[r][c].type) scanLine(r, c, 0, 1);
      if (r === 0 || !board[r - 1][c] || board[r - 1][c].type !== board[r][c].type) scanLine(r, c, 1, 0);
    }
  }
  return groups;
}

/**
 * Turn a set of matches into special-gem spawn decisions.
 * The special gem is placed at the cell of the matched group's anchor where the
 * swap happened (spawnR/spawnC), falling back to the group's centre.
 *
 * Returns { toRemove: Set<key>, spawns: [{ r, c, type, special }] }.
 */
export function resolveMatches(board, groups, spawnR = -1, spawnC = -1) {
  const toRemove = new Set();
  const spawns = [];
  const key = (r, c) => r * C + c;

  for (const g of groups) {
    for (const [r, c] of g.cells) toRemove.add(key(r, c));
  }

  // Choose spawn cells. Prefer a swapped cell; otherwise the middle of the group.
  const spawnTarget = (cells) => {
    if (spawnR >= 0 && spawnC >= 0 && cells.some(([r, c]) => r === spawnR && c === spawnC)) {
      return [spawnR, spawnC];
    }
    const mid = cells[Math.floor(cells.length / 2)];
    return mid;
  };

  const addSpawn = (cells, type, special) => {
    const [r, c] = spawnTarget(cells);
    // A cell can only host one spawn.
    if (spawns.some((s) => s.r === r && s.c === c)) {
      const [r2, c2] = cells[cells.length - 1];
      spawns.push({ r: r2, c: c2, type, special });
    } else {
      spawns.push({ r, c, type, special });
    }
  };

  for (const g of groups) {
    const horiz = g.orientation === 'h';
    const vert = g.orientation === 'v';
    if (g.len >= 5) {
      addSpawn(g.cells, g.type, SPECIAL_KEYS.bomb);      // 5+ in a row -> colour bomb
    } else if (g.len === 4) {
      addSpawn(g.cells, g.type, horiz ? SPECIAL_KEYS.h : SPECIAL_KEYS.v);
    }
    // L / T shapes of 5 handled below via intersection detection.
  }

  // Detect intersection shapes (L or T, 5 gems) -> flame gem.
  const centers = new Map();
  const keyOf = (r, c) => `${r},${c}`;
  for (const g of groups) {
    if (g.len !== 3) continue;
    for (const [r, c] of g.cells) {
      const k = keyOf(r, c);
      if (!centers.has(k)) centers.set(k, []);
      centers.get(k).push(g);
    }
  }
  for (const [k, gs] of centers) {
    if (gs.length >= 2 && gs[0].orientation !== gs[1].orientation) {
      const [r, c] = k.split(',').map(Number);
      const total = gs.reduce((s, g) => s + g.cells.length, 0) - (gs.length - 1);
      if (total >= 5) {
        // Skip if the centre already hosts a spawn from a 4/5 run.
        if (!spawns.some((s) => s.r === r && s.c === c)) {
          const type = board[r][c] ? board[r][c].type : gs[0].type;
          spawns.push({ r, c, type, special: SPECIAL_KEYS.flame });
        }
      }
    }
  }

  // A special must sit in a cell that is being cleared (it replaces the cleared gem).
  for (const s of spawns) {
    toRemove.add(key(s.r, s.c));
  }

  return { toRemove, spawns };
}

/**
 * Apply gravity: gems fall down into holes; new random gems drop in from the top.
 * Returns a list of moved gems: { fromR, fromC, toR, toC, cell, isNew }.
 */
export function applyGravity(board) {
  const moves = [];
  const randomOf = () => ({ type: randomType(), special: null });

  for (let c = 0; c < C; c++) {
    // Build the surviving column bottom-up.
    const column = [];
    for (let r = R - 1; r >= 0; r--) {
      if (board[r][c]) column.push({ cell: board[r][c], fromR: r });
    }
    let write = R - 1;
    for (let i = 0; i < column.length; i++) {
      const { cell, fromR } = column[i];
      if (fromR !== write) {
        moves.push({ fromR, fromC: c, toR: write, toC: c, cell, isNew: false });
        board[write][c] = cell;
      } else {
        board[write][c] = cell;
      }
      write--;
    }
    // Fill the rest with new gems.
    while (write >= 0) {
      const cell = randomOf();
      board[write][c] = cell;
      moves.push({ fromR: -1, fromC: c, toR: write, toC: c, cell, isNew: true });
      write--;
    }
  }
  return moves;
}

/** Remove every gem of a given type (colour-bomb effect). Returns affected cells. */
export function collectTypeCells(board, type) {
  const cells = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (board[r][c] && board[r][c].type === type) cells.push([r, c]);
    }
  }
  return cells;
}

/** Shuffle gems so the board has valid moves again (no holes, no instant matches). */
export function reshuffle(board) {
  // Collect gems in reading order.
  const gems = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      gems.push(board[r][c]);
    }
  }
  // Fisher-Yates.
  for (let i = gems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gems[i], gems[j]] = [gems[j], gems[i]];
  }
  let idx = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      board[r][c] = gems[idx++];
    }
  }
  // Deterministically nudge until valid.
  let guard = 0;
  while (!hasValidMoves(board) && guard++ < 300) {
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        board[r][c].type = randomType();
      }
    }
  }
  // Also ensure no instant matches remain.
  let guard2 = 0;
  while (findMatches(board).length > 0 && guard2++ < 300) {
    const g = findMatches(board);
    for (const grp of g) {
      for (const [r, c] of grp.cells) board[r][c].type = randomType();
    }
  }
  return board;
}
