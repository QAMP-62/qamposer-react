import type { GateType } from '../types';

/** Fill colour of each gate type, shared by the editor, cursor and drag ghost */
export const GATE_COLORS: Record<GateType, string> = {
  H: '#fa4d56',
  X: '#002d9c',
  Y: '#9f1853',
  Z: '#33b1ff',
  RX: '#9f1853',
  RY: '#9f1853',
  RZ: '#33b1ff',
  CNOT: '#002d9c',
};
