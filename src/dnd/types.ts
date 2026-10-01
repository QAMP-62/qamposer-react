import type { GateType } from '../types';

/** What is being dragged */
export type DragSource =
  | { kind: 'palette'; gateType: GateType }
  | {
      kind: 'circuit';
      gateId: string;
      gateType: GateType;
      /** Rows between the gate's top-most row and the row it was grabbed by (CNOT) */
      grabOffset: number;
    };

export interface DragPoint {
  x: number;
  y: number;
}

/**
 * Something gates can be dropped on (the circuit editor).
 * Coordinates are viewport (client) coordinates.
 */
export interface DropTarget {
  /** Update the drop preview. Returns false when the point is outside this target. */
  hover(source: DragSource, point: DragPoint): boolean;
  /** The pointer left this target, or the drag was cancelled */
  leave(): void;
  /** Commit the drop at this point */
  drop(source: DragSource, point: DragPoint): void;
}

export interface DragSession {
  source: DragSource;
  pointerType: string;
}
