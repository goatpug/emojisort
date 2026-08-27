// localStorage persistence (§10.4). Single namespaced key; everything here
// is plain data in/out, no DOM.

const KEY = 'emojisort.v1';

function defaultData() {
  return {
    furthestUnlocked: 1,
    levels: {}, // id -> { solved, bestMoves, gotPar, usedRescue, usedUndo, completions }
    seenTooltips: {},
    completionShown: false,
  };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed, levels: { ...parsed.levels } };
  } catch {
    return defaultData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable (private mode, quota) — fail silently, v1 has no server fallback
  }
}

export function isLevelUnlocked(data, levelIndex) {
  return levelIndex <= data.furthestUnlocked;
}

export function recordResult(data, level, { moves, assisted, usedUndo }) {
  const prev = data.levels[level.id] || {
    solved: false,
    bestMoves: null,
    gotPar: false,
    usedRescue: false,
    usedUndo: false,
    completions: 0,
  };
  const gotPar = !assisted && moves === level.par;
  const next = {
    solved: true,
    bestMoves: prev.bestMoves === null ? moves : Math.min(prev.bestMoves, moves),
    gotPar: prev.gotPar || gotPar,
    usedRescue: prev.usedRescue || assisted,
    usedUndo: prev.usedUndo || usedUndo,
    completions: prev.completions + 1,
  };
  data.levels[level.id] = next;
  if (level.index + 1 > data.furthestUnlocked) {
    data.furthestUnlocked = level.index + 1;
  }
  return { ...data, gotParThisRun: gotPar };
}

export function hasSeenTooltip(data, key) {
  return !!data.seenTooltips[key];
}

export function markTooltipSeen(data, key) {
  data.seenTooltips = { ...data.seenTooltips, [key]: true };
}

export function computeCareerStats(data, manifest) {
  const total = manifest.levels.length;
  let solved = 0;
  let pars = 0;
  let totalMoves = 0;
  let rescueFree = 0;
  const themesCompleted = new Set();
  const themeTotals = new Map();

  for (const entry of manifest.levels) {
    themeTotals.set(entry.theme, (themeTotals.get(entry.theme) || 0) + 1);
  }
  const themeSolved = new Map();

  for (const entry of manifest.levels) {
    const rec = data.levels[entry.id];
    if (rec?.solved) {
      solved++;
      if (rec.gotPar) pars++;
      if (rec.bestMoves != null) totalMoves += rec.bestMoves;
      if (!rec.usedRescue) rescueFree++;
      themeSolved.set(entry.theme, (themeSolved.get(entry.theme) || 0) + 1);
    }
  }
  for (const [theme, count] of themeTotals) {
    if (themeSolved.get(theme) === count) themesCompleted.add(theme);
  }

  return {
    total,
    solved,
    pars,
    totalMoves,
    rescueFree,
    themesCompletedCount: themesCompleted.size,
    perfectGame: pars === total,
  };
}
