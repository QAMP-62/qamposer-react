/**
 * OpenQASM 2.0 utilities for bidirectional conversion between
 * circuit representation and QASM code.
 */

import type { Gate, GateType, Circuit, QasmParseResult } from '../types';

const QASM_HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n';

/**
 * Gate type to OpenQASM instruction mapping
 */
const GATE_TO_QASM: Record<GateType, string> = {
  H: 'h',
  X: 'x',
  Y: 'y',
  Z: 'z',
  CNOT: 'cx',
  RX: 'rx',
  RY: 'ry',
  RZ: 'rz',
};

/**
 * OpenQASM instruction to gate type mapping
 */
const QASM_TO_GATE: Record<string, GateType> = {
  h: 'H',
  x: 'X',
  y: 'Y',
  z: 'Z',
  cx: 'CNOT',
  rx: 'RX',
  ry: 'RY',
  rz: 'RZ',
};

/**
 * Convert circuit to OpenQASM 2.0 code
 */
export function circuitToQasm(circuit: Circuit): string {
  const { qubits, gates } = circuit;
  const lines: string[] = [QASM_HEADER];

  // Quantum and classical registers
  lines.push(`qreg q[${qubits}];`);
  lines.push(`creg c[${qubits}];`);

  if (gates.length === 0) {
    return lines.join('\n') + '\n';
  }

  lines.push(''); // Empty line before gates

  // Sort gates by position for proper ordering
  const sortedGates = [...gates].sort((a, b) => a.position - b.position);

  for (const gate of sortedGates) {
    const instruction = gateToQasmInstruction(gate);
    if (instruction) {
      lines.push(instruction);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Convert a single gate to OpenQASM instruction
 */
function gateToQasmInstruction(gate: Gate): string | null {
  const qasmGate = GATE_TO_QASM[gate.type];
  if (!qasmGate) return null;

  // Two-qubit gate (CNOT)
  if (gate.type === 'CNOT') {
    if (gate.control !== undefined && gate.target !== undefined) {
      return `cx q[${gate.control}], q[${gate.target}];`;
    }
    return null;
  }

  // Rotation gates with parameter
  if (['RX', 'RY', 'RZ'].includes(gate.type)) {
    const param = gate.parameter ?? 0;
    return `${qasmGate}(${formatParameter(param)}) q[${gate.qubit}];`;
  }

  // Single qubit gates
  if (gate.qubit !== undefined) {
    return `${qasmGate} q[${gate.qubit}];`;
  }

  return null;
}

/**
 * Format parameter value for QASM (handle pi fractions)
 */
function formatParameter(value: number): string {
  const pi = Math.PI;
  const tolerance = 0.0001;

  // Check for common pi fractions
  const fractions = [
    { val: pi, str: 'pi' },
    { val: -pi, str: '-pi' },
    { val: pi / 2, str: 'pi/2' },
    { val: -pi / 2, str: '-pi/2' },
    { val: pi / 4, str: 'pi/4' },
    { val: -pi / 4, str: '-pi/4' },
    { val: pi / 3, str: 'pi/3' },
    { val: -pi / 3, str: '-pi/3' },
    { val: (2 * pi) / 3, str: '2*pi/3' },
    { val: (-2 * pi) / 3, str: '-2*pi/3' },
  ];

  for (const { val, str } of fractions) {
    if (Math.abs(value - val) < tolerance) {
      return str;
    }
  }

  // Default to decimal representation
  return value.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Get all qubit indices a gate occupies.
 * For CNOT, this includes all qubits between control and target
 * (the vertical line spans through them).
 */
function getGateQubits(gate: Gate): number[] {
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
}

/**
 * Compact gates to left-align them (remove gaps)
 */
export function compactGates(gatesToCompact: Gate[]): Gate[] {
  const qubitMinPositions = new Map<number, number>();
  const sorted = [...gatesToCompact].sort((a, b) => a.position - b.position);

  return sorted.map((gate) => {
    const gateQubits = getGateQubits(gate);

    // Calculate minimum available position for this gate
    let newPosition = 0;
    gateQubits.forEach((q) => {
      const minPos = qubitMinPositions.get(q) || 0;
      newPosition = Math.max(newPosition, minPos);
    });

    // Update next available position for all qubits this gate occupies
    gateQubits.forEach((q) => {
      qubitMinPositions.set(q, newPosition + 1);
    });

    return { ...gate, position: newPosition };
  });
}

/**
 * Validate gate qubit indices against the number of qubits
 */
function validateGateQubits(gate: Gate, qubits: number, lineNum: number): string | null {
  const gateQubits = getGateQubits(gate);

  for (const qubitIndex of gateQubits) {
    if (qubitIndex >= qubits) {
      return `Line ${lineNum}: Qubit index q[${qubitIndex}] exceeds defined qubits (q[0]-q[${qubits - 1}])`;
    }
    if (qubitIndex < 0) {
      return `Line ${lineNum}: Invalid qubit index q[${qubitIndex}]`;
    }
  }

  return null;
}

/**
 * Parse OpenQASM 2.0 code to circuit representation
 */
export function qasmToCircuit(qasm: string): QasmParseResult {
  const errors: string[] = [];
  const gates: Gate[] = [];
  let qubits = 2; // Default

  const lines = qasm.split('\n');
  let position = 0;

  // First pass: find qreg declaration to know the number of qubits
  for (const line of lines) {
    const trimmed = line.trim();
    const qregMatch = trimmed.match(/^qreg\s+q\[(\d+)\];?$/);
    if (qregMatch) {
      qubits = parseInt(qregMatch[1], 10);
      break;
    }
  }

  // Second pass: parse gates with validation
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].trim();

    // Skip empty lines, comments, and header
    if (
      !line ||
      line.startsWith('//') ||
      line.startsWith('OPENQASM') ||
      line.startsWith('include')
    ) {
      continue;
    }

    // Skip qreg/creg declarations
    if (line.match(/^qreg\s+/) || line.match(/^creg\s+/)) {
      continue;
    }

    // Parse gate instructions
    const gate = parseGateInstruction(line, position, lineNum + 1, errors);
    if (gate) {
      // Validate qubit indices
      const qubitError = validateGateQubits(gate, qubits, lineNum + 1);
      if (qubitError) {
        errors.push(qubitError);
        continue;
      }
      gates.push(gate);
      position++;
    }
  }

  // Compact gates to left-align them
  const compactedGates = compactGates(gates);

  return {
    success: errors.length === 0,
    circuit: { qubits, gates: compactedGates },
    errors,
  };
}

/**
 * Parse a single gate instruction line
 */
function parseGateInstruction(
  line: string,
  position: number,
  lineNum: number,
  errors: string[]
): Gate | null {
  // Check for required semicolon
  if (!line.endsWith(';')) {
    errors.push(`Line ${lineNum}: Missing semicolon at end of statement`);
    return null;
  }

  // Remove trailing semicolon
  const instruction = line.replace(/;$/, '').trim();

  // Two-qubit gate: cx q[0], q[1]
  const cxMatch = instruction.match(/^cx\s+q\[(\d+)\]\s*,\s*q\[(\d+)\]$/);
  if (cxMatch) {
    return {
      id: generateGateId(),
      type: 'CNOT',
      control: parseInt(cxMatch[1], 10),
      target: parseInt(cxMatch[2], 10),
      position,
    };
  }

  // Rotation gate with parameter: rx(pi/2) q[0]
  const rotMatch = instruction.match(/^(rx|ry|rz)\s*\(\s*([^)]+)\s*\)\s*q\[(\d+)\]$/);
  if (rotMatch) {
    const gateType = QASM_TO_GATE[rotMatch[1]];
    const paramValue = parseParameter(rotMatch[2]);
    if (gateType && paramValue !== null) {
      return {
        id: generateGateId(),
        type: gateType,
        qubit: parseInt(rotMatch[3], 10),
        parameter: paramValue,
        position,
      };
    }
  }

  // Single qubit gate: h q[0]
  const singleMatch = instruction.match(/^(h|x|y|z)\s+q\[(\d+)\]$/);
  if (singleMatch) {
    const gateType = QASM_TO_GATE[singleMatch[1]];
    if (gateType) {
      return {
        id: generateGateId(),
        type: gateType,
        qubit: parseInt(singleMatch[2], 10),
        position,
      };
    }
  }

  // Unknown instruction - add error but don't fail
  if (instruction && !instruction.match(/^(barrier|measure|reset)/)) {
    errors.push(`Line ${lineNum}: Unknown instruction "${instruction}"`);
  }

  return null;
}

/**
 * Parse parameter value (handles pi expressions)
 */
function parseParameter(str: string): number | null {
  const trimmed = str.trim();

  // Handle pi expressions
  const piPatterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/^-?pi$/, (m) => (m[0].startsWith('-') ? -Math.PI : Math.PI)],
    [/^pi\/(\d+)$/, (m) => Math.PI / parseInt(m[1], 10)],
    [/^-pi\/(\d+)$/, (m) => -Math.PI / parseInt(m[1], 10)],
    [/^(-?\d+)\*?pi\/(\d+)$/, (m) => (parseInt(m[1], 10) * Math.PI) / parseInt(m[2], 10)],
  ];

  for (const [pattern, calc] of piPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return calc(match);
    }
  }

  // Try parsing as number
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

/**
 * Generate unique gate ID
 */
export function generateGateId(): string {
  return `gate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validate QASM code and return errors
 */
export function validateQasm(qasm: string): string[] {
  const { errors } = qasmToCircuit(qasm);
  return errors;
}

/**
 * Create a default empty circuit
 */
export function createDefaultCircuit(qubits: number = 2): Circuit {
  return {
    qubits: Math.max(2, Math.min(qubits, 5)), // Clamp to 2-5 qubits
    gates: [],
  };
}
