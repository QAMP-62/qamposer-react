import { useEffect, useRef, useCallback } from 'react';
import { KEY_REPEAT } from '../keyboard/constants';
import { keyToAction, isRepeatableAction } from '../keyboard/keyBindings';
import type { InteractionAction } from '../keyboard/types';

/**
 * Custom key repeat with acceleration.
 * Suppresses browser autorepeat and manages its own timer chain:
 *   immediate → 300ms delay → 80ms repeat → (after 5 repeats) → 40ms repeat
 *
 * Only MOVE_CURSOR actions use repeat. Other actions fire once on keydown.
 */
export function useKeyRepeat(
  onAction: (action: InteractionAction) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean = true
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatCountRef = useRef(0);
  const activeKeyRef = useRef<string | null>(null);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    repeatCountRef.current = 0;
    activeKeyRef.current = null;
  }, []);

  const scheduleRepeat = useCallback((action: InteractionAction) => {
    repeatCountRef.current++;
    const interval =
      repeatCountRef.current >= KEY_REPEAT.FAST_THRESHOLD
        ? KEY_REPEAT.FAST_INTERVAL
        : KEY_REPEAT.NORMAL_INTERVAL;

    timerRef.current = setTimeout(() => {
      onActionRef.current(action);
      scheduleRepeat(action);
    }, interval);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is on an input element
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Suppress browser autorepeat
      if (e.repeat) {
        const action = keyToAction(e);
        if (action && isRepeatableAction(action)) {
          e.preventDefault();
        }
        return;
      }

      const action = keyToAction(e);
      if (!action) return;

      // Prevent default browser behavior for bound keys
      e.preventDefault();

      // Fire immediately
      onActionRef.current(action);

      // Set up repeat timer for movement actions only
      if (isRepeatableAction(action)) {
        clearTimer();
        activeKeyRef.current = e.key;
        timerRef.current = setTimeout(() => {
          onActionRef.current(action);
          scheduleRepeat(action);
        }, KEY_REPEAT.INITIAL_DELAY);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (activeKeyRef.current === e.key) {
        clearTimer();
      }
    };

    // Handle losing focus (e.g., switching tabs)
    const handleBlur = () => {
      clearTimer();
    };

    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('keyup', handleKeyUp);
    container.addEventListener('blur', handleBlur);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('blur', handleBlur);
      clearTimer();
    };
  }, [containerRef, enabled, clearTimer, scheduleRepeat]);
}
