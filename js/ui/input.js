// Tap-tap + keyboard selection state machine. Pure-ish: holds only the
// transient "what's currently selected" state; all game rules stay in the
// engine. The controller (app.js) wires this to actual pour calls.

export function createSelectionController({ canSelect, onAttemptMove, onInvalid }) {
  let selected = null;

  function select(index) {
    if (selected === null) {
      if (canSelect(index)) selected = index;
      return;
    }
    if (selected === index) {
      selected = null;
      return;
    }
    const from = selected;
    selected = null;
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
