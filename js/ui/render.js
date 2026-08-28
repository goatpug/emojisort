// DOM rendering for the board, level select grid, and small visual effects.
// Takes plain view-model data (from js/engine/session.js's viewOf) and
// produces/updates DOM — no game rules live here.

function groupByRowBreaks(count, rowBreaks) {
  const breaks = new Set(rowBreaks || []);
  const groups = [];
  let current = [];
  for (let i = 0; i < count; i++) {
    if (breaks.has(i) && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(i);
  }
  if (current.length) groups.push(current);
  return groups;
}

function ariaLabelFor(view, index, themeName) {
  const c = view[index];
  const noun = c.rescue ? 'Rescue container' : `${themeName} container ${index + 1}`;
  if (c.locked) {
    return `${noun}: locked`;
  }
  if (!c.tokens.length) return `${noun}: empty`;
  const contents = c.tokens.map((t) => (t.hidden ? 'hidden' : t.emoji)).join(', ');
  const top = c.tokens[c.tokens.length - 1];
  const topDesc = top.hidden ? 'hidden' : top.emoji;
  const run = c.topRun;
  const topPhrase = run && !top.hidden ? `top: ${topDesc} ×${run.count}` : `top: ${topDesc}`;
  return `${noun}: ${contents} — ${topPhrase}`;
}

/**
 * Render the full board.
 * @param {HTMLElement} boardEl
 * @param {ReturnType<import('../engine/session.js').viewOf>} view
 * @param {Object} level
 * @param {Object} themeMeta
 * @param {Object} opts
 * @param {number|null} opts.selectedIndex
 * @param {number|null} opts.invalidIndex
 * @param {Set<number>} opts.openingIndices  containers whose lock should render mid-reveal-animation
 * @param {(index:number)=>void} opts.onSelect
 */
export function renderBoard(boardEl, view, level, themeMeta, opts) {
  const { selectedIndex, invalidIndex, openingIndices, onSelect } = opts;
  boardEl.className = `board orient-${level.orientation}`;
  boardEl.innerHTML = '';

  const groups = groupByRowBreaks(view.length, level.rowBreaks);
  const groupTag = level.orientation === 'vertical' ? 'row' : 'column';

  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = groupTag;
    for (const index of group) {
      groupEl.appendChild(renderContainer(view, index, level, themeMeta, { selectedIndex, invalidIndex, openingIndices, onSelect }));
    }
    boardEl.appendChild(groupEl);
  }
}

function renderContainer(view, index, level, themeMeta, opts) {
  const c = view[index];
  const el = document.createElement('div');
  el.className = `container ${level.orientation === 'vertical' ? 'vertical' : 'horizontal'}`;
  el.style.setProperty('--capacity', c.capacity);
  el.dataset.index = String(index);
  el.tabIndex = 0;
  el.setAttribute('role', 'listitem');
  el.setAttribute('aria-label', ariaLabelFor(view, index, themeMeta.name));

  if (index === opts.selectedIndex) el.classList.add('selected');
  if (index === opts.invalidIndex) el.classList.add('invalid-target');
  // The rescue tube is scratch space, not a themed collection to sort — a
  // checkmark there reads as "sort the rescue tube too," which isn't the
  // point. Suppress the complete badge for it even though it still has to
  // end up empty-or-matching to win.
  if (c.complete && !c.rescue) el.classList.add('complete');
  if (c.rescue) el.classList.add('rescue');

  const showLocked = c.locked || opts.openingIndices.has(index);

  if (showLocked) {
    if (c.lock?.type === 'sort' || (opts.openingIndices.has(index) && lockTypeAt(level, index) === 'sort')) {
      const requires = c.lock?.requires ?? lockRequiresAt(level, index);
      const cover = document.createElement('div');
      cover.className = 'lock-cover';
      cover.innerHTML = `<span class="lock-badge">${requires}</span>`;
      if (opts.openingIndices.has(index) && !c.locked) {
        requestAnimationFrame(() => cover.classList.add('opening'));
        cover.appendChild(makeConfetti(themeMeta.label));
      }
      el.appendChild(cover);
    } else {
      const barrier = document.createElement('div');
      barrier.className = 'lock-barrier';
      barrier.innerHTML = `<span class="lock-affordance">↔</span>`;
      if (opts.openingIndices.has(index) && !c.locked) {
        requestAnimationFrame(() => barrier.classList.add('opening'));
      }
      el.appendChild(barrier);
    }
  }

  // Slots always render at full capacity — even while locked — so the cover/
  // barrier overlay spans the container's true length instead of collapsing
  // it down to nothing (a locked container has no visible tokens, but it
  // still occupies its full concealed length).
  for (let i = 0; i < c.capacity; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (!c.locked && i < c.tokens.length) {
      const t = c.tokens[i];
      const span = document.createElement('span');
      span.className = 'token' + (t.hidden ? ' hidden-token' : '');
      span.textContent = t.hidden ? '❓' : t.emoji;
      slot.appendChild(span);
    }
    el.appendChild(slot);
  }

  el.addEventListener('click', () => opts.onSelect(index));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      opts.onSelect(index);
    }
  });

  return el;
}

