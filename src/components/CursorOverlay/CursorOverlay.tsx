import type { CursorPosition, InteractionState, InputSource } from '../../keyboard/types';
import './CursorOverlay.scss';

const QUBIT_HEIGHT = 80;
const GATE_COLORS: Record<string, string> = {
  H: '#fa4d56',
  X: '#002d9c',
  Y: '#9f1853',
  Z: '#33b1ff',
  RX: '#9f1853',
  RY: '#9f1853',
  RZ: '#33b1ff',
};

export interface CursorOverlayProps {
  cursor: CursorPosition;
  interactionState: InteractionState;
  inputSource: InputSource;
  columnCenterXs: Record<number, number>;
}

export function CursorOverlay({
  cursor,
  interactionState,
  inputSource,
  columnCenterXs,
}: CursorOverlayProps) {
  if (inputSource !== 'keyboard') return null;

  const left = columnCenterXs[cursor.col] ?? 0;
  const top = cursor.row * QUBIT_HEIGHT + QUBIT_HEIGHT / 2;

  const stateClass =
    interactionState.type === 'placing'
      ? 'cursor-overlay--placing'
      : interactionState.type === 'cnot_control'
        ? 'cursor-overlay--cnot-control'
        : interactionState.type === 'cnot_target'
          ? 'cursor-overlay--cnot-target'
          : 'cursor-overlay--idle';

  return (
    <>
      <div
        className={`cursor-overlay ${stateClass}`}
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        {/* Gate label */}
        {interactionState.type === 'placing' && (
          <span
            className="cursor-overlay__gate-label"
            style={{ color: GATE_COLORS[interactionState.gateType] ?? '#4285f4' }}
          >
            {interactionState.gateType}
          </span>
        )}
        {interactionState.type === 'cnot_control' && (
          <span className="cursor-overlay__gate-label cursor-overlay__gate-label--cnot">
            Ctrl
          </span>
        )}
        {interactionState.type === 'cnot_target' && (
          <span className="cursor-overlay__gate-label cursor-overlay__gate-label--cnot">
            Target
          </span>
        )}
        <div className="cursor-overlay__frame" />
      </div>

      {/* CNOT control marker (persists while selecting target) */}
      {interactionState.type === 'cnot_target' && (
        <>
          <div
            className="cursor-overlay cursor-overlay--cnot-control-fixed"
            style={{
              left: `${left}px`,
              top: `${interactionState.controlRow * QUBIT_HEIGHT + QUBIT_HEIGHT / 2}px`,
            }}
          >
            <div className="cursor-overlay__frame" />
          </div>
          {/* Vertical preview line between control and target */}
          <div
            className="cursor-overlay__cnot-line"
            style={{
              left: `${left}px`,
              top: `${Math.min(cursor.row, interactionState.controlRow) * QUBIT_HEIGHT + QUBIT_HEIGHT / 2}px`,
              height: `${Math.abs(cursor.row - interactionState.controlRow) * QUBIT_HEIGHT}px`,
            }}
          />
        </>
      )}
    </>
  );
}
