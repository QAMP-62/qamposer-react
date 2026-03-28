import type { CursorPosition, InteractionState, InputSource } from '../../keyboard/types';
import './StatusBar.scss';

export interface StatusBarProps {
  interactionState: InteractionState;
  cursor: CursorPosition;
  inputSource: InputSource;
}

export function StatusBar({ interactionState, cursor, inputSource }: StatusBarProps) {
  if (inputSource !== 'keyboard') return null;

  const { mode, hints } = getModeInfo(interactionState);

  return (
    <div className="status-bar">
      <span className="status-bar__mode">{mode}</span>
      <span className="status-bar__separator" />
      <span className="status-bar__position">
        q[{cursor.row}] col {cursor.col}
      </span>
      <span className="status-bar__separator" />
      <span className="status-bar__hints">{hints}</span>
    </div>
  );
}

function getModeInfo(state: InteractionState): { mode: string; hints: string } {
  switch (state.type) {
    case 'idle':
      return {
        mode: 'IDLE',
        hints: '1-7: Select gate / WASD: Move / Esc: Exit keyboard',
      };
    case 'placing':
      return {
        mode: `PLACING ${state.gateType}`,
        hints: 'Space: Place / 1-7: Change gate / Esc: Cancel',
      };
    case 'cnot_control':
      return {
        mode: 'CNOT: Select Control',
        hints: 'Space: Confirm control / Esc: Cancel',
      };
    case 'cnot_target':
      return {
        mode: 'CNOT: Select Target',
        hints: 'Space: Confirm target / Esc: Cancel',
      };
  }
}
