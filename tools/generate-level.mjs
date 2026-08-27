#!/usr/bin/env node
// Level generator: builds a level by reverse play from the solved state,
// optionally carves out locked containers, then verifies solvability and
// records the true par via the BFS solver (§10.3). Authoring tool only —
// shipped levels are the committed JSON files this produces.

import { solve } from './solver.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Reverse-play shuffle: repeatedly performs a move that is a valid inverse
 * of a legal forward group-pour, so replaying forward from the shuffled
 * state is guaranteed to be able to reconstruct the solved state (i.e. the
 * shuffle is inherently solvable, locks aside).
 */
function reverseShuffle(rng, containers, capacity, iterations, lockedFixed) {
  for (let iter = 0; iter < iterations; iter++) {
    const dstCandidates = containers
      .map((c, i) => i)
      .filter((i) => containers[i].stack.length > 0 && !lockedFixed.has(i));
    if (!dstCandidates.length) break;
    const dstIdx = pick(rng, dstCandidates);
    const dst = containers[dstIdx];
    const topEmoji = dst.stack[dst.stack.length - 1];
    let r = 1;
    for (let k = dst.stack.length - 2; k >= 0; k--) {
      if (dst.stack[k] === topEmoji) r++;
      else break;
    }
    const n = 1 + Math.floor(rng() * r);

    const srcCandidates = containers
      .map((c, i) => i)
      .filter((i) => {
        if (i === dstIdx || lockedFixed.has(i)) return false;
        const c = containers[i];
        if (c.stack.length + n > capacity) return false;
        if (c.stack.length === 0) return true;
        return c.stack[c.stack.length - 1] !== topEmoji;
      });
    if (!srcCandidates.length) continue;
    const srcIdx = pick(rng, srcCandidates);
    for (let k = 0; k < n; k++) {
      containers[srcIdx].stack.push(containers[dstIdx].stack.pop());
    }
  }
}

/**
 * Drain a specific set of container indices back to empty, using the same
 * reverse-move legality as reverseShuffle (a container may receive the
 * drained run iff it's empty OR its current top differs from the run's
 * emoji — the inverse of forward-pour matching). This keeps the result
 * consistent with "reachable by reverse play from the solved state," and is
 * far less constrained than requiring a *matching* forward pour (which
 * amounts to asking the generator to half-solve the puzzle to build it).
 * Needed because reverseShuffle must be free to use every container
 * (including the eventual "empties") as workspace while mixing — otherwise
 * there'd be no free slots to shuffle into at all — but the shipped deal
 * still needs exactly `empties` containers to start genuinely empty (the
 * classic water-sort maneuvering room).
 */
function drainTargets(rng, containers, capacity, targetIndices, maxIters) {
  for (let iter = 0; iter < maxIters; iter++) {
    const dstCandidates = [...targetIndices].filter((i) => containers[i].stack.length > 0);
    if (!dstCandidates.length) return true;
    const dstIdx = pick(rng, dstCandidates);
    const dst = containers[dstIdx];
    const topEmoji = dst.stack[dst.stack.length - 1];
    let r = 1;
    for (let k = dst.stack.length - 2; k >= 0; k--) {
      if (dst.stack[k] === topEmoji) r++;
      else break;
    }
    const n = 1 + Math.floor(rng() * r);

    const srcCandidates = containers
      .map((c, i) => i)
      .filter((i) => {
        if (targetIndices.has(i)) return false;
        const c = containers[i];
        if (c.stack.length + n > capacity) return false;
        if (c.stack.length === 0) return true;
        return c.stack[c.stack.length - 1] !== topEmoji;
      });
    if (!srcCandidates.length) continue;
    const srcIdx = pick(rng, srcCandidates);
    for (let k = 0; k < n; k++) {
      containers[srcIdx].stack.push(containers[dstIdx].stack.pop());
    }
  }
  return [...targetIndices].every((i) => containers[i].stack.length === 0);
}

function buildRowBreaks(n, rowWidth) {
  const breaks = [];
  for (let i = rowWidth; i < n; i += rowWidth) breaks.push(i);
  return breaks;
}

/**
 * @param {Object} cfg
 * @param {string} cfg.id
 * @param {number} cfg.index
 * @param {string} cfg.theme
 * @param {string[]} cfg.emojiPool
 * @param {number} cfg.k                distinct emoji types
 * @param {number} cfg.empties          initially-empty, unlocked containers
 * @param {number} [cfg.capacity]
 * @param {'vertical'|'horizontal'} [cfg.orientation]
 * @param {boolean} [cfg.blind]
 * @param {number} [cfg.rowWidth]
 * @param {{sort?: number, neighbor?: number}} [cfg.locks]  counts of each lock type to place
 * @param {number} [cfg.seed]
 * @param {number} [cfg.minPar]
 * @param {number} [cfg.shuffleIterations]
 * @param {number} [cfg.maxAttempts]
 */
