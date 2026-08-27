#!/usr/bin/env node
// BFS solver: given a level, finds the minimum number of moves to solve it
// (or proves it unsolvable). Used at authoring time only — never at runtime.
//
// Usage: node tools/solver.mjs levels/aquatic-03.json
//        node tools/solver.mjs '<json level object>'
//
// Memory note: the frontier stores only compact encoded string keys (not
// full cloned state objects), decoding a state back into containers only
// when it needs to enumerate moves from it. This keeps K up to ~12 (C=4)
// tractable in Node without exhausting the heap (§9).

import { readFileSync } from 'node:fs';
import {
  createState,
  computeAdjacency,
  listLegalMoves,
  pourAndSettle,
  evaluateUnlocks,
  isWon,
  encodeState,
} from '../js/engine/core.js';

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

/**
 * Solve a level. Returns { solvable, par, moves } where moves is an array
 * of [src, dst] pairs realizing an optimal solution (present iff solvable).
 */
export function solve(level, { maxStates = 500_000 } = {}) {
  const initial = createState(level);
  const adjacency = computeAdjacency(initial.containers, initial.rowBreaks);
  const template = initial; // capacity/lock shape never changes during search

  const start = evaluateUnlocks(initial, adjacency).state;
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

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node tools/solver.mjs <level.json | json-string>');
    process.exit(1);
  }
  let level;
  try {
    level = JSON.parse(arg);
  } catch {
    level = JSON.parse(readFileSync(arg, 'utf8'));
  }
  const t0 = Date.now();
  const result = solve(level);
  const ms = Date.now() - t0;
  if (!result.solvable) {
    console.error(`UNSOLVABLE (${ms}ms)${result.aborted ? ' [aborted: state space too large]' : ''}`);
    process.exit(2);
  }
  console.log(`par=${result.par} moves=${JSON.stringify(result.moves)} (${ms}ms)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