function lockTypeAt(level, index) {
  return level.containers[index]?.lock?.type;
}
function lockRequiresAt(level, index) {
  return level.containers[index]?.lock?.requires;
}

function makeConfetti(emoji) {
  const wrap = document.createElement('div');
  wrap.className = 'lock-confetti';
  for (let i = 0; i < 8; i++) {
    const span = document.createElement('span');
    span.textContent = emoji;
    const angle = (i / 8) * Math.PI * 2;
    span.style.setProperty('--dx', `${Math.cos(angle) * 40}px`);
    span.style.setProperty('--dy', `${Math.sin(angle) * 40}px`);
    wrap.appendChild(span);
  }
  setTimeout(() => wrap.remove(), 700);
  return wrap;
}

/** Animate one or more emoji floating from a source rect to a destination rect. */
export function floatTokens(sourceRect, destRect, emoji, count) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.body;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'floating-token';
    el.textContent = emoji;
    el.style.left = `${sourceRect.left}px`;
    el.style.top = `${sourceRect.top}px`;
    layer.appendChild(el);
    const midX = (sourceRect.left + destRect.left) / 2;
    const midY = Math.min(sourceRect.top, destRect.top) - 40;
    const anim = el.animate(
      reduceMotion
        ? [{ left: `${sourceRect.left}px`, top: `${sourceRect.top}px` }, { left: `${destRect.left}px`, top: `${destRect.top}px` }]
        : [
            { left: `${sourceRect.left}px`, top: `${sourceRect.top}px`, offset: 0 },
            { left: `${midX}px`, top: `${midY}px`, offset: 0.5 },
            { left: `${destRect.left}px`, top: `${destRect.top}px`, offset: 1 },
          ],
      { duration: reduceMotion ? 120 : 250 + i * 20, easing: 'ease-in-out' }
    );
    anim.onfinish = () => el.remove();
  }
}

export function renderLevelGrid(gridEl, manifest, storageData, { onSelect }) {
  gridEl.innerHTML = '';
  for (const entry of manifest.levels) {
    const unlocked = entry.index <= storageData.furthestUnlocked;
    const rec = storageData.levels[entry.id];
    const tile = document.createElement('button');
    tile.className = 'level-tile' + (unlocked ? '' : ' locked');
    tile.setAttribute('role', 'listitem');
    tile.disabled = !unlocked;
    tile.setAttribute('aria-label', `Level ${entry.index}: ${entry.theme}${rec?.solved ? ', solved' : ''}${rec?.gotPar ? ', par achieved' : ''}`);

    const badges = document.createElement('div');
    badges.className = 'badges';
    if (rec?.gotPar) badges.innerHTML += '🏆';
    else if (rec?.solved) badges.innerHTML += '⭐';
    tile.appendChild(badges);

    if (entry.blind) {
      const blindBadge = document.createElement('div');
      blindBadge.className = 'blind-badge';
      blindBadge.textContent = '🕶️';
      tile.appendChild(blindBadge);
    }

    const label = document.createElement('div');
    label.textContent = unlocked ? entry.emojiLabel || '🎮' : '🔒';
    tile.appendChild(label);

    const index = document.createElement('div');
    index.className = 'index';
    index.textContent = String(entry.index);
    tile.appendChild(index);

    if (unlocked) tile.addEventListener('click', () => onSelect(entry));
    gridEl.appendChild(tile);
  }
}
