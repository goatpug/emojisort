// Pure game logic: container stacks, moves, locks, win/deadend checks.
// No DOM. Operates on plain-object state so it can be shared between the
// browser UI and the Node-based solver/generator tools.

/**
 * @typedef {Object} Lock
 * @property {'sort'|'neighbor'} type
 * @property {string} [requires]  // emoji, only for type 'sort'
 * @property {boolean} open
 */

/**
 * @typedef {Object} Container
 * @property {string[]} stack   // bottom -> top
 * @property {number} capacity
 * @property {Lock|null} lock
 * @property {boolean} [rescue]
 */

/**
 * @typedef {Object} State
 * @property {number} capacity        // default capacity for level containers
 * @property {Container[]} containers
 * @property {number[]} rowBreaks     // container indices that start a new row/column
 */

export function createState(level) {
  const containers = level.containers.map((c) => ({
    stack: [...c.stack],
    capacity: level.capacity,
    lock: c.lock ? { type: c.lock.type, requires: c.lock.requires, open: false } : null,
  }));
  return {
    capacity: level.capacity,
    containers,
    rowBreaks: [...(level.rowBreaks || [])],
  };
}

export function cloneState(state) {
  return {
    capacity: state.capacity,
    rowBreaks: [...state.rowBreaks],
    containers: state.containers.map((c) => ({
      stack: [...c.stack],
      capacity: c.capacity,
      lock: c.lock ? { ...c.lock } : null,
      rescue: c.rescue,
    })),
  };
}

export function topRun(container) {
  const { stack } = container;
  if (stack.length === 0) return null;
  const emoji = stack[stack.length - 1];
  let count = 1;
  for (let i = stack.length - 2; i >= 0; i--) {
    if (stack[i] === emoji) count++;
    else break;
  }
  return { emoji, count };
}

export function isLocked(container) {
  return !!(container.lock && !container.lock.open);
}

export function isContainerComplete(container) {
  return (
    container.stack.length === container.capacity &&
    container.stack.length > 0 &&
    container.stack.every((e) => e === container.stack[0])
  );
}

export function freeSlots(container) {
  return container.capacity - container.stack.length;
}

export function canPour(state, srcIdx, dstIdx) {
  if (srcIdx === dstIdx) return false;
  const src = state.containers[srcIdx];
  const dst = state.containers[dstIdx];
  if (!src || !dst) return false;
  if (isLocked(src) || isLocked(dst)) return false;
  const run = topRun(src);
  if (!run) return false;
  if (freeSlots(dst) <= 0) return false;
  const dstTop = dst.stack[dst.stack.length - 1];
  if (dst.stack.length > 0 && dstTop !== run.emoji) return false;
  return true;
}

/**
 * Apply a pour move (assumes canPour is already true). Returns a NEW state
 * plus the number of emojis actually moved (for animation purposes).
 */
export function applyPour(state, srcIdx, dstIdx) {
  const next = cloneState(state);
  const src = next.containers[srcIdx];
  const dst = next.containers[dstIdx];
  const run = topRun(src);
  const amount = Math.min(run.count, freeSlots(dst));
  for (let i = 0; i < amount; i++) {
    dst.stack.push(src.stack.pop());
  }
  return { state: next, amount, emoji: run.emoji };
}

/** Build an adjacency map (index -> array of neighbor indices) from rowBreaks. */
export function computeAdjacency(containers, rowBreaks) {
  const n = containers.length;
  const breaks = new Set(rowBreaks || []);
  const rows = [];
  let current = [];
  for (let i = 0; i < n; i++) {
    if (containers[i].rescue) continue; // rescue container never participates
    if (breaks.has(i) && current.length) {
      rows.push(current);
      current = [];
    }
    current.push(i);
  }
  if (current.length) rows.push(current);

  const adjacency = new Map();
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const neighbors = [];
      if (i > 0) neighbors.push(row[i - 1]);
      if (i < row.length - 1) neighbors.push(row[i + 1]);
      adjacency.set(row[i], neighbors);
    }
  }
  return adjacency;
}

/**
 * Evaluate lock-open conditions given current state; returns a NEW state
 * with any newly-satisfied locks flipped open. Opening is permanent (an
 * already-open lock never re-closes even if the triggering container is
 * later broken up).
 */
export function evaluateUnlocks(state, adjacency) {
  const next = cloneState(state);

  // A sort lock's "fully sorted" condition means every instance of that
  // emoji on the whole board sits in one container — not merely that some
  // container is full at its OWN capacity. Those coincide for every normal
  // container (capacity always equals that type's total instance count by
  // level design), but not for the rescue container, whose capacity (2) is
  // independent of it — so 2 of a 4-instance type would otherwise
  // "complete" a rescue tube and wrongly satisfy the lock. Instance counts
  // are conserved by pours, so summing each type across all containers
  // gives its true board-wide total to compare against.
  const totalsByType = new Map();
  for (const c of next.containers) {
    for (const e of c.stack) {
      totalsByType.set(e, (totalsByType.get(e) || 0) + 1);
    }
  }
  const completedTypes = new Set();
  for (const c of next.containers) {
    const type = c.stack[0];
    if (type !== undefined && c.stack.length === totalsByType.get(type) && c.stack.every((e) => e === type)) {
      completedTypes.add(type);
    }
  }
  let changed = false;
  next.containers.forEach((c, idx) => {
    if (!c.lock || c.lock.open) return;
    if (c.lock.type === 'sort') {
      if (completedTypes.has(c.lock.requires)) {
        c.lock.open = true;
        changed = true;
      }
    } else if (c.lock.type === 'neighbor') {
      const neighbors = adjacency.get(idx) || [];
      if (neighbors.some((n) => isContainerComplete(next.containers[n]))) {
        c.lock.open = true;
        changed = true;
      }
    }
  });
  return { state: next, changed };
}

export function isWon(state) {
  return state.containers.every((c) => {
    if (isLocked(c)) return c.stack.length === 0;
    return c.stack.length === 0 || isContainerComplete(c);
  });
}

export function hasAnyLegalMove(state) {
  const n = state.containers.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (canPour(state, i, j)) return true;
    }
  }
  return false;
}

export function listLegalMoves(state) {
  const moves = [];
  const n = state.containers.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (canPour(state, i, j)) moves.push([i, j]);
    }
  }
  return moves;
}

/** Run a full step: pour + re-evaluate unlocks. Returns { state, amount, emoji, unlocked }. */
export function pourAndSettle(state, srcIdx, dstIdx, adjacency) {
  const { state: poured, amount, emoji } = applyPour(state, srcIdx, dstIdx);
  const { state: settled, changed } = evaluateUnlocks(poured, adjacency);
  return { state: settled, amount, emoji, unlocked: changed };
}

/** Compact string encoding of a state, for hashing in the solver's visited set. */
export function encodeState(state) {
  return state.containers
    .map((c) => {
      const lock = c.lock ? `${c.lock.type[0]}${c.lock.open ? '1' : '0'}` : '';
      return `${lock}:${c.stack.join(',')}`;
    })
    .join('|');
}
