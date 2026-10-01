import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DragGhost } from './DragGhost';
import type { DragPoint, DragSession, DragSource, DropTarget } from './types';

/** Mouse / pen: distance the pointer must travel before a press becomes a drag */
export const MOUSE_ACTIVATION_DISTANCE = 4;
/** Touch: how long a finger must rest before a press becomes a drag */
export const TOUCH_ACTIVATION_DELAY = 250;
/** Touch: movement allowed during the delay; moving further scrolls instead */
export const TOUCH_ACTIVATION_TOLERANCE = 8;

const DRAGGING_CLASS = 'qamposer-dragging';

interface GateDragContextValue {
  /** The active drag, or null. Changes only when a drag starts or ends */
  session: DragSession | null;
  /** Call from a draggable element's pointerdown handler */
  beginDrag: (event: React.PointerEvent, source: DragSource) => void;
  /** Register a drop target; returns an unregister function */
  registerDropTarget: (target: DropTarget) => () => void;
  /** Subscribe to pointer positions during a drag (not re-rendering) */
  subscribe: (listener: (point: DragPoint) => void) => () => void;
}

const GateDragContext = createContext<GateDragContextValue | null>(null);

export function useGateDrag(): GateDragContextValue {
  const context = useContext(GateDragContext);
  if (!context) {
    throw new Error('useGateDrag must be used within a QamposerProvider');
  }
  return context;
}

/**
 * Pointer Events based drag and drop for gates (mouse, pen and touch).
 *
 * - Mouse / pen: a drag starts after moving a few pixels.
 * - Touch: a drag starts after a short long-press; moving sooner scrolls the page
 *   as usual. Once dragging, touchmove is cancelled so the page does not scroll.
 *
 * Pointer events are tracked on window, so drop targets hit-test by coordinates
 * rather than by the element under the pointer.
 */
export function GateDragProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DragSession | null>(null);
  const targetsRef = useRef(new Set<DropTarget>());
  const listenersRef = useRef(new Set<(point: DragPoint) => void>());
  const cleanupRef = useRef<(() => void) | null>(null);

  // End any drag in progress when the provider unmounts
  useEffect(() => () => cleanupRef.current?.(), []);

  const registerDropTarget = useCallback((target: DropTarget) => {
    targetsRef.current.add(target);
    return () => {
      targetsRef.current.delete(target);
    };
  }, []);

  const subscribe = useCallback((listener: (point: DragPoint) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const beginDrag = useCallback((event: React.PointerEvent, source: DragSource) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (cleanupRef.current) return; // one drag at a time

    const pointerId = event.pointerId;
    const pointerType = event.pointerType || 'mouse';
    const isTouch = pointerType === 'touch';
    const start: DragPoint = { x: event.clientX, y: event.clientY };
    let last = start;
    let active = false;
    let hovered: DropTarget | null = null;
    let raf: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const hover = () => {
      raf = null;
      let next: DropTarget | null = null;
      for (const target of targetsRef.current) {
        if (target.hover(source, last)) {
          next = target;
          break;
        }
      }
      if (hovered && hovered !== next) hovered.leave();
      hovered = next;
    };

    const moveTo = (point: DragPoint) => {
      last = point;
      listenersRef.current.forEach((listener) => listener(point));
      if (raf === null) raf = requestAnimationFrame(hover);
    };

    const activate = () => {
      timer = null;
      active = true;
      window.addEventListener('touchmove', preventDefault, { passive: false });
      document.body.classList.add(DRAGGING_CLASS);
      if (isTouch) {
        try {
          navigator.vibrate?.(10);
        } catch {
          // Haptics are optional
        }
      }
      setSession({ source, pointerType });
      moveTo(last);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const point = { x: e.clientX, y: e.clientY };
      if (!active) {
        const distance = Math.hypot(point.x - start.x, point.y - start.y);
        if (isTouch) {
          // Moved before the long-press completed: let the browser scroll
          if (distance > TOUCH_ACTIVATION_TOLERANCE) cleanup();
          return;
        }
        if (distance < MOUSE_ACTIVATION_DISTANCE) return;
        last = point;
        activate();
        return;
      }
      moveTo(point);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (active) {
        const point = { x: e.clientX, y: e.clientY };
        last = point;
        if (raf !== null) cancelAnimationFrame(raf);
        hover();
        hovered?.drop(source, point);
        hovered = null;
        suppressNextClick();
      }
      cleanup();
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      cleanup();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !active) return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    };

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      if (raf !== null) cancelAnimationFrame(raf);
      hovered?.leave();
      hovered = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', preventDefault);
      window.removeEventListener('touchmove', preventDefault);
      document.body.classList.remove(DRAGGING_CLASS);
      if (active) setSession(null);
      active = false;
      cleanupRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown, true);
    if (isTouch) {
      // Suppress the long-press context menu / callout
      window.addEventListener('contextmenu', preventDefault);
      timer = setTimeout(activate, TOUCH_ACTIVATION_DELAY);
    }
    cleanupRef.current = cleanup;
  }, []);

  const value = useMemo(
    () => ({ session, beginDrag, registerDropTarget, subscribe }),
    [session, beginDrag, registerDropTarget, subscribe]
  );

  return (
    <GateDragContext.Provider value={value}>
      {children}
      {session && <DragGhost session={session} subscribe={subscribe} />}
    </GateDragContext.Provider>
  );
}

function preventDefault(event: Event) {
  event.preventDefault();
}

/** Swallow the click the browser fires after a drag ends */
function suppressNextClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}
