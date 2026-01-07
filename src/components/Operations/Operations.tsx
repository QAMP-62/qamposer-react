import { useState, useEffect } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import type { GateType, Gate, GateInfo } from '../../types';
import './Operations.scss';

const GATE_DEFINITIONS: GateInfo[] = [
  { type: 'H', label: 'H', description: 'Hadamard', category: 'single', color: '#fa4d56' },
  { type: 'X', label: 'X', description: 'Pauli-X (NOT)', category: 'single', color: '#002d9c' },
  { type: 'Y', label: 'Y', description: 'Pauli-Y', category: 'single', color: '#9f1853' },
  { type: 'Z', label: 'Z', description: 'Pauli-Z', category: 'single', color: '#33b1ff' },
  { type: 'RX', label: 'RX', description: 'Rotate X', category: 'rotation', color: '#9f1853' },
  { type: 'RY', label: 'RY', description: 'Rotate Y', category: 'rotation', color: '#9f1853' },
  { type: 'RZ', label: 'RZ', description: 'Rotate Z', category: 'rotation', color: '#33b1ff' },
  { type: 'CNOT', label: 'CNOT', description: 'Controlled-NOT', category: 'multi', color: '#002d9c' },
];

export interface OperationsProps {
  /** Additional CSS class */
  className?: string;
}

export function Operations({ className = '' }: OperationsProps = {}) {
  const { editingGate, setEditingGate, updateGate } = useQamposer();

  if (editingGate) {
    return (
      <GateEditor
        gate={editingGate}
        onUpdate={updateGate}
        onClose={() => setEditingGate(null)}
        className={className}
      />
    );
  }

  return <GateLibrary className={className} />;
}

