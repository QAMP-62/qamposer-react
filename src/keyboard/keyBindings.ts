import { NUMBER_KEY_GATES } from './constants';
import type { InteractionAction } from './types';

/**
 * Maps a KeyboardEvent to a device-agnostic InteractionAction.
 * Returns null if the key is not bound.
 */
export function keyToAction(event: KeyboardEvent): InteractionAction | null {
  const ctrl = event.ctrlKey || event.metaKey;

  // Undo/Redo (always available)
  if (ctrl && !event.shiftKey && event.key === 'z') return { type: 'UNDO' };
  if (ctrl && event.key === 'y') return { type: 'REDO' };
  if (ctrl && event.shiftKey && event.key === 'Z') return { type: 'REDO' };

  // Don't process other keys if ctrl/meta is held
  if (ctrl) return null;

  switch (event.key) {
    // Movement
    case 'ArrowUp':
    case 'w':
    case 'W':
      return { type: 'MOVE_CURSOR', dRow: -1, dCol: 0 };
    case 'ArrowDown':
    case 's':
    case 'S':
      return { type: 'MOVE_CURSOR', dRow: 1, dCol: 0 };
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return { type: 'MOVE_CURSOR', dRow: 0, dCol: -1 };
    case 'ArrowRight':
    case 'd':
    case 'D':
      return { type: 'MOVE_CURSOR', dRow: 0, dCol: 1 };

    // Cell operations
    case ' ':
      return { type: 'ACTIVATE_CELL' };
    case 'Delete':
    case 'Backspace':
      return { type: 'DELETE_AT' };
    case 'Escape':
      return { type: 'CANCEL' };

    // Gate cycling
    case 'q':
    case 'Q':
      return { type: 'CYCLE_GATE', direction: -1 };
    case 'e':
    case 'E':
      return { type: 'CYCLE_GATE', direction: 1 };
  }

  // Number keys for gate selection
  const gateType = NUMBER_KEY_GATES[event.key];
  if (gateType) {
    return { type: 'SELECT_GATE', gateType };
  }

  return null;
}

/**
 * Returns true if the action should use key repeat acceleration.
 */
export function isRepeatableAction(action: InteractionAction): boolean {
  return action.type === 'MOVE_CURSOR';
}
