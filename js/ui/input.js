// Tap-tap + keyboard selection state machine. Pure-ish: holds only the
// transient "what's currently selected" state; all game rules stay in the
// engine. The controller (app.js) wires this to actual pour calls.

export function createSelectionController({ canSelect, onAttemptMove, onInvalid, onSelectionChange }) {
  let selected = null;

  function select(index) {
    if (selected === null) {
      if (canSelect(index)) {
        selected = index;
        onSelectionChange?.(selected);
      }
      return;
    }
    if (selected === index) {
      selected = null;
      onSelectionChange?.(selected);
      return;
    }
    const from = selected;
    selected = null;
    // No onSelectionChange here: onAttemptMove/onInvalid already re-render
    // the board (with the selection now cleared), so a separate notification
    // would just be a redundant, animation-interrupting re-render.
    const ok = onAttemptMove(from, index);
    if (!ok) onInvalid(index);
  }

  function clear() {
    selected = null;
  }

  function getSelected() {
    return selected;
  }

  return { select, clear, getSelected };
}
