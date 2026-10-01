import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import { useCircuitKeyboard } from '../../hooks/useCircuitKeyboard';
import { useGateDrag } from '../../dnd/GateDragContext';
import * as ops from '../../circuit/operations';
import { CursorOverlay } from '../CursorOverlay';
import { StatusBar } from '../StatusBar';
import { GATE_COLORS } from '../gateColors';
import type { CellPosition, Circuit, Gate, GatePlacement, GateType } from '../../types';
import type { DragPoint, DragSource } from '../../dnd/types';
import './CircuitEditor.scss';

const QUBIT_HEIGHT = 80;
const MIN_POSITIONS = 20;
const COLUMN_GAP = 20;
const MIN_LEFT_MARGIN = 16;
/** Distance from the scroll container's edge that starts auto-scrolling (px) */
const AUTO_SCROLL_EDGE = 40;
/** Auto-scroll speed while dragging near an edge (px per frame) */
const AUTO_SCROLL_SPEED = 10;
const ROTATION_GATES: GateType[] = ['RX', 'RY', 'RZ'];
/** Id of the not-yet-created gate in an insert preview */
const PREVIEW_GATE_ID = '__preview__';

/** What dropping at the hovered cell would do */
type PendingDrop =
  | { kind: 'insert'; placement: GatePlacement; column: number }
  | { kind: 'move'; gateId: string; to: CellPosition };

interface DropPreview {
  /** Hovered cell, used to skip recomputing while the pointer stays in it */
  key: string;
  kind: PendingDrop['kind'];
  /** The circuit's gates as they would be after the drop */
  gates: Gate[];
  /** The inserted or moved gate */
  activeId: string;
  /** Gates pushed or compacted by the drop */
  displacedIds: string[];
}

type GateVariant = 'normal' | 'insert' | 'move' | 'shifted' | 'dragging';

const VARIANT_CLASS: Record<'gate' | 'cnot', Record<Exclude<GateVariant, 'normal'>, string>> = {
  gate: {
    insert: 'circuit-editor__gate--preview',
    move: 'circuit-editor__gate--moving',
    shifted: 'circuit-editor__gate--shifted-preview',
    dragging: 'circuit-editor__gate--dragging',
  },
  cnot: {
    insert: 'circuit-editor__cnot--preview',
    move: 'circuit-editor__cnot--moving',
    shifted: 'circuit-editor__cnot--shifted-preview',
    dragging: 'circuit-editor__cnot--dragging',
  },
};

/** Run the pending drop against the circuit without committing it */
function computePreview(key: string, circuit: Circuit, drop: PendingDrop): DropPreview {
  if (drop.kind === 'insert') {
    const result = ops.insertGate(circuit, drop.placement, drop.column, PREVIEW_GATE_ID);
    return {
      key,
      kind: 'insert',
      gates: result.circuit.gates,
      activeId: PREVIEW_GATE_ID,
      displacedIds: result.displaced.map((d) => d.id),
    };
  }
  // A move that changes nothing previews the gate where it already is
  const result = ops.moveGate(circuit, drop.gateId, drop.to);
  return {
    key,
    kind: 'move',
    gates: result ? result.circuit.gates : circuit.gates,
    activeId: drop.gateId,
    displacedIds: result ? result.displaced.map((d) => d.id) : [],
  };
}

export interface CircuitEditorProps {
  /** Additional CSS class */
  className?: string;
}