export function generateLevel(cfg) {
  const capacity = cfg.capacity ?? 4;
  const orientation = cfg.orientation ?? 'vertical';
  const blind = !!cfg.blind;
  const locksCfg = cfg.locks ?? {};
  const sortLockCount = locksCfg.sort ?? 0;
  const neighborLockCount = locksCfg.neighbor ?? 0;
  const rowWidth = cfg.rowWidth ?? (orientation === 'horizontal' ? 4 : 5);
  const minPar = cfg.minPar ?? cfg.k + 2;
  const maxAttempts = cfg.maxAttempts ?? 150;
  const shuffleIterations = cfg.shuffleIterations ?? cfg.k * 12;

  const types = cfg.emojiPool.slice(0, cfg.k);
  if (types.length < cfg.k) {
    throw new Error(`theme pool too small: need ${cfg.k}, have ${cfg.emojiPool.length}`);
  }

  let seed = cfg.seed ?? 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(seed + attempt * 7919);

    const containers = [];
    for (let i = 0; i < cfg.k; i++) {
      containers.push({ stack: Array(capacity).fill(types[i]) });
    }
    for (let i = 0; i < cfg.empties; i++) {
      containers.push({ stack: [] });
    }

    // Shuffle across every container (the eventual "empties" included) so
    // there's free space to mix into, then force those indices back to
    // empty — see forceEmpty's doc comment for why.
    const emptyTargets = new Set(Array.from({ length: cfg.empties }, (_, i) => cfg.k + i));
    reverseShuffle(rng, containers, capacity, shuffleIterations, new Set());
    const drained = drainTargets(rng, containers, capacity, emptyTargets, capacity * cfg.k * 20);
    if (!drained) continue; // reroll

    // --- carve out locks -------------------------------------------------
    const lockPlan = [];
    const usedSortTypes = new Set();
    for (let i = 0; i < sortLockCount; i++) {
      const candidateTypes = types.filter((t) => !usedSortTypes.has(t));
      if (!candidateTypes.length) break;
      const requires = pick(rng, candidateTypes);
      usedSortTypes.add(requires);
      // Any container index (0..poolCount-1) not already chosen for a lock,
      // and whose current contents don't include `requires` (hard rule §4.1).
      const eligible = containers
        .map((c, idx) => idx)
        .filter(
          (idx) =>
            !lockPlan.some((l) => l.index === idx) &&
            !containers[idx].stack.includes(requires)
        );
      if (!eligible.length) continue;
      const index = pick(rng, eligible);
      lockPlan.push({ index, type: 'sort', requires });
    }
    for (let i = 0; i < neighborLockCount; i++) {
      const eligible = containers
        .map((c, idx) => idx)
        .filter((idx) => !lockPlan.some((l) => l.index === idx));
      if (!eligible.length) break;
      const index = pick(rng, eligible);
      lockPlan.push({ index, type: 'neighbor' });
    }
    if (lockPlan.length < sortLockCount + neighborLockCount) continue; // reroll

    const finalContainers = containers.map((c, idx) => {
      const lockDef = lockPlan.find((l) => l.index === idx);
      return {
        stack: c.stack,
        ...(lockDef
          ? { lock: lockDef.type === 'sort' ? { type: 'sort', requires: lockDef.requires } : { type: 'neighbor' } }
          : {}),
      };
    });

    const rowBreaks = buildRowBreaks(finalContainers.length, rowWidth);

    // A locked container must have >=1 row/column neighbor to ever unlock
    // (type 'neighbor') — reject placements on an isolated single-row tail.
    if (lockPlan.some((l) => l.type === 'neighbor')) {
      const rows = [];
      let cur = [];
      const breaks = new Set(rowBreaks);
      for (let i = 0; i < finalContainers.length; i++) {
        if (breaks.has(i) && cur.length) {
          rows.push(cur);
          cur = [];
        }
        cur.push(i);
      }
      if (cur.length) rows.push(cur);
      const isolated = lockPlan
        .filter((l) => l.type === 'neighbor')
        .some((l) => rows.find((row) => row.includes(l.index))?.length === 1);
      if (isolated) continue;
    }

    const level = {
      id: cfg.id,
      index: cfg.index,
      theme: cfg.theme,
      orientation,
      capacity,
      blind,
      rowBreaks,
      containers: finalContainers,
    };

    const result = solve(level);
    if (!result.solvable || result.aborted) continue;
    if (result.par < minPar) continue;

    return { ...level, par: result.par };
  }

  throw new Error(`generateLevel: failed to produce a valid level for ${cfg.id} after ${maxAttempts} attempts`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    out[key] = val;
    i++;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.theme || !args.k) {
    console.error(
      'Usage: node tools/generate-level.mjs --theme aquatic --k 5 --empties 2 --seed 1 --id aquatic-01 --index 1 [--out levels/aquatic-01.json] [--blind] [--sortLocks 1] [--neighborLocks 1] [--orientation horizontal]'
    );
    process.exit(1);
  }
  const { THEMES } = await import('../js/data/themes.js');
  const theme = THEMES[args.theme];
  if (!theme) throw new Error(`unknown theme: ${args.theme}`);

  const level = generateLevel({
    id: args.id ?? `${args.theme}-${args.index ?? '00'}`,
    index: Number(args.index ?? 0),
    theme: args.theme,
    emojiPool: theme.emojiPool,
    k: Number(args.k),
    empties: Number(args.empties ?? 2),
    orientation: args.orientation ?? 'vertical',
    blind: !!args.blind,
    seed: Number(args.seed ?? 1),
    locks: { sort: Number(args.sortLocks ?? 0), neighbor: Number(args.neighborLocks ?? 0) },
  });

  const json = JSON.stringify(level, null, 2) + '\n';
  if (args.out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.out, json);
    console.log(`wrote ${args.out} (par=${level.par})`);
  } else {
    console.log(json);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
