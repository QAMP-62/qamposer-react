import { useEffect, useRef } from 'react';
import { KEY_REPEAT } from '../keyboard/constants';
import { keyToAction, isRepeatableAction } from '../keyboard/keyBindings';
import type { InteractionAction } from '../keyboard/types';

/**
 * Custom key repeat with acceleration.
 * Suppresses browser autorepeat and manages its own timer chain:
 *   immediate -> 300ms delay -> 80ms repeat -> (after 5 repeats) -> 40ms repeat
 *
 * Only MOVE_CURSOR actions use repeat. Other actions fire once on keydown.
 */
export function useKeyRepeat(
  onAction: (action: InteractionAction) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean = true
) {
  const onActionRef = useRef(onAction);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let repeatCount = 0;
    let activeKey: string | null = null;

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      repeatCount = 0;
      activeKey = null;
    }

    function scheduleRepeat(action: InteractionAction) {
      repeatCount++;
      const interval =
        repeatCount >= KEY_REPEAT.FAST_THRESHOLD
          ? KEY_REPEAT.FAST_INTERVAL
          : KEY_REPEAT.NORMAL_INTERVAL;

      timer = setTimeout(() => {
        onActionRef.current(action);
        scheduleRepeat(action);
      }, interval);
    }

    function handleKeyDown(e: KeyboardEvent) {
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

      e.preventDefault();
      onActionRef.current(action);

      if (isRepeatableAction(action)) {
        clearTimer();
        activeKey = e.key;
        timer = setTimeout(() => {
          onActionRef.current(action);
          scheduleRepeat(action);
        }, KEY_REPEAT.INITIAL_DELAY);
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (activeKey === e.key) {
        clearTimer();
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('keyup', handleKeyUp);
    container.addEventListener('blur', clearTimer);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('blur', clearTimer);
      clearTimer();
    };
  }, [containerRef, enabled]);
}
