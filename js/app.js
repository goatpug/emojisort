import { THEMES } from './data/themes.js';
import {
  loadData,
  saveData,
  recordResult,
  hasSeenTooltip,
  markTooltipSeen,
  computeCareerStats,
} from './data/storage.js';
import {
  createSession,
  pour,
  undo,
  restart,
  addRescue,
  canAddRescue,
  rescueWouldHelp,
  checkWin,
  checkDeadEnd,
  viewOf,
} from './engine/session.js';
import { canPour } from './engine/core.js';
import { renderBoard, renderLevelGrid, floatTokens } from './ui/render.js';
import { createSelectionController } from './ui/input.js';
import { checkSolvableInBackground } from './ui/deadend-checker.js';

const els = {
  select: document.getElementById('screen-select'),
  game: document.getElementById('screen-game'),
  grid: document.getElementById('level-grid'),
  board: document.getElementById('board'),
  levelName: document.getElementById('level-name'),
  moveCount: document.getElementById('move-count'),
  btnBack: document.getElementById('btn-back'),
  btnHelp: document.getElementById('btn-help'),
  btnUndo: document.getElementById('btn-undo'),
  btnRestart: document.getElementById('btn-restart'),
  btnRescue: document.getElementById('btn-rescue'),
  btnCheckSolvable: document.getElementById('btn-check-solvable'),
  btnTrophy: document.getElementById('btn-trophy'),
  deadendBanner: document.getElementById('deadend-banner'),
  deadendText: document.getElementById('deadend-text'),
  deadendUndo: document.getElementById('deadend-undo'),
  deadendRestart: document.getElementById('deadend-restart'),
  deadendRescue: document.getElementById('deadend-rescue'),
  checkToast: document.getElementById('check-toast'),
  checkToastText: document.getElementById('check-toast-text'),
  tooltipBanner: document.getElementById('tooltip-banner'),
  tooltipText: document.getElementById('tooltip-text'),
  tooltipDismiss: document.getElementById('tooltip-dismiss'),
  overlayResults: document.getElementById('overlay-results'),
  resultsMoves: document.getElementById('results-moves'),
  resultsPar: document.getElementById('results-par'),
  resultsReplay: document.getElementById('results-replay'),
  resultsNext: document.getElementById('results-next'),
  resultsSelect: document.getElementById('results-select'),
  overlayCompletion: document.getElementById('overlay-completion'),
  completionStats: document.getElementById('completion-stats'),
  completionClose: document.getElementById('completion-close'),
};

let manifest = null;
let storageData = loadData();
let level = null;
let session = null;
let selection = null;
let invalidTimer = null;
let cancelDeepDeadEndCheck = null;
let checkToastTimer = null;

async function init() {
  manifest = await fetch('levels/index.json').then((r) => r.json());
  showSelectScreen();

  els.btnBack.addEventListener('click', showSelectScreen);
  els.btnTrophy.addEventListener('click', showCompletionOverlay);
  els.btnHelp.addEventListener('click', () => showTooltip(helpText(), null));
  els.btnUndo.addEventListener('click', doUndo);
  els.btnRestart.addEventListener('click', doRestart);
  els.btnRescue.addEventListener('click', doRescue);
  els.btnCheckSolvable.addEventListener('click', doCheckSolvable);
  els.deadendUndo.addEventListener('click', doUndo);
  els.deadendRestart.addEventListener('click', doRestart);
  els.deadendRescue.addEventListener('click', doRescue);
  els.tooltipDismiss.addEventListener('click', dismissTooltip);
  els.resultsReplay.addEventListener('click', () => {
    hideOverlay(els.overlayResults);
    loadLevel(level);
  });
  els.resultsNext.addEventListener('click', () => {
    hideOverlay(els.overlayResults);
    const nextEntry = manifest.levels.find((e) => e.index === level.index + 1);
    if (nextEntry) fetchAndLoad(nextEntry);
    else showSelectScreen();
  });
  els.resultsSelect.addEventListener('click', () => {
    hideOverlay(els.overlayResults);
    showSelectScreen();
  });
  els.completionClose.addEventListener('click', () => {
    hideOverlay(els.overlayCompletion);
    showSelectScreen();
  });

  document.addEventListener('keydown', (e) => {
    if (els.game.hidden) return;
    if (els.overlayResults.hidden === false || els.overlayCompletion.hidden === false) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= 9) {
      const idx = n - 1;
      if (idx < view().length) selection.select(idx);
    }
  });
}

function helpText() {
  return 'Tap a container to pick up its top emojis, then tap another to pour them. Sort every emoji type into its own container to win.';
}

function view() {
  return viewOf(session);
}

// ---------------- Level select ----------------

function showSelectScreen() {
  els.game.hidden = true;
  els.select.hidden = false;
  storageData = loadData();
  renderLevelGrid(els.grid, decorateManifest(manifest), storageData, { onSelect: fetchAndLoad });
}

function decorateManifest(m) {
  return {
    levels: m.levels.map((e) => ({ ...e, emojiLabel: THEMES[e.theme]?.label })),
  };
}

