import { useState, useEffect, useRef, useCallback } from 'react';
import { POINTER_MOVE_THRESHOLD } from '../keyboard/constants';
import type { InputSource } from '../keyboard/types';

/**
 * Layer A: Tracks which input device is currently "leading" the UI.
 * This only affects visual presentation (cursor frame vs hover highlight).
 *
 * Returns 'focused' when the container has focus via pointer (show cursor frame
 * but don't yet switch to full keyboard mode), 'keyboard' when keyboard is
 * actively used, and 'pointer' when unfocused or hovering.
 */
export function useInputSource(
  containerRef: React.RefObject<HTMLDivElement | null>
): InputSource {
  const [inputSource, setInputSource] = useState<InputSource>('pointer');
  const lastPointerPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback(() => {
    setInputSource('pointer');
    lastPointerPos.current = null;
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const last = lastPointerPos.current;
    if (!last) {
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    if (dx * dx + dy * dy >= POINTER_MOVE_THRESHOLD * POINTER_MOVE_THRESHOLD) {
      setInputSource('pointer');
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setInputSource('pointer');
      return;
    }
    setInputSource('keyboard');
    lastPointerPos.current = null;
  }, []);

  // Reset to pointer when container loses focus
  const handleBlur = useCallback(() => {
    setInputSource('pointer');
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('blur', handleBlur);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('blur', handleBlur);
    };
  }, [containerRef, handlePointerDown, handlePointerMove, handleKeyDown, handleBlur]);

  return inputSource;
}