export function CircuitEditor({ className = '' }: CircuitEditorProps = {}) {
  const {
    circuit,
    insertGate,
    moveGate,
    removeGate,
    addQubit,
    removeQubit,
    setEditingGate,
    config,
  } = useQamposer();
  const { session, beginDrag, registerDropTarget } = useGateDrag();

  const { qubits, gates } = circuit;

  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [selectedQubitIndex, setSelectedQubitIndex] = useState<number | null>(null);
  // Circuit as it would look after the pending drop (drag in progress over the circuit)
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gatesLayerRef = useRef<HTMLDivElement>(null);

  // Dynamic number of columns: at least MIN_POSITIONS, or enough for all gates + 2 extra
  const maxGatePos = gates.length > 0 ? Math.max(...gates.map((g) => g.position)) : 0;
  const numPositions = Math.max(MIN_POSITIONS, maxGatePos + 3);

  // Calculate column widths based on gate content
  const columnWidths = useMemo(() => {
    const widths: Record<number, number> = {};

    for (let pos = 0; pos < numPositions; pos++) {
      let maxWidth = 32;

      gates.forEach((g) => {
        if (g.position === pos) {
          if (['RX', 'RY', 'RZ'].includes(g.type) && g.parameter !== undefined) {
            const parameterLabel = `(${(g.parameter / Math.PI).toFixed(2)}π)`;
            const gateTypeWidth = 32;
            const paramWidth = parameterLabel.length * 6;
            const padding = 16;
            const estimatedWidth = Math.max(gateTypeWidth, paramWidth) + padding;
            maxWidth = Math.max(maxWidth, estimatedWidth);
          } else if (g.type !== 'CNOT') {
            maxWidth = Math.max(maxWidth, 32);
          }
        }
      });

      widths[pos] = maxWidth;
    }

    return widths;
  }, [gates, numPositions]);

  // Calculate left X positions for each column
  const columnLeftXs = useMemo(() => {
    const leftXs: Record<number, number> = {};

    for (let pos = 0; pos < numPositions; pos++) {
      if (pos === 0) {
        leftXs[pos] = MIN_LEFT_MARGIN;
      } else {
        const prevLeftX = leftXs[pos - 1];
        const prevWidth = columnWidths[pos - 1];
        const prevRightEdge = prevLeftX + prevWidth;
        leftXs[pos] = prevRightEdge + COLUMN_GAP;
      }
    }

    return leftXs;
  }, [columnWidths, numPositions]);

  // Calculate center X positions for each column
  const columnCenterXs = useMemo(() => {
    const centerXs: Record<number, number> = {};

    for (let pos = 0; pos < numPositions; pos++) {
      centerXs[pos] = columnLeftXs[pos] + columnWidths[pos] / 2;
    }

    return centerXs;
  }, [columnLeftXs, columnWidths, numPositions]);

  // Keyboard navigation
  const { cursor, interactionState, inputSource } = useCircuitKeyboard({
    containerRef: scrollContainerRef,
    numPositions,
    columnLeftXs,
    columnWidths,
  });

  // Clear gate selection when keyboard becomes active
  useEffect(() => {
    if (inputSource === 'keyboard') {
      setSelectedGateId(null);
      setSelectedQubitIndex(null);
    }
  }, [inputSource]);

  // === Pointer drag and drop (mouse, pen and touch) ===

  /** Map a viewport point to a grid cell, or null when outside the visible circuit */
  const cellAt = useCallback(
    (point: DragPoint): CellPosition | null => {
      const container = scrollContainerRef.current;
      const layer = gatesLayerRef.current;
      if (!container || !layer) return null;

      const visible = container.getBoundingClientRect();
      if (
        point.x < visible.left ||
        point.x > visible.right ||
        point.y < visible.top ||
        point.y > visible.bottom
      ) {
        return null;
      }

      // The gates layer scrolls with the content, so its rect already includes scrollLeft
      const origin = layer.getBoundingClientRect();
      const row = Math.floor((point.y - origin.top) / QUBIT_HEIGHT);
      if (row < 0 || row >= qubits) return null;

      const x = point.x - origin.left;
      let column = 0;
      let minDistance = Infinity;
      for (let pos = 0; pos < numPositions; pos++) {
        const distance = Math.abs(columnCenterXs[pos] - x);
        if (distance < minDistance) {
          minDistance = distance;
          column = pos;
        }
      }
      return { row, column };
    },
    [qubits, numPositions, columnCenterXs]
  );

  /** What dropping `source` on `cell` would do */
  const resolveDrop = useCallback(
    (source: DragSource, cell: CellPosition): PendingDrop | null => {
      if (source.kind === 'circuit') {
        return {
          kind: 'move',
          gateId: source.gateId,
          to: { row: cell.row - source.grabOffset, column: cell.column },
        };
      }
      if (source.gateType === 'CNOT') {
        if (qubits < 2) return null;
        const control = Math.min(cell.row, qubits - 2);
        return {
          kind: 'insert',
          placement: { type: 'CNOT', control, target: control + 1 },
          column: cell.column,
        };
      }
      return {
        kind: 'insert',
        placement: {
          type: source.gateType,
          qubit: cell.row,
          ...(ROTATION_GATES.includes(source.gateType) ? { parameter: Math.PI / 2 } : {}),
        },
        column: cell.column,
      };
    },
    [qubits]
  );

  // Drop target callbacks are registered once and read the latest values from here
  const dropStateRef = useRef({ cellAt, resolveDrop, circuit, insertGate, moveGate });
  useEffect(() => {
    dropStateRef.current = { cellAt, resolveDrop, circuit, insertGate, moveGate };
  });

  useEffect(() => {
    let scrollRaf: number | null = null;
    let scrollVelocity = 0;
    let lastHover: { source: DragSource; point: DragPoint } | null = null;

    const stopAutoScroll = () => {
      if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
      scrollVelocity = 0;
    };

    // Scroll horizontally while the pointer rests near the left/right edge
    const updateAutoScroll = (point: DragPoint) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      scrollVelocity =
        point.x < rect.left + AUTO_SCROLL_EDGE
          ? -AUTO_SCROLL_SPEED
          : point.x > rect.right - AUTO_SCROLL_EDGE
            ? AUTO_SCROLL_SPEED
            : 0;
      if (scrollVelocity === 0) {
        stopAutoScroll();
      } else if (scrollRaf === null) {
        const step = () => {
          container.scrollLeft += scrollVelocity;
          if (lastHover) updatePreview(lastHover.source, lastHover.point);
          scrollRaf = scrollVelocity === 0 ? null : requestAnimationFrame(step);
        };
        scrollRaf = requestAnimationFrame(step);
      }
    };

    const updatePreview = (source: DragSource, point: DragPoint): boolean => {
      const { cellAt, resolveDrop, circuit } = dropStateRef.current;
      const cell = cellAt(point);
      const drop = cell && resolveDrop(source, cell);
      if (!cell || !drop) {
        setPreview(null);
        return false;
      }
      const key = `${cell.row}:${cell.column}`;
      // Stability check: only recompute when the target cell changes
      setPreview((prev) => (prev?.key === key ? prev : computePreview(key, circuit, drop)));
      return true;
    };

    return registerDropTarget({
      hover(source, point) {
        lastHover = { source, point };
        const inside = updatePreview(source, point);
        if (inside) updateAutoScroll(point);
        else stopAutoScroll();
        return inside;
      },
      leave() {
        lastHover = null;
        stopAutoScroll();
        setPreview(null);
      },
      drop(source, point) {
        lastHover = null;
        stopAutoScroll();
        setPreview(null);
        const { cellAt, resolveDrop, insertGate, moveGate } = dropStateRef.current;
        const cell = cellAt(point);
        const drop = cell && resolveDrop(source, cell);
        if (!drop) return;
        if (drop.kind === 'insert') {
          insertGate(drop.placement, drop.column, { origin: 'pointer' });
        } else {
          moveGate(drop.gateId, drop.to, { origin: 'pointer' });
        }
      },
    });
  }, [registerDropTarget]);

  // Hide selection toolbars while dragging
  useEffect(() => {
    if (session) {
      setSelectedGateId(null);
      setSelectedQubitIndex(null);
    }
  }, [session]);

  const handleGatePointerDown = (event: React.PointerEvent, gate: Gate) => {
    let grabOffset = 0;
    if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
      // Keep the CNOT's rows relative to the row it was grabbed by
      const top = Math.min(gate.control, gate.target);
      const bottom = Math.max(gate.control, gate.target);
      const layer = gatesLayerRef.current;
      if (layer) {
        const row = Math.floor((event.clientY - layer.getBoundingClientRect().top) / QUBIT_HEIGHT);
        grabOffset = Math.min(Math.max(row, top), bottom) - top;
      }
    }
    beginDrag(event, { kind: 'circuit', gateId: gate.id, gateType: gate.type, grabOffset });
  };

  const handleGateClick = (gateId: string) => {
    setSelectedGateId(selectedGateId === gateId ? null : gateId);
    setSelectedQubitIndex(null);
  };

  const handleGateDelete = (gateId: string) => {
    removeGate(gateId, { origin: 'pointer' });
    setSelectedGateId(null);
  };

  const handleGateEdit = (gate: Gate) => {
    setEditingGate(gate);
    setSelectedGateId(null);
  };

  const handleQubitClick = (qubitIndex: number) => {
    setSelectedQubitIndex(selectedQubitIndex === qubitIndex ? null : qubitIndex);
    setSelectedGateId(null);
  };

  const handleQubitAdd = () => {
    addQubit({ origin: 'pointer' });
    setSelectedQubitIndex(null);
  };

  const handleQubitRemove = () => {
    if (selectedQubitIndex === null) return;
    removeQubit(selectedQubitIndex, { origin: 'pointer' });
    setSelectedQubitIndex(null);
  };

  // Moving a gate with the keyboard previews the drop at the cursor
  const keyboardPreview = useMemo(() => {
    if (interactionState.type !== 'moving') return null;
    return computePreview(`keyboard:${cursor.row}:${cursor.col}`, circuit, {
      kind: 'move',
      gateId: interactionState.gateId,
      to: { row: cursor.row - interactionState.grabOffset, column: cursor.col },
    });
  }, [interactionState, cursor, circuit]);

  // While dragging over the circuit, show the circuit as it would look after the drop
  const activePreview = preview ?? keyboardPreview;
  const displayGates = activePreview ? activePreview.gates : gates;
  const draggedGateId = session?.source.kind === 'circuit' ? session.source.gateId : null;

  const gateVariant = (gate: Gate): GateVariant => {
    if (activePreview?.activeId === gate.id) {
      return activePreview.kind === 'insert' ? 'insert' : 'move';
    }
    if (activePreview?.displacedIds.includes(gate.id)) return 'shifted';
    if (gate.id === draggedGateId) return 'dragging';
    return 'normal';
  };

  const renderGate = (gate: Gate) => {
    const variant = gateVariant(gate);
    const isSelected = selectedGateId === gate.id;
    const interactive = variant === 'normal';
    const handlers = interactive
      ? {
          onClick: () => handleGateClick(gate.id),
          onPointerDown: (event: React.PointerEvent) => handleGatePointerDown(event, gate),
        }
      : {};

    if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
      const top = Math.min(gate.control, gate.target) * QUBIT_HEIGHT + QUBIT_HEIGHT / 2;
      const height = Math.abs(gate.target - gate.control) * QUBIT_HEIGHT;

      return (
        <div
          key={gate.id}
          className={[
            'circuit-editor__cnot',
            isSelected && 'circuit-editor__cnot--selected',
            variant !== 'normal' && VARIANT_CLASS.cnot[variant],
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            left: `${columnCenterXs[gate.position]}px`,
            top: `${top}px`,
            height: `${height}px`,
          }}
          {...handlers}
        >
          <div className="circuit-editor__cnot-line" />
          <div
            className="circuit-editor__cnot-control"
            style={{ top: gate.control < gate.target ? '0' : '100%' }}
          />
          <div
            className="circuit-editor__cnot-target"
            style={{ top: gate.target < gate.control ? '0' : '100%' }}
          />
        </div>
      );
    }

    if (gate.qubit === undefined) return null;

    const isRotationGate = ROTATION_GATES.includes(gate.type);
    const parameterLabel =
      gate.parameter !== undefined ? `(${(gate.parameter / Math.PI).toFixed(2)}π)` : '';

    return (
      <div
        key={gate.id}
        className={[
          'circuit-editor__gate',
          isSelected && 'circuit-editor__gate--selected',
          isRotationGate && 'circuit-editor__gate--rotation',
          variant !== 'normal' && VARIANT_CLASS.gate[variant],
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          left: `${columnCenterXs[gate.position]}px`,
          top: `${gate.qubit * QUBIT_HEIGHT + QUBIT_HEIGHT / 2}px`,
          backgroundColor: GATE_COLORS[gate.type],
        }}
        {...handlers}
      >
        <span className="circuit-editor__gate-label">
          {gate.type}
          {isRotationGate && gate.parameter !== undefined && (
            <span className="circuit-editor__gate-param">{parameterLabel}</span>
          )}
        </span>
      </div>
    );
  };

  const selectedGate = selectedGateId ? gates.find((g) => g.id === selectedGateId) : null;

  // Calculate the required width for all gates
  // Always include space for one more column after the last gate to prevent edge oscillation
  const nextPos = maxGatePos + 1;
  const nextColumnRightEdge = columnLeftXs[nextPos] + columnWidths[nextPos] + COLUMN_GAP;
  const minCircuitWidth = Math.max(nextColumnRightEdge, 400);

  return (
    <div className={`circuit-editor ${className}`.trim()}>
      <div className="circuit-editor__canvas">
        {/* Fixed qubit labels - outside scroll area */}
        <div className="circuit-editor__labels">
          {Array.from({ length: qubits }).map((_, qubitIndex) => (
            <div
              key={qubitIndex}
              className={`circuit-editor__lane-label ${
                selectedQubitIndex === qubitIndex ? 'circuit-editor__lane-label--selected' : ''
              }`}
              onClick={() => handleQubitClick(qubitIndex)}
            >
              q[{qubitIndex}]
            </div>
          ))}
          <div className="circuit-editor__lane-label circuit-editor__lane-label--classical">
            c{qubits}
          </div>
        </div>

        {/* Scrollable circuit area */}
        <div className="circuit-editor__scroll-container" ref={scrollContainerRef} tabIndex={0}>
          <div
            className="circuit-editor__circuit-area"
            style={{ minWidth: `${minCircuitWidth}px` }}
          >
            {/* Qubit lanes */}
            <div className="circuit-editor__lanes">
              {Array.from({ length: qubits }).map((_, qubitIndex) => (
                <div key={qubitIndex} className="circuit-editor__lane">
                  <div className="circuit-editor__lane-line" />
                </div>
              ))}

              {/* Classical register lane */}
              <div className="circuit-editor__lane circuit-editor__lane--classical">
                <div className="circuit-editor__lane-line circuit-editor__lane-line--classical" />
              </div>
            </div>

            {/* Gates (or the drop preview while dragging) */}
            <div className="circuit-editor__gates" ref={gatesLayerRef}>
              {displayGates.map(renderGate)}
            </div>

            {/* Keyboard cursor overlay */}
            <CursorOverlay
              cursor={cursor}
              interactionState={interactionState}
              inputSource={inputSource}
              columnCenterXs={columnCenterXs}
            />

            {/* Gate Toolbar */}
            {selectedGate && (
              <GateToolbar
                gate={selectedGate}
                position={{
                  top:
                    selectedGate.type === 'CNOT' &&
                    selectedGate.control !== undefined &&
                    selectedGate.target !== undefined
                      ? Math.min(selectedGate.control, selectedGate.target) * QUBIT_HEIGHT +
                        QUBIT_HEIGHT / 2
                      : (selectedGate.qubit ?? 0) * QUBIT_HEIGHT + QUBIT_HEIGHT / 2,
                  left: columnCenterXs[selectedGate.position],
                }}
                showBelow={
                  selectedGate.type === 'CNOT'
                    ? Math.min(selectedGate.control ?? 0, selectedGate.target ?? 0) === 0
                    : selectedGate.qubit === 0
                }
                onEdit={
                  ['RX', 'RY', 'RZ', 'CNOT'].includes(selectedGate.type)
                    ? () => handleGateEdit(selectedGate)
                    : undefined
                }
                onDelete={() => handleGateDelete(selectedGate.id)}
              />
            )}

            {/* Qubit Toolbar */}
            {selectedQubitIndex !== null && (
              <QubitToolbar
                position={{
                  top: selectedQubitIndex * QUBIT_HEIGHT + QUBIT_HEIGHT / 2,
                  left: 0,
                }}
                canAdd={qubits < config.maxQubits}
                canRemove={qubits > 1}
                onAddQubit={handleQubitAdd}
                onDeleteQubit={handleQubitRemove}
              />
            )}
          </div>
        </div>

        {/* Measurement icons - fixed at right edge, outside scroll area */}
        <div className="circuit-editor__measurements">
          {Array.from({ length: qubits }).map((_, qubitIndex) => (
            <div
              key={qubitIndex}
              className="circuit-editor__measurement"
              style={{
                top: `${qubitIndex * QUBIT_HEIGHT + QUBIT_HEIGHT / 2}px`,
              }}
            >
              <svg
                className="circuit-editor__measurement-icon"
                viewBox="0 0 32 32"
                width="32"
                height="32"
                role="img"
                aria-label={`Measure q[${qubitIndex}]`}
              >
                <path className="circuit-editor__measurement-dial" d="M8.5 20a7.5 7.5 0 0 1 15 0" />
                <path className="circuit-editor__measurement-needle" d="M16 20 20.9 12.1" />
                <circle className="circuit-editor__measurement-pivot" cx="16" cy="20" r="1.45" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Status bar for keyboard mode */}
      <StatusBar interactionState={interactionState} cursor={cursor} inputSource={inputSource} />
    </div>
  );
}

// Internal sub-components

interface GateToolbarProps {
  gate: Gate;
  position: { top: number; left: number };
  showBelow?: boolean;
  onEdit?: () => void;
  onDelete: () => void;
}

function GateToolbar({ gate, position, showBelow = false, onEdit, onDelete }: GateToolbarProps) {
  const isEditable = ['RX', 'RY', 'RZ', 'CNOT'].includes(gate.type);

  return (
    <div
      className={`circuit-editor__toolbar ${showBelow ? 'circuit-editor__toolbar--below' : ''}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {isEditable && onEdit && (
        <button
          className="circuit-editor__toolbar-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit operation"
        >
          <EditIcon />
        </button>
      )}
      <button
        className="circuit-editor__toolbar-btn circuit-editor__toolbar-btn--danger"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

interface QubitToolbarProps {
  position: { top: number; left: number };
  canAdd: boolean;
  canRemove: boolean;
  onAddQubit: () => void;
  onDeleteQubit: () => void;
}

function QubitToolbar({
  position,
  canAdd,
  canRemove,
  onAddQubit,
  onDeleteQubit,
}: QubitToolbarProps) {
  return (
    <div
      className="circuit-editor__toolbar circuit-editor__toolbar--qubit"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="circuit-editor__toolbar-btn"
        onClick={(e) => {
          e.stopPropagation();
          onAddQubit();
        }}
        disabled={!canAdd}
        title="Add qubit"
      >
        <AddIcon />
      </button>
      <button
        className="circuit-editor__toolbar-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteQubit();
        }}
        disabled={!canRemove}
        title="Delete qubit"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// Simple SVG icons (no Carbon dependency)

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M12.146 0.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
      <path
        fillRule="evenodd"
        d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
      />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"
      />
    </svg>
  );
}