async function fetchAndLoad(entry) {
  const lvl = await fetch(`levels/${entry.id}.json`).then((r) => r.json());
  loadLevel(lvl);
}

// ---------------- Game screen ----------------

function loadLevel(lvl) {
  level = lvl;
  session = createSession(level);
  cancelDeepDeadEndCheck?.();
  cancelDeepDeadEndCheck = null;
  clearTimeout(checkToastTimer);
  hideOverlay(els.checkToast);
  selection = createSelectionController({
    canSelect: (index) => {
      const v = view()[index];
      return !v.locked && v.tokens.length > 0;
    },
    onAttemptMove: (from, to) => attemptMove(from, to),
    onInvalid: (index) => flashInvalid(index),
    onSelectionChange: () => renderAll(),
  });

  els.select.hidden = true;
  els.game.hidden = false;
  els.game.dataset.theme = level.theme;
  els.levelName.textContent = `${THEMES[level.theme]?.name ?? level.theme} · Level ${level.index}`;
  hideOverlay(els.overlayResults);
  hideOverlay(els.overlayCompletion);
  els.deadendBanner.hidden = true;
  els.tooltipBanner.hidden = true;

  renderAll();
  maybeShowIntroTooltip();
}

function renderAll(openingIndices = new Set()) {
  const v = view();
  renderBoard(els.board, v, level, THEMES[level.theme], {
    selectedIndex: selection.getSelected(),
    invalidIndex: null,
    openingIndices,
    onSelect: (index) => selection.select(index),
  });
  els.moveCount.textContent = `${session.moveCount} move${session.moveCount === 1 ? '' : 's'}`;
  els.btnUndo.disabled = session.history.length <= 1;
  els.btnRescue.disabled = !canAddRescue(session);
  els.btnCheckSolvable.disabled = checkWin(session) || checkDeadEnd(session);
  updateDeadEndBanner();
}

function attemptMove(from, to) {
  if (!canPour(session.state, from, to)) return false;
  invalidatePendingCheck();

  const beforeView = view();
  const boardRects = [...els.board.querySelectorAll('.container')].map((el) => el.getBoundingClientRect());
  const srcRect = boardRects[from];
  const dstRect = boardRects[to];
  const amount = beforeView[from].topRun.count;
  const emoji = beforeView[from].topRun.emoji;

  const before = beforeView.map((c) => c.locked);
  session = pour(session, from, to);
  const after = view().map((c) => c.locked);
  const justOpened = new Set();
  after.forEach((locked, i) => {
    if (before[i] && !locked) justOpened.add(i);
  });

  if (srcRect && dstRect) {
    floatTokens(srcRect, dstRect, emoji, Math.min(amount, 4));
  }

  renderAll(justOpened);
  if (justOpened.size) {
    setTimeout(() => renderAll(new Set()), 600);
  }

  if (checkWin(session)) {
    setTimeout(() => onWin(), justOpened.size ? 650 : 300);
  }
  return true;
}

function flashInvalid(index) {
  const v = view();
  renderBoard(els.board, v, level, THEMES[level.theme], {
    selectedIndex: null,
    invalidIndex: index,
    openingIndices: new Set(),
    onSelect: (i) => selection.select(i),
  });
  clearTimeout(invalidTimer);
  invalidTimer = setTimeout(() => renderAll(), 350);
}

// Only the cheap, instant, always-correct "is there any legal move at all"
// check runs automatically. The deeper "can this position still be WON"
// check (which can say no even while legal moves exist — see
// doCheckSolvable) is opt-in only, via the Check button: it's too easy for
// an unprompted verdict to land mid-tap and be mistaken for (or literally
// overlap and block) the move it's actually fine to make.
function updateDeadEndBanner() {
  const stuck = !checkWin(session) && checkDeadEnd(session);
  els.deadendBanner.hidden = !stuck;
  els.deadendText.textContent = 'No moves left! 🙈';
  if (stuck) {
    els.deadendRescue.hidden = !canAddRescue(session) || !rescueWouldHelp(session);
  }
}

function invalidatePendingCheck() {
  cancelDeepDeadEndCheck?.();
  cancelDeepDeadEndCheck = null;
  clearTimeout(checkToastTimer);
  hideOverlay(els.checkToast);
}

function doCheckSolvable() {
  if (checkWin(session) || checkDeadEnd(session)) return; // nothing to check
  invalidatePendingCheck();

  els.btnCheckSolvable.disabled = true;
  els.checkToastText.textContent = 'Checking…';
  showOverlay(els.checkToast);

  const askedAbout = session.state;
  cancelDeepDeadEndCheck = checkSolvableInBackground(askedAbout, session.adjacency, (solvable) => {
    cancelDeepDeadEndCheck = null;
    if (session.state !== askedAbout) return; // superseded by a later move
    els.btnCheckSolvable.disabled = false;
    if (solvable) {
      els.checkToastText.textContent = 'Still winnable — keep going! 👍';
      clearTimeout(checkToastTimer);
      checkToastTimer = setTimeout(() => hideOverlay(els.checkToast), 2200);
    } else {
      hideOverlay(els.checkToast);
      els.deadendText.textContent = "This position can't be won anymore 💀";
      els.deadendBanner.hidden = false;
      els.deadendRescue.hidden = !canAddRescue(session) || !rescueWouldHelp(session);
    }
  });
}

