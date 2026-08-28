// Background solvability check: asks the BFS solver (in a Web Worker,
// solver-worker.js) whether a state can still be won at all. This is a
// superset of the cheap, synchronous hasAnyLegalMove() check in
// engine/core.js — it also catches a board where the only remaining moves
// shuffle one color back and forth between two containers forever, because
// the rest of that color is buried elsewhere and hasAnyLegalMove() alone
// can't tell that apart from real progress.
//
// Fire-and-forget by design: the caller passes a result callback and gets a
// cancel function back. A stale response (the board moved on before the
// worker replied) is dropped by request-id, not by inspecting game state
// here — this module knows nothing about sessions.

let worker = null;
let seq = 0;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../engine/solver-worker.js', import.meta.url), { type: 'module' });
  }
  return worker;
}

/**
 * @param {import('../engine/core.js').State} state
 * @param {Map<number, number[]>} adjacency
 * @param {(solvable: boolean) => void} onResult  called only for the most
 *   recently issued request (earlier ones are dropped once superseded)
 * @returns {() => void} cancel — suppress a still-pending response
 */
export function checkSolvableInBackground(state, adjacency, onResult) {
  const id = ++seq;
  let w;
  try {
    w = getWorker();
  } catch {
    return () => {}; // Workers unavailable — silently skip the extra check
  }
  const handler = (e) => {
    if (e.data.id !== id) return;
    w.removeEventListener('message', handler);
    onResult(e.data.solvable);
  };
  w.addEventListener('message', handler);
  w.postMessage({ id, state, adjacency: [...adjacency] });
  return () => w.removeEventListener('message', handler);
}
