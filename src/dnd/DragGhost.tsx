import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GATE_COLORS } from '../components/gateColors';
import type { DragPoint, DragSession } from './types';
import './DragGhost.scss';

interface DragGhostProps {
  session: DragSession;
  subscribe: (listener: (point: DragPoint) => void) => () => void;
}

/**
 * Follows the pointer during a drag. Positioned through a ref (no re-render per
 * move). On touch it floats above the finger so the gate stays visible.
 */
export function DragGhost({ session, subscribe }: DragGhostProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(
    () =>
      subscribe(({ x, y }) => {
        if (ref.current) {
          ref.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      }),
    [subscribe]
  );

  const { gateType } = session.source;
  const isTouch = session.pointerType === 'touch';

  return createPortal(
    <div ref={ref} className="qamposer-drag-ghost" aria-hidden="true">
      <div
        className={`qamposer-drag-ghost__gate ${isTouch ? 'qamposer-drag-ghost__gate--touch' : ''}`}
        style={{ backgroundColor: GATE_COLORS[gateType] }}
      >
        {gateType === 'CNOT' ? '⊕' : gateType}
      </div>
    </div>,
    document.body
  );
}