// GateLibrary sub-component
function GateLibrary({ className = '' }: { className?: string }) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    single: true,
    multi: false,
  });

  const handleDragStart = (event: React.DragEvent, gateType: GateType) => {
    event.dataTransfer.setData('gateType', gateType);
    event.dataTransfer.setData(`application/x-gate-${gateType.toLowerCase()}`, '');
    event.dataTransfer.effectAllowed = 'copy';
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const renderGate = (gate: GateInfo) => {
    if (gate.type === 'CNOT') {
      return (
        <div
          key={gate.type}
          className="operations__gate operations__gate--cnot"
          draggable
          onDragStart={(e) => handleDragStart(e, gate.type)}
          title={gate.description}
        >
          <svg
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
          >
            <rect x="0" y="0" width="32" height="32" fill="#002d9c" rx="4" />
            <circle cx="16" cy="8" r="2" fill="white" />
            <circle
              cx="16"
              cy="20.667"
              r="5.333"
              stroke="white"
              fill="none"
              strokeWidth="1.25"
            />
            <line
              x1="10.667"
              x2="21.333"
              y1="20.667"
              y2="20.667"
              stroke="white"
              strokeWidth="1.25"
            />
            <line
              x1="16"
              x2="16"
              y1="6"
              y2="26"
              stroke="white"
              strokeWidth="1.25"
            />
          </svg>
        </div>
      );
    }

    return (
      <div
        key={gate.type}
        className="operations__gate"
        draggable
        onDragStart={(e) => handleDragStart(e, gate.type)}
        style={{ backgroundColor: gate.color }}
        title={gate.description}
      >
        <span className="operations__gate-label">{gate.label}</span>
      </div>
    );
  };

  const singleQubitGates = GATE_DEFINITIONS.filter(
    (g) => g.category === 'single' || g.category === 'rotation'
  );
  const multiQubitGates = GATE_DEFINITIONS.filter((g) => g.category === 'multi');

  return (
    <div className={`operations ${className}`.trim()}>
      <div className="operations__header">
        <h3>Operations</h3>
      </div>

      <div className="operations__sections">
        <div className="operations__section">
          <button
            className="operations__section-header"
            onClick={() => toggleSection('single')}
          >
            <ChevronIcon expanded={expandedSections.single} />
            <span>Single-Qubit Gates</span>
          </button>
          {expandedSections.single && (
            <div className="operations__grid">
              {singleQubitGates.map(renderGate)}
            </div>
          )}
        </div>

        <div className="operations__section">
          <button
            className="operations__section-header"
            onClick={() => toggleSection('multi')}
          >
            <ChevronIcon expanded={expandedSections.multi} />
            <span>Multi-Qubit Gates</span>
          </button>
          {expandedSections.multi && (
            <div className="operations__grid">
              {multiQubitGates.map(renderGate)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// GateEditor sub-component
interface GateEditorProps {
  gate: Gate;
  onUpdate: (gateId: string, updates: Partial<Gate>) => void;
  onClose: () => void;
  className?: string;
}

function GateEditor({ gate, onUpdate, onClose, className = '' }: GateEditorProps) {
  const { circuit } = useQamposer();
  const numQubits = circuit.qubits;

  // Rotation gate state
  const [parameterValue, setParameterValue] = useState('');

  // CNOT gate state
  const [controlQubit, setControlQubit] = useState(gate.control ?? 0);
  const [targetQubit, setTargetQubit] = useState(gate.target ?? 1);

  // Initialize rotation parameter
  useEffect(() => {
    if (gate.parameter !== undefined) {
      const value = gate.parameter;
      const piRatio = value / Math.PI;

      if (Math.abs(piRatio - Math.round(piRatio)) < 0.0001) {
        setParameterValue(
          piRatio === 0 ? '0' : piRatio === 1 ? 'pi' : `${Math.round(piRatio)}*pi`
        );
      } else if (Math.abs(piRatio * 2 - Math.round(piRatio * 2)) < 0.0001) {
        const ratio = Math.round(piRatio * 2);
        setParameterValue(ratio === 1 ? 'pi/2' : `${ratio}*pi/2`);
      } else {
        setParameterValue(value.toFixed(4));
      }
    } else {
      setParameterValue('0');
    }
  }, [gate.parameter]);

  // Initialize CNOT qubits
  useEffect(() => {
    if (gate.type === 'CNOT') {
      setControlQubit(gate.control ?? 0);
      setTargetQubit(gate.target ?? 1);
    }
  }, [gate.type, gate.control, gate.target]);

  const isRotationGate = ['RX', 'RY', 'RZ'].includes(gate.type);
  const isCnotGate = gate.type === 'CNOT';

  if (!isRotationGate && !isCnotGate) {
    return null;
  }

  const handleRotationSave = () => {
    let radians = 0;
    try {
      const normalized = parameterValue.toLowerCase().replace(/\s/g, '');

      if (normalized.includes('pi')) {
        const piValue = Math.PI;
        let expr = normalized.replace(/pi/g, String(piValue));
        expr = expr.replace(/\*/g, '*').replace(/\//g, '/');
        radians = Function(`"use strict"; return (${expr})`)();
      } else {
        radians = parseFloat(normalized);
      }

      if (!isNaN(radians)) {
        onUpdate(gate.id, { parameter: radians });
      }
    } catch (error) {
      console.error('Invalid parameter expression:', error);
    }
  };

  const handleCnotSave = () => {
    if (controlQubit !== targetQubit) {
      onUpdate(gate.id, { control: controlQubit, target: targetQubit });
    }
  };

  const qubitOptions = Array.from({ length: numQubits }, (_, i) => i);

  return (
    <div className={`operations operations--editor ${className}`.trim()}>
      <div className="operations__header">
        <h3>Edit {gate.type}</h3>
        <button
          className="operations__close-btn"
          onClick={onClose}
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="operations__content">
        {isRotationGate && (
          <div className="operations__field">
            <label htmlFor="theta-input">theta (rotation)</label>
            <input
              id="theta-input"
              type="text"
              className="operations__input"
              value={parameterValue}
              onChange={(e) => setParameterValue(e.target.value)}
              onBlur={handleRotationSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRotationSave();
              }}
              placeholder="e.g., pi/2, 1.5708, 2*pi"
            />
            <p className="operations__helper">
              Enter angle in radians or use pi expressions
            </p>
          </div>
        )}

        {isCnotGate && (
          <>
            <div className="operations__field">
              <label htmlFor="control-select">Control qubit</label>
              <select
                id="control-select"
                className="operations__select"
                value={controlQubit}
                onChange={(e) => {
                  const newControl = parseInt(e.target.value, 10);
                  setControlQubit(newControl);
                  // Auto-adjust target if same as control
                  if (newControl === targetQubit) {
                    setTargetQubit(newControl === 0 ? 1 : 0);
                  }
                }}
              >
                {qubitOptions.map((q) => (
                  <option key={q} value={q}>
                    q[{q}]
                  </option>
                ))}
              </select>
            </div>

            <div className="operations__field">
              <label htmlFor="target-select">Target qubit</label>
              <select
                id="target-select"
                className="operations__select"
                value={targetQubit}
                onChange={(e) => {
                  const newTarget = parseInt(e.target.value, 10);
                  setTargetQubit(newTarget);
                  // Auto-adjust control if same as target
                  if (newTarget === controlQubit) {
                    setControlQubit(newTarget === 0 ? 1 : 0);
                  }
                }}
              >
                {qubitOptions.map((q) => (
                  <option key={q} value={q}>
                    q[{q}]
                  </option>
                ))}
              </select>
            </div>

            <button
              className="operations__apply-btn"
              onClick={handleCnotSave}
              disabled={controlQubit === targetQubit}
            >
              Apply
            </button>

            {controlQubit === targetQubit && (
              <p className="operations__error">
                Control and target must be different qubits
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Simple icons
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s',
      }}
    >
      <path
        fillRule="evenodd"
        d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"
      />
    </svg>
  );
}
