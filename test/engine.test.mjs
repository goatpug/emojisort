import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  canPour,
  applyPour,
  pourAndSettle,
  computeAdjacency,
  evaluateUnlocks,
  isWon,
  hasAnyLegalMove,
  isContainerComplete,
} from '../js/engine/core.js';
import {
  createSession,
  pour,
  undo,
  restart,
  addRescue,
  checkWin,
  checkDeadEnd,
  viewOf,
} from '../js/engine/session.js';

function basicLevel(overrides = {}) {
  return {
    id: 'test-1',
    theme: 'aquatic',
    orientation: 'vertical',
    capacity: 4,
    blind: false,
    rowBreaks: [],
    containers: [
      { stack: ['🐠', '🐙', '🐠', '🐙'] },
      { stack: ['🐙', '🐠', '🐙', '🐠'] },
      { stack: [] },
      { stack: [] },
    ],
    par: 4,
    ...overrides,
  };
}

test('group pour moves the full matching run, capped by destination space', () => {
  const state = createState(
    basicLevel({
      containers: [
        { stack: ['🐠', '🐙', '🐙', '🐙'] },
        { stack: ['🐙'] },
        { stack: [] },
        { stack: [] },
      ],
    })
  );
  assert.equal(canPour(state, 0, 1), true);
  const { state: next, amount } = applyPour(state, 0, 1);
  assert.equal(amount, 3);
  assert.deepEqual(next.containers[1].stack, ['🐙', '🐙', '🐙', '🐙']);
  assert.deepEqual(next.containers[0].stack, ['🐠']);
});

test('mismatched tops block a pour', () => {
  const state = createState(
    basicLevel({
      containers: [{ stack: ['🐙'] }, { stack: ['🐠'] }, { stack: [] }, { stack: [] }],
    })
  );
  assert.equal(canPour(state, 0, 1), false);
  assert.equal(canPour(state, 1, 0), false);
});

test('a full container cannot receive a pour', () => {
  const state = createState(
    basicLevel({
      containers: [
        { stack: ['🐠'] },
        { stack: ['🐠', '🐠', '🐠', '🐠'] },
        { stack: [] },
        { stack: [] },
      ],
    })
  );
  assert.equal(canPour(state, 0, 1), false);
});

test('win condition requires every container empty or single-type full', () => {
  const solved = createState(
    basicLevel({
      containers: [
        { stack: ['🐠', '🐠', '🐠', '🐠'] },
        { stack: ['🐙', '🐙', '🐙', '🐙'] },
        { stack: [] },
        { stack: [] },
      ],
    })
  );
  assert.equal(isWon(solved), true);

  const unsolved = createState(basicLevel());
  assert.equal(isWon(unsolved), false);
});

test('type A (sort) lock opens only once its required type is fully sorted', () => {
  const level = basicLevel({
    containers: [
      { stack: ['🐠', '🐙', '🐠', '🐙'] },
      { stack: ['🐙', '🐠', '🐙', '🐠'] },
      { stack: [] },
      { stack: [], lock: { type: 'sort', requires: '🐠' } },
    ],
  });
  let state = createState(level);
  const adjacency = computeAdjacency(state.containers, state.rowBreaks);
  assert.equal(state.containers[3].lock.open, false);

  // Manually sort all 🐠 into container 2 to simulate completion.
  state.containers[2].stack = ['🐠', '🐠', '🐠', '🐠'];
  const { state: settled } = evaluateUnlocks(state, adjacency);
  assert.equal(settled.containers[3].lock.open, true);
});

test('a concealed container holding SOME (not all) of its own required type can never unlock (the forbidden trap shape)', () => {
  // This is exactly the shape §4.1's "hard authoring rule" forbids: 2 of the
  // 4 required 🐠 are sealed inside the lock's own container, so the other 2
  // can never accumulate to a full set anywhere else -> permanently stuck.
  // The generator must reject this; this test documents why.
  const level = basicLevel({
    containers: [
      { stack: ['🐙', '🐙', '🐙', '🐙'] },
      { stack: ['🐠', '🐠'] },
      { stack: [] },
      { stack: ['🐠', '🐠'], lock: { type: 'sort', requires: '🐠' } },
    ],
  });
  const state = createState(level);
  const adjacency = computeAdjacency(state.containers, state.rowBreaks);
  const { state: settled } = evaluateUnlocks(state, adjacency);
  assert.equal(settled.containers[3].lock.open, false);
  assert.equal(hasAnyLegalMove(settled), true); // not a dead end, just unwinnable
});

