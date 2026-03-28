import type { GateType } from '../types';

// Key repeat timing (ms)
export const KEY_REPEAT = {
  INITIAL_DELAY: 300,
  NORMAL_INTERVAL: 80,
  FAST_INTERVAL: 40,
  FAST_THRESHOLD: 5,
} as const;

// Number key to gate type mapping
export const NUMBER_KEY_GATES: Record<string, GateType> = {
  '1': 'H',
  '2': 'X',
  '3': 'Y',
  '4': 'Z',
  '5': 'RX',
  '6': 'RY',
  '7': 'CNOT',
};

// Ordered gate list for Q/E cycling
export const GATE_CYCLE_ORDER: GateType[] = ['H', 'X', 'Y', 'Z', 'RX', 'RY', 'RZ', 'CNOT'];

// Input source switch threshold (px)
export const POINTER_MOVE_THRESHOLD = 8;
