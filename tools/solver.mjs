#!/usr/bin/env node
// CLI wrapper around the shared BFS solver (js/engine/solver.js) — the same
// algorithm the runtime uses in a Web Worker to catch dead ends mid-game.
// This just adds file-loading and a human-readable report for authoring use.
//
// Usage: node tools/solver.mjs levels/aquatic-03.json
//        node tools/solver.mjs '<json level object>'

import { readFileSync } from 'node:fs';
import { solve } from '../js/engine/solver.js';

export { solve };

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
