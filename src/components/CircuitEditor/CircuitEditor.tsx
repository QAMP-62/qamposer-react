import { useState, useRef, useMemo } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import { compactGates, generateGateId } from '../../utils/openqasm';
import type { Gate, GateType } from '../../types';
import './CircuitEditor.scss';

const GATE_COLORS: Record<GateType, string> = {
  H: '#fa4d56',
  X: '#002d9c',
  Y: '#9f1853',
  Z: '#33b1ff',
  RX: '#9f1853',
  RY: '#9f1853',
  RZ: '#33b1ff',
  CNOT: '#002d9c',
};

const QUBIT_HEIGHT = 80;
const MAX_POSITIONS = 20;
const LABEL_WIDTH = 60;
const COLUMN_GAP = 20;
const MIN_LEFT_MARGIN = 16;

export interface CircuitEditorProps {
  /** Additional CSS class */
  className?: string;
}

export function CircuitEditor({ className = '' }: CircuitEditorProps = {}) {
  const { circuit, updateGates, addQubit, removeQubit, setEditingGate, config } = useQamposer();

  const { qubits, gates } = circuit;

  const [dragOverQubit, setDragOverQubit] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [selectedQubitIndex, setSelectedQubitIndex] = useState<number | null>(null);
  const [draggingGateType, setDraggingGateType] = useState<GateType | null>(null);
  const [previewShiftedGates, setPreviewShiftedGates] = useState<
    { id: string; newPosition: number }[]
  >([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Calculate column widths based on gate content
  const columnWidths = useMemo(() => {
    const widths: Record<number, number> = {};

    for (let pos = 0; pos < MAX_POSITIONS; pos++) {
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
  }, [gates]);

  // Calculate left X positions for each column
  const columnLeftXs = useMemo(() => {
    const leftXs: Record<number, number> = {};

    for (let pos = 0; pos < MAX_POSITIONS; pos++) {
      if (pos === 0) {
        leftXs[pos] = LABEL_WIDTH + MIN_LEFT_MARGIN;
      } else {
        const prevLeftX = leftXs[pos - 1];
        const prevWidth = columnWidths[pos - 1];
        const prevRightEdge = prevLeftX + prevWidth;
        leftXs[pos] = prevRightEdge + COLUMN_GAP;
      }
    }

    return leftXs;
  }, [columnWidths]);

  // Calculate center X positions for each column
  const columnCenterXs = useMemo(() => {
    const centerXs: Record<number, number> = {};

    for (let pos = 0; pos < MAX_POSITIONS; pos++) {
      centerXs[pos] = columnLeftXs[pos] + columnWidths[pos] / 2;
    }

    return centerXs;
  }, [columnLeftXs, columnWidths]);

  // Get qubits occupied by a gate.
  // For CNOT, this includes all qubits between control and target
  // (the vertical line spans through them).
  const getGateQubits = (gate: Gate): number[] => {
    if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
      const minQubit = Math.min(gate.control, gate.target);
      const maxQubit = Math.max(gate.control, gate.target);
      const qubits: number[] = [];
      for (let q = minQubit; q <= maxQubit; q++) {
        qubits.push(q);
      }
      return qubits;
    }
    return gate.qubit !== undefined ? [gate.qubit] : [];
  };

  // Calculate drop position based on mouse X
  const calculateDropPosition = (
    mouseX: number,
    qubit: number,
    gateType: GateType
  ): {
    initialPosition: number;
    finalPosition: number;
    shiftedGates: { id: string; newPosition: number }[];
    control?: number;
    target?: number;
  } => {
    let closestPos = 0;
    let minDistance = Infinity;
    for (let pos = 0; pos < MAX_POSITIONS; pos++) {
      const distance = Math.abs(columnCenterXs[pos] - mouseX);
      if (distance < minDistance) {
        minDistance = distance;
        closestPos = pos;
      }
    }

    let targetQubits: number[];
    let control: number | undefined;
    let target: number | undefined;

    if (gateType === 'CNOT') {
      control = Math.min(qubit, qubits - 2);
      target = control + 1;
      targetQubits = [control, target];
    } else {
      targetQubits = [qubit];
    }

    const rightWall = gates
      .filter((g) => {
        if (g.type !== 'CNOT' || g.control === undefined || g.target === undefined) {
          return false;
        }
        const gateQubits = getGateQubits(g);
        return targetQubits.some((q) => gateQubits.includes(q)) && g.position > closestPos;
      })
      .sort((a, b) => a.position - b.position)[0];

    let initialPosition: number;
    if (rightWall) {
      initialPosition = Math.min(closestPos, rightWall.position - 1);
    } else {
      initialPosition = closestPos;
    }
    initialPosition = Math.max(0, initialPosition);

    const shiftedGatesForInsert = gates.map((g) => {
      const gateQubits = getGateQubits(g);
      const overlapsQubit = targetQubits.some((q) => gateQubits.includes(q));
      if (overlapsQubit && g.position >= initialPosition) {
        return { ...g, position: g.position + 1 };
      }
      return g;
    });

    const tempGate: Gate = {
      id: 'temp',
      type: gateType,
      position: initialPosition,
      ...(gateType === 'CNOT' ? { control, target } : { qubit }),
      ...(['RX', 'RY', 'RZ'].includes(gateType) ? { parameter: Math.PI / 2 } : {}),
    };

    const compacted = compactGates([...shiftedGatesForInsert, tempGate]);
    const finalGate = compacted.find((g) => g.id === 'temp');
    const finalPosition = finalGate ? finalGate.position : initialPosition;

    const shiftedGates: { id: string; newPosition: number }[] = [];
    compacted.forEach((compactedGate) => {
      if (compactedGate.id === 'temp') return;
      const originalGate = gates.find((g) => g.id === compactedGate.id);
      if (originalGate && originalGate.position !== compactedGate.position) {
        shiftedGates.push({
          id: compactedGate.id,
          newPosition: compactedGate.position,
        });
      }
    });

    return { initialPosition, finalPosition, shiftedGates, control, target };
  };

  const handleDragOver = (event: React.DragEvent, qubit: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    let gateType: GateType | null = draggingGateType;
    if (!gateType) {
      const mimeType = event.dataTransfer.types.find((t) => t.startsWith('application/x-gate-'));
      if (mimeType) {
        gateType = mimeType.replace('application/x-gate-', '').toUpperCase() as GateType;
        setDraggingGateType(gateType);
      }
    }

    setDragOverQubit(qubit);

    if (canvasRef.current && gateType) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const { finalPosition, shiftedGates } = calculateDropPosition(mouseX, qubit, gateType);
      setDragOverPosition(finalPosition);
      setPreviewShiftedGates(shiftedGates);
    }
  };

  const handleDragLeave = () => {
    setDragOverQubit(null);
    setDragOverPosition(null);
    setPreviewShiftedGates([]);
  };

  const handleDragEnd = () => {
    setDragOverQubit(null);
    setDragOverPosition(null);
    setPreviewShiftedGates([]);
    setDraggingGateType(null);
  };

  const handleDrop = (event: React.DragEvent, qubit: number) => {
    event.preventDefault();
    setDragOverQubit(null);
    setDragOverPosition(null);
    setDraggingGateType(null);
    setPreviewShiftedGates([]);

    const gateType = event.dataTransfer.getData('gateType') as GateType;
    if (!gateType || !canvasRef.current) return;

    if (gates.length >= config.maxGates) {
      console.warn(`Maximum gate limit (${config.maxGates}) reached`);
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const { initialPosition, control, target } = calculateDropPosition(mouseX, qubit, gateType);

    const targetQubits =
      gateType === 'CNOT' && control !== undefined && target !== undefined
        ? [control, target]
        : [qubit];

    const shiftedGates = gates.map((g) => {
      const gateQubits = getGateQubits(g);
      const overlapsQubit = targetQubits.some((q) => gateQubits.includes(q));
      if (overlapsQubit && g.position >= initialPosition) {
        return { ...g, position: g.position + 1 };
      }
      return g;
    });

    const newGate: Gate = {
      id: generateGateId(),
      type: gateType,
      position: initialPosition,
      ...(gateType === 'CNOT' ? { control, target } : { qubit }),
      ...(['RX', 'RY', 'RZ'].includes(gateType) ? { parameter: Math.PI / 2 } : {}),
    };

    const updatedGates = compactGates([...shiftedGates, newGate]);
    updateGates(updatedGates);
  };

  const handleGateClick = (gateId: string) => {
    setSelectedGateId(selectedGateId === gateId ? null : gateId);
    setSelectedQubitIndex(null);
  };

  const handleGateDelete = (gateId: string) => {
    const remainingGates = gates.filter((g) => g.id !== gateId);
    const compactedGates = compactGates(remainingGates);
    updateGates(compactedGates);
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
    addQubit();
    setSelectedQubitIndex(null);
  };

  const handleQubitRemove = () => {
    if (selectedQubitIndex === null) return;
    removeQubit(selectedQubitIndex);
    setSelectedQubitIndex(null);
  };

  const renderGate = (gate: Gate) => {
    const isSelected = selectedGateId === gate.id;

    if (gate.type === 'CNOT' && gate.control !== undefined && gate.target !== undefined) {
      const top = Math.min(gate.control, gate.target) * QUBIT_HEIGHT + QUBIT_HEIGHT / 2;
      const height = Math.abs(gate.target - gate.control) * QUBIT_HEIGHT;
      const left = columnCenterXs[gate.position];

      return (
        <div
          key={gate.id}
          className={`circuit-editor__cnot ${isSelected ? 'circuit-editor__cnot--selected' : ''}`}
          style={{
            left: `${left}px`,
            top: `${top}px`,
            height: `${height}px`,
          }}
          onClick={() => handleGateClick(gate.id)}
        >
          <div className="circuit-editor__cnot-line" />
          <div
            className="circuit-editor__cnot-control"
            style={{
              top: gate.control < gate.target ? '0' : '100%',
            }}
          />
          <div
            className="circuit-editor__cnot-target"
            style={{
              top: gate.target < gate.control ? '0' : '100%',
            }}
          />
        </div>
      );
    }

    if (gate.qubit === undefined) return null;

    const isRotationGate = ['RX', 'RY', 'RZ'].includes(gate.type);
    const parameterLabel =
      gate.parameter !== undefined ? `(${(gate.parameter / Math.PI).toFixed(2)}π)` : '';

    const centerX = columnCenterXs[gate.position];

    return (
      <div
        key={gate.id}
        className={`circuit-editor__gate ${
          isSelected ? 'circuit-editor__gate--selected' : ''
        } ${isRotationGate ? 'circuit-editor__gate--rotation' : ''}`}
        style={{
          left: `${centerX}px`,
          top: `${gate.qubit * QUBIT_HEIGHT + QUBIT_HEIGHT / 2}px`,
          backgroundColor: GATE_COLORS[gate.type],
        }}
        onClick={() => handleGateClick(gate.id)}
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
  const maxGatePosition = gates.length > 0 ? Math.max(...gates.map((g) => g.position)) : 0;
  const lastColumnRightEdge =
    columnLeftXs[maxGatePosition] + columnWidths[maxGatePosition] + COLUMN_GAP;
  const minCircuitWidth = Math.max(lastColumnRightEdge, 400); // Minimum width

  return (
    <div className={`circuit-editor ${className}`.trim()} onDragEnd={handleDragEnd}>
      <div className="circuit-editor__canvas">
        {/* Scrollable circuit area */}
        <div className="circuit-editor__scroll-container">
          <div
            ref={canvasRef}
            className="circuit-editor__circuit-area"
            style={{ minWidth: `${minCircuitWidth}px` }}
          >
            {/* Qubit lanes */}
            <div className="circuit-editor__lanes">
              {Array.from({ length: qubits }).map((_, qubitIndex) => (
                <div key={qubitIndex} className="circuit-editor__lane">
                  <div
                    className={`circuit-editor__lane-label ${
                      selectedQubitIndex === qubitIndex
                        ? 'circuit-editor__lane-label--selected'
                        : ''
                    }`}
                    onClick={() => handleQubitClick(qubitIndex)}
                  >
                    q[{qubitIndex}]
                  </div>
                  <div className="circuit-editor__lane-line" />

                  <div
                    className="circuit-editor__drop-zone-continuous"
                    onDragOver={(e) => handleDragOver(e, qubitIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, qubitIndex)}
                  />
                </div>
              ))}

              {/* Classical register lane */}
              <div className="circuit-editor__lane circuit-editor__lane--classical">
                <div className="circuit-editor__lane-label">c{qubits}</div>
                <div className="circuit-editor__lane-line circuit-editor__lane-line--classical" />
              </div>
            </div>

            {/* Gates */}
            <div className="circuit-editor__gates">
              {gates
                .filter((gate) => {
                  const isBeingShifted = previewShiftedGates.some((sg) => sg.id === gate.id);
                  return !isBeingShifted;
                })
                .map(renderGate)}
            </div>

            {/* New gate drop preview */}
            {dragOverQubit !== null && dragOverPosition !== null && draggingGateType && (
              <div className="circuit-editor__preview">
                {draggingGateType === 'CNOT' ? (
                  (() => {
                    const control = Math.min(dragOverQubit, qubits - 2);
                    const target = control + 1;
                    const top = control * QUBIT_HEIGHT + QUBIT_HEIGHT / 2;
                    const height = QUBIT_HEIGHT;
                    return (
                      <div
                        className="circuit-editor__cnot circuit-editor__cnot--preview"
                        style={{
                          left: `${columnCenterXs[dragOverPosition]}px`,
                          top: `${top}px`,
                          height: `${height}px`,
                        }}
                      >
                        <div className="circuit-editor__cnot-line" />
                        <div
                          className="circuit-editor__cnot-control"
                          style={{ top: control < target ? '0' : '100%' }}
                        />
                        <div
                          className="circuit-editor__cnot-target"
                          style={{ top: target < control ? '0' : '100%' }}
                        />
                      </div>
                    );
                  })()
                ) : (
                  <div
                    className="circuit-editor__gate circuit-editor__gate--preview"
                    style={{
                      left: `${columnCenterXs[dragOverPosition]}px`,
                      top: `${dragOverQubit * QUBIT_HEIGHT + QUBIT_HEIGHT / 2}px`,
                    }}
                  >
                    <span className="circuit-editor__gate-label">
                      {draggingGateType}
                      {['RX', 'RY', 'RZ'].includes(draggingGateType) && (
                        <span className="circuit-editor__gate-param">(0.50π)</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Shifted gates preview */}
            {previewShiftedGates.length > 0 && (
              <div className="circuit-editor__preview circuit-editor__preview--shifted">
                {previewShiftedGates.map((shiftedGate) => {
                  const originalGate = gates.find((g) => g.id === shiftedGate.id);
                  if (!originalGate) return null;

                  if (
                    originalGate.type === 'CNOT' &&
                    originalGate.control !== undefined &&
                    originalGate.target !== undefined
                  ) {
                    const top =
                      Math.min(originalGate.control, originalGate.target) * QUBIT_HEIGHT +
                      QUBIT_HEIGHT / 2;
                    const height =
                      Math.abs(originalGate.target - originalGate.control) * QUBIT_HEIGHT;
                    return (
                      <div
                        key={shiftedGate.id}
                        className="circuit-editor__cnot circuit-editor__cnot--shifted-preview"
                        style={{
                          left: `${columnCenterXs[shiftedGate.newPosition]}px`,
                          top: `${top}px`,
                          height: `${height}px`,
                        }}
                      >
                        <div className="circuit-editor__cnot-line" />
                        <div
                          className="circuit-editor__cnot-control"
                          style={{
                            top: originalGate.control < originalGate.target ? '0' : '100%',
                          }}
                        />
                        <div
                          className="circuit-editor__cnot-target"
                          style={{
                            top: originalGate.target < originalGate.control ? '0' : '100%',
                          }}
                        />
                      </div>
                    );
                  }

                  if (originalGate.qubit === undefined) return null;

                  const isRotationGate = ['RX', 'RY', 'RZ'].includes(originalGate.type);
                  const parameterLabel =
                    originalGate.parameter !== undefined
                      ? `(${(originalGate.parameter / Math.PI).toFixed(2)}π)`
                      : '';

                  return (
                    <div
                      key={shiftedGate.id}
                      className={`circuit-editor__gate circuit-editor__gate--shifted-preview ${
                        isRotationGate ? 'circuit-editor__gate--rotation' : ''
                      }`}
                      style={{
                        left: `${columnCenterXs[shiftedGate.newPosition]}px`,
                        top: `${originalGate.qubit * QUBIT_HEIGHT + QUBIT_HEIGHT / 2}px`,
                        backgroundColor: GATE_COLORS[originalGate.type],
                      }}
                    >
                      <span className="circuit-editor__gate-label">
                        {originalGate.type}
                        {isRotationGate && originalGate.parameter !== undefined && (
                          <span className="circuit-editor__gate-param">{parameterLabel}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

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
                  left: LABEL_WIDTH,
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
              <div className="circuit-editor__measurement-icon" />
            </div>
          ))}
        </div>
      </div>
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
