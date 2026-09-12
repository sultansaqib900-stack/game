// ---------------------------------------------------------------------------
// Persistent data: level progression, per-level star record and preferences.
// Priority order: localStorage -> Crazy Games cloud data -> defaults.
// ---------------------------------------------------------------------------

const KEY = 'gemcascade.save.v1';

const DEFAULTS = {
  unlocked: 1,           // highest unlocked level (1-based)
  stars: {},             // { levelNumber: 0..3 }
  bestScore: {},         // { levelNumber: bestScore }
  muted: false,
  gemsCleared: 0,        // lifetime stats (for fun)
};

let cache = null;

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) {
    return null;
  }
}

function writeLocal(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  const out = { ...base };
  if (typeof extra.unlocked === 'number') out.unlocked = extra.unlocked;
  if (extra.stars && typeof extra.stars === 'object') out.stars = { ...base.stars, ...extra.stars };
  if (extra.bestScore && typeof extra.bestScore === 'object') out.bestScore = { ...base.bestScore, ...extra.bestScore };
  if (typeof extra.muted === 'boolean') out.muted = extra.muted;
  if (typeof extra.gemsCleared === 'number') out.gemsCleared = extra.gemsCleared;
  return out;
}

export async function loadSave(sdk) {
  const local = readLocal();
  let cloud = null;
  if (sdk) cloud = await sdk.dataLoad();
  cache = merge(DEFAULTS, merge(local || DEFAULTS, cloud));
  return cache;
}

export function getSave() {
  if (!cache) cache = { ...DEFAULTS };
  return cache;
}

export function save(partial) {
  const cur = getSave();
  cache = merge(cur, partial);
  writeLocal(cache);
  return cache;
}

/** Record the result of a finished level and persist it. */
export function recordResult(levelNumber, stars, score, sdk) {
  const cur = getSave();
  const best = Math.max(cur.bestScore[levelNumber] || 0, score);
  const prevStars = cur.stars[levelNumber] || 0;
  const next = {
    stars: { ...cur.stars, [levelNumber]: Math.max(prevStars, stars) },
    bestScore: { ...cur.bestScore, [levelNumber]: best },
    gemsCleared: cur.gemsCleared,
  };
  if (score >= 0 && levelNumber >= cur.unlocked && stars > 0) {
    next.unlocked = Math.max(cur.unlocked, Math.min(levelNumber + 1, 20));
  }
  cache = merge(cur, next);
  writeLocal(cache);
  if (sdk) sdk.dataSave({ unlocked: cache.unlocked, stars: cache.stars, bestScore: cache.bestScore, muted: cache.muted });
  return cache;
}

export function setMutedPref(muted, sdk) {
  save({ muted });
  if (sdk) sdk.dataSave({ unlocked: cache.unlocked, stars: cache.stars, bestScore: cache.bestScore, muted });
}

export function resetAll() {
  cache = { ...DEFAULTS };
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return cache;
}