test('type B (neighbor) lock opens when an adjacent container completes', () => {
  const level = basicLevel({
    rowBreaks: [],
    containers: [
      { stack: ['🐠', '🐠', '🐠'] },
      { stack: ['🐠'], lock: { type: 'neighbor' } },
      { stack: [] },
      { stack: [] },
    ],
  });
  let state = createState(level);
  const adjacency = computeAdjacency(state.containers, state.rowBreaks);
  assert.deepEqual(adjacency.get(1), [0, 2]);

  state.containers[0].stack = ['🐙', '🐙', '🐙', '🐙'];
  const { state: settled } = evaluateUnlocks(state, adjacency);
  assert.equal(settled.containers[1].lock.open, true);
});

test('locks stay open permanently even if the triggering container is broken up', () => {
  const level = basicLevel({
    containers: [
      { stack: ['🐠', '🐠', '🐠', '🐠'] },
      { stack: [] },
      { stack: [] },
      { stack: [], lock: { type: 'sort', requires: '🐠' } },
    ],
  });
  const state = createState(level);
  const adjacency = computeAdjacency(state.containers, state.rowBreaks);
  const { state: settled } = evaluateUnlocks(state, adjacency);
  assert.equal(settled.containers[3].lock.open, true);

  // Break up the completed container.
  const { state: poured } = applyPour(settled, 0, 1);
  const { state: resettled } = evaluateUnlocks(poured, adjacency);
  assert.equal(resettled.containers[3].lock.open, true);
});

test('adjacency respects rowBreaks and excludes the rescue container', () => {
  const containers = [
    { stack: [] },
    { stack: [] },
    { stack: [] },
    { stack: [] },
    { stack: [] },
    { stack: [], rescue: true },
  ];
  const adjacency = computeAdjacency(containers, [3]);
  assert.deepEqual(adjacency.get(0), [1]);
  assert.deepEqual(adjacency.get(1), [0, 2]);
  assert.deepEqual(adjacency.get(2), [1]);
  assert.deepEqual(adjacency.get(3), [4]);
  assert.deepEqual(adjacency.get(4), [3]);
  assert.equal(adjacency.has(5), false);
});

test('dead-end detection: no legal move when every pair is blocked', () => {
  const level = basicLevel({
    containers: [
      { stack: ['🐠', '🐠', '🐠', '🐙'] },
      { stack: ['🐙', '🐙', '🐙', '🐠'] },
      { stack: ['🐠', '🐙', '🐠', '🐙'] },
      { stack: ['🐙', '🐠', '🐙', '🐠'] },
    ],
  });
  const state = createState(level);
  assert.equal(hasAnyLegalMove(state), false);
});

test('dead-end clears once a legal move exists (e.g. via rescue container)', () => {
  const level = basicLevel({
    containers: [
      { stack: ['🐠', '🐠', '🐠', '🐙'] },
      { stack: ['🐙', '🐙', '🐙', '🐠'] },
      { stack: ['🐠', '🐙', '🐠', '🐙'] },
      { stack: ['🐙', '🐠', '🐙', '🐠'] },
    ],
  });
  let session = createSession(level);
  assert.equal(checkDeadEnd(session), true);
  session = addRescue(session);
  assert.equal(checkDeadEnd(session), false);
});

test('session: undo reverts state and move count but keeps revealed set (blind)', () => {
  const level = basicLevel({
    blind: true,
    containers: [
      { stack: ['🐠', '🐙', '🐠', '🐙'] },
      { stack: ['🐙', '🐠', '🐙', '🐠'] },
      { stack: [] },
      { stack: [] },
    ],
  });
  let session = createSession(level);
  const beforeRevealedSize = session.revealed.size; // tops of both stacks visible

  session = pour(session, 1, 2); // reveals a previously-hidden emoji in container 1
  assert.equal(session.moveCount, 1);
  const afterPourRevealedSize = session.revealed.size;
  assert.ok(afterPourRevealedSize >= beforeRevealedSize);

  session = undo(session);
  assert.equal(session.moveCount, 0);
  assert.deepEqual(session.state.containers[1].stack, ['🐙', '🐠', '🐙', '🐠']);
  // Revealed set is NOT rolled back.
  assert.equal(session.revealed.size, afterPourRevealedSize);
});