function doUndo() {
  invalidatePendingCheck();
  session = undo(session);
  selection.clear();
  renderAll();
}

function doRestart() {
  invalidatePendingCheck();
  session = restart(level);
  selection.clear();
  renderAll();
}

function doRescue() {
  if (!canAddRescue(session)) return;
  invalidatePendingCheck();
  session = addRescue(session);
  selection.clear();
  renderAll();
}

function maybeShowIntroTooltip() {
  const hasSort = level.containers.some((c) => c.lock?.type === 'sort');
  const hasNeighbor = level.containers.some((c) => c.lock?.type === 'neighbor');
  if (hasSort && !hasSeenTooltip(storageData, 'lockA')) {
    showTooltip(
      'Concealed containers hide behind a themed cover badged with one emoji. Fully sort that emoji anywhere and the cover lifts!',
      'lockA'
    );
  } else if (hasNeighbor && !hasSeenTooltip(storageData, 'lockB')) {
    showTooltip(
      'Barrier-locked containers open the moment a neighboring container is fully sorted.',
      'lockB'
    );
  } else if (level.blind && !hasSeenTooltip(storageData, 'blind')) {
    showTooltip('Blind level: everything below the top emoji is hidden until you uncover it. Once seen, it stays revealed.', 'blind');
  }
}

let pendingTooltipKey = null;
function showTooltip(text, key) {
  pendingTooltipKey = key;
  els.tooltipText.textContent = text;
  els.tooltipBanner.hidden = false;
}
function dismissTooltip() {
  els.tooltipBanner.hidden = true;
  if (pendingTooltipKey) {
    markTooltipSeen(storageData, pendingTooltipKey);
    saveData(storageData);
    pendingTooltipKey = null;
  }
}

// ---------------- Results / completion ----------------

function onWin() {
  storageData = loadData();
  const result = recordResult(storageData, level, {
    moves: session.moveCount,
    assisted: session.assisted,
    usedUndo: session.usedUndo,
  });
  storageData = result;
  saveData(storageData);

  const isFinalLevel = level.index === manifest.levels.length;

  els.resultsMoves.textContent = `Solved in ${session.moveCount} moves.`;
  if (session.assisted) {
    els.resultsPar.textContent = `Par: ${level.par} · solved with rescue container ➕`;
  } else if (session.moveCount === level.par) {
    els.resultsPar.textContent = "🏆 That's the fewest moves possible!";
  } else {
    els.resultsPar.textContent = `Best possible: ${level.par}. Fancy another go?`;
  }
  if (level.blind) {
    els.resultsPar.textContent += ' (with X-ray vision 👓)';
  }

  els.resultsNext.hidden = isFinalLevel;
  els.resultsSelect.textContent = isFinalLevel ? '📋 Back to level select' : '📋 Level select';
  spawnConfetti(document.getElementById('results-confetti'), level.theme);
  showOverlay(els.overlayResults);

  if (isFinalLevel && !storageData.completionShown) {
    storageData.completionShown = true;
    saveData(storageData);
    setTimeout(() => {
      hideOverlay(els.overlayResults);
      showCompletionOverlay();
    }, 1600);
  }
}

function showCompletionOverlay() {
  if (!manifest) return;
  const stats = computeCareerStats(storageData, manifest);
  els.completionStats.innerHTML = `
    <span>Levels solved</span><span>${stats.solved}/${stats.total}</span>
    <span>Par hit</span><span>${stats.pars}/${stats.total} 🏆</span>
    <span>Themes completed</span><span>${stats.themesCompletedCount}/6</span>
    <span>Total moves</span><span>${stats.totalMoves}</span>
    <span>Rescue-free levels</span><span>${stats.rescueFree}</span>
  `;
  document.getElementById('completion-title').textContent = stats.perfectGame
    ? '🥇 Perfect game!'
    : '🎉 You sorted everything!';
  spawnConfetti(document.getElementById('completion-confetti'), 'mixed');
  showOverlay(els.overlayCompletion);
}

function spawnConfetti(container, theme) {
  container.innerHTML = '';
  const emojis =
    theme === 'mixed'
      ? Object.values(THEMES).map((t) => t.label)
      : THEMES[theme]?.emojiPool ?? ['🎉'];
  for (let i = 0; i < 24; i++) {
    const span = document.createElement('span');
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    span.style.left = `${Math.random() * 100}%`;
    span.style.animationDuration = `${1.2 + Math.random() * 1.2}s`;
    span.style.animationDelay = `${Math.random() * 0.4}s`;
    container.appendChild(span);
  }
}

function showOverlay(el) {
  el.hidden = false;
}
function hideOverlay(el) {
  el.hidden = true;
}

init();
