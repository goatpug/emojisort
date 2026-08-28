// BFS solver: given a game state, finds the minimum number of moves to a won
// position (or proves none exists). Pure — no Node APIs — so the exact same
// algorithm runs both at authoring time (tools/solver.mjs, via solve(level))
// and at runtime (js/ui/deadend-checker.js, in a Web Worker via solveState)
// to catch dead ends the cheap hasAnyLegalMove() check misses, e.g. the only
// remaining moves shuffle one color back and forth between two containers
// forever because the rest of that color is buried elsewhere (§6.3 v2 hook).
//
// Memory note: the frontier stores only compact encoded string keys (not
// full cloned state objects), decoding a state back into containers only
// when it needs to enumerate moves from it. This keeps K up to ~12 (C=4)
// tractable without exhausting the heap (§9).

import {
  createState,
  computeAdjacency,
  listLegalMoves,
  pourAndSettle,
  evaluateUnlocks,
  isWon,
  encodeState,
} from './core.js';

function decodeState(key, template) {
  const parts = key.split('|');
  const containers = parts.map((part, i) => {
    const colon = part.indexOf(':');
    const lockTag = part.slice(0, colon);
    const stackStr = part.slice(colon + 1);
    const stack = stackStr ? stackStr.split(',') : [];
    const lock = template.containers[i].lock
      ? { type: template.containers[i].lock.type, requires: template.containers[i].lock.requires, open: lockTag[1] === '1' }
      : null;
    return { stack, capacity: template.containers[i].capacity, lock };
  });
  return { capacity: template.capacity, rowBreaks: template.rowBreaks, containers };
}

function reconstructPath(visited, startKey, endKey) {
  const path = [];
  let key = endKey;
  while (key !== startKey) {
    const entry = visited.get(key);
    path.push(entry.move);
    key = entry.prevKey;
  }
  return path.reverse();
}

/**
 * Solve from an arbitrary state (e.g. mid-game, not just a level's initial
 * deal). Returns { solvable, par, moves } where moves is an array of
 * [src, dst] pairs realizing an optimal solution (present iff solvable);
 * `aborted: true` means the search gave up at maxStates without proving
 * either way.
 */
export function solveState(initialState, adjacency, { maxStates = 500_000 } = {}) {
  const template = initialState; // capacity/lock shape never changes during search

  const start = evaluateUnlocks(initialState, adjacency).state;
  const startKey = encodeState(start);
  if (isWon(start)) return { solvable: true, par: 0, moves: [] };

  const visited = new Map(); // key -> { prevKey, move } | null (start)
  visited.set(startKey, null);
  let frontier = [startKey];
  let depth = 0;
  let statesExplored = 1;

  while (frontier.length) {
    depth++;
    const next = [];
    for (const fromKey of frontier) {
      const state = decodeState(fromKey, template);
      const moves = listLegalMoves(state);
      for (const [src, dst] of moves) {
        const { state: settled } = pourAndSettle(state, src, dst, adjacency);
        const key = encodeState(settled);
        if (visited.has(key)) continue;
        visited.set(key, { prevKey: fromKey, move: [src, dst] });
        statesExplored++;
        if (statesExplored > maxStates) {
          return { solvable: false, par: null, moves: null, aborted: true };
        }
        if (isWon(settled)) {
          return { solvable: true, par: depth, moves: reconstructPath(visited, startKey, key) };
        }
        next.push(key);
      }
    }
    frontier = next;
  }

  return { solvable: false, par: null, moves: null };
}

/** Solve a level definition from its initial deal. */
export function solve(level, opts) {
  const initial = createState(level);
  const adjacency = computeAdjacency(initial.containers, initial.rowBreaks);
  return solveState(initial, adjacency, opts);
}
