// Runs the BFS solver (solver.js) off the main thread so proving a position
// unsolvable — which can mean fully exploring its reachable state space —
// never blocks the UI. See js/ui/deadend-checker.js for the request side.

import { solveState } from './solver.js';

self.onmessage = (e) => {
  const { id, state, adjacency } = e.data;
  let result;
  try {
    result = solveState(state, new Map(adjacency), { maxStates: 150_000 });
  } catch {
    result = { solvable: true, aborted: true };
  }
  // Fail open: an aborted search (too large to fully explore) proves
  // nothing either way, so never report the player as stuck on the
  // strength of it — only a search that actually exhausted every reachable
  // state without finding a win counts as "unsolvable".
  self.postMessage({ id, solvable: result.aborted ? true : result.solvable });
};
