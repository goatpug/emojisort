// Pure per-attempt game session: wraps the core engine state with the
// bookkeeping needed for gameplay (blind-reveal instance ids, unlimited
// undo history, the one-shot rescue container, and assist tracking).
// Still no DOM — the UI renders from `viewOf(session)`.

import {
  createState,
  cloneState,
  applyPour,
  canPour,
  evaluateUnlocks,
  computeAdjacency,
  isWon,
  hasAnyLegalMove,
  isLocked,
  isContainerComplete,
  topRun,
} from './core.js';

const RESCUE_CAPACITY = 2;

function assignInstanceIds(level) {
  const counters = Object.create(null);
  return level.containers.map((c) =>
    c.stack.map((emoji) => {
      counters[emoji] = (counters[emoji] || 0) + 1;
      return `${emoji}#${counters[emoji]}`;
    })
  );
}

function revealTopsOf(state, idStacks, revealed) {
  const next = new Set(revealed);
  state.containers.forEach((c, idx) => {
    if (isLocked(c)) return; // still concealed/barriered visually as a whole
    const ids = idStacks[idx];
    if (ids.length) next.add(ids[ids.length - 1]);
  });
  return next;
}

function snapshot(state, idStacks) {
  return { state: cloneState(state), idStacks: idStacks.map((s) => [...s]) };
}

export function createSession(level) {
  const state = createState(level);
  const adjacency = computeAdjacency(state.containers, state.rowBreaks);
  const idStacks = assignInstanceIds(level);
  const { state: settled } = evaluateUnlocks(state, adjacency);
  const revealed = level.blind ? revealTopsOf(settled, idStacks, new Set()) : new Set();

  return {
    level,
    adjacency,
    state: settled,
    idStacks,
    revealed,
    history: [snapshot(settled, idStacks)],
    moveCount: 0,
    rescueUsed: false,
    rescueActive: false,
    assisted: false,
    usedUndo: false,
  };
}

export function pour(session, srcIdx, dstIdx) {
  if (!canPour(session.state, srcIdx, dstIdx)) return session;

  const { state: poured, amount } = applyPour(session.state, srcIdx, dstIdx);

  const idStacks = session.idStacks.map((s) => [...s]);
  const movedIds = [];
  for (let i = 0; i < amount; i++) {
    const id = idStacks[srcIdx].pop();
    movedIds.push(id);
    idStacks[dstIdx].push(id);
  }

  const { state: settled } = evaluateUnlocks(poured, session.adjacency);
  let revealed = session.revealed;
  if (session.level.blind) {
    // Every emoji in a group pour is visible mid-transfer (§7), not just
    // whichever one ends up on top after landing.
    if (movedIds.length) revealed = new Set(revealed);
    for (const id of movedIds) revealed.add(id);
    revealed = revealTopsOf(settled, idStacks, revealed);
  }

  return {
    ...session,
    state: settled,
    idStacks,
    revealed,
    history: [...session.history, snapshot(settled, idStacks)],
    moveCount: session.moveCount + 1,
  };
}

export function undo(session) {
  if (session.history.length <= 1) return session;
  const history = session.history.slice(0, -1);
  const last = history[history.length - 1];
  return {
    ...session,
    state: cloneState(last.state),
    idStacks: last.idStacks.map((s) => [...s]),
    history,
    moveCount: Math.max(0, session.moveCount - 1),
    usedUndo: true,
    // revealed set is intentionally NOT rolled back (spec §6.1/§7)
  };
}

export function restart(level) {
  return createSession(level);
}

export function canAddRescue(session) {
  return !session.rescueUsed;
}

export function addRescue(session) {
  if (!canAddRescue(session)) return session;
  const state = cloneState(session.state);
  state.containers.push({ stack: [], capacity: RESCUE_CAPACITY, lock: null, rescue: true });
  const idStacks = [...session.idStacks.map((s) => [...s]), []];
  return {
    ...session,
    state,
    idStacks,
    history: [...session.history, snapshot(state, idStacks)],
    rescueUsed: true,
    rescueActive: true,
    assisted: true,
  };
}

export function checkWin(session) {
  return isWon(session.state);
}

export function checkDeadEnd(session) {
  return !hasAnyLegalMove(session.state);
}

/** Would adding a rescue container create a legal move? (per §6.3 banner rule) */
export function rescueWouldHelp(session) {
  return session.state.containers.some((c) => c.stack.length > 0 && !isLocked(c));
}

/**
 * Build a render-friendly view of the session: per-container list of
 * { emoji, id, hidden } tokens (bottom -> top), plus lock/complete flags.
 */
export function viewOf(session) {
  const { state, idStacks, revealed, level } = session;
  return state.containers.map((c, idx) => {
    const ids = idStacks[idx];
    const locked = isLocked(c);
    // A fully-sorted container has no genuine hidden information left (every
    // cell is provably the same emoji as the visible top) — display it fully
    // revealed even if some instance never individually surfaced as top.
    const complete = isContainerComplete(c);
    const tokens = c.stack.map((emoji, i) => {
      const id = ids[i];
      const isTop = i === c.stack.length - 1;
      const hidden = !locked && level.blind && !complete && !isTop && !revealed.has(id);
      return { emoji, id, hidden };
    });
    return {
      index: idx,
      capacity: c.capacity,
      tokens,
      locked,
      lock: c.lock,
      complete,
      rescue: !!c.rescue,
      topRun: topRun(c),
    };
  });
}