test('session: every emoji in a group pour is revealed, not just the one that lands on top (§7 mid-pour rule)', () => {
  const level = basicLevel({
    blind: true,
    containers: [
      // Bottom -> top: two hidden 🐙 buried under a visible-top 🐙 (a run of 3).
      { stack: ['🐠', '🐙', '🐙', '🐙'] },
      { stack: [] },
      { stack: [] },
      { stack: [] },
    ],
  });
  let session = createSession(level);
  const idsBefore = [...session.idStacks[0]]; // [🐠#1, 🐙#1, 🐙#2, 🐙#3]
  const buriedIds = idsBefore.slice(1, 3); // 🐙#1, 🐙#2 — never individually "top"

  session = pour(session, 0, 1); // group-pours all 3 🐙 in one move
  assert.equal(session.idStacks[1].length, 3);
  for (const id of buriedIds) {
    assert.ok(session.revealed.has(id), `expected buried instance ${id} to be revealed after group pour`);
  }
});

test('session: restart clears history, reveals, and rescue', () => {
  const level = basicLevel();
  let session = createSession(level);
  session = pour(session, 0, 2);
  session = addRescue(session);
  assert.equal(session.rescueUsed, true);

  session = restart(level);
  assert.equal(session.moveCount, 0);
  assert.equal(session.rescueUsed, false);
  assert.equal(session.history.length, 1);
  assert.equal(session.state.containers.length, 4);
});

test('session: rescue container has capacity 2 and is marked assisted', () => {
  const level = basicLevel();
  let session = createSession(level);
  session = addRescue(session);
  const rescueContainer = session.state.containers.at(-1);
  assert.equal(rescueContainer.capacity, 2);
  assert.equal(rescueContainer.rescue, true);
  assert.equal(session.assisted, true);
});

test('viewOf shows every cell of a fully-sorted container even if some instance was never individually top (no genuine hidden info left)', () => {
  const level = basicLevel({
    blind: true,
    containers: [
      // Bottom -> top: 🐠 sits at the very bottom, untouched and never top,
      // but the container ends up complete once 3 more 🐠 land on it.
      { stack: ['🐠'] },
      { stack: ['🐠', '🐠', '🐠'] },
      { stack: [] },
      { stack: [] },
    ],
  });
  let session = createSession(level);
  session = pour(session, 1, 0); // completes container 0 with all four 🐠
  const view = viewOf(session);
  assert.equal(view[0].complete, true);
  assert.ok(view[0].tokens.every((t) => !t.hidden));
});

test('viewOf hides non-top emojis in blind levels until revealed', () => {
  const level = basicLevel({
    blind: true,
    containers: [
      { stack: ['🐠', '🐙', '🐠', '🐙'] },
      { stack: [] },
      { stack: [] },
      { stack: [] },
    ],
  });
  const session = createSession(level);
  const view = viewOf(session);
  const tokens = view[0].tokens;
  assert.equal(tokens[3].hidden, false); // top always visible
  assert.equal(tokens[0].hidden, true);
  assert.equal(tokens[1].hidden, true);
  assert.equal(tokens[2].hidden, true);
});

test('a full single-type container is reported complete', () => {
  const state = createState(basicLevel({ containers: [{ stack: ['🐠', '🐠', '🐠', '🐠'] }, { stack: [] }, { stack: [] }, { stack: [] }] }));
  assert.equal(isContainerComplete(state.containers[0]), true);
  assert.equal(isContainerComplete(state.containers[1]), false);
});

test('pourAndSettle unlocks in the same step a completing pour happens', () => {
  const level = basicLevel({
    containers: [
      { stack: ['🐠', '🐠', '🐠'] },
      { stack: ['🐠'] },
      { stack: [], lock: { type: 'sort', requires: '🐠' } },
      { stack: [] },
    ],
  });
  const state = createState(level);
  const adjacency = computeAdjacency(state.containers, state.rowBreaks);
  const { state: settled, unlocked } = pourAndSettle(state, 1, 0, adjacency);
  assert.equal(unlocked, true);
  assert.equal(settled.containers[2].lock.open, true);
});
