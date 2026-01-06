import { QamposerProvider } from '../../context/QamposerProvider';
import { Operations } from '../../components/Operations';
import { CircuitEditor } from '../../components/CircuitEditor';
import { ResultsPanel } from '../../components/ResultsPanel';
import { QSphereView } from '../../components/QSphereView';
import { CodeEditor } from '../../components/CodeEditor';
import { SimulationControls } from '../../components/SimulationControls';
import type { QamposerProviderProps } from '../../types';
import './Qamposer.scss';

export interface QamposerProps extends Omit<QamposerProviderProps, 'children'> {
  /** Additional CSS class */
  className?: string;
  /** Show header (default: true) */
  showHeader?: boolean;
  /** Custom title (default: 'Qamposer') */
  title?: string;
  /** Code editor width (default: '280px') */
  codeEditorWidth?: string;
  /** Custom ratio for top area operations:circuit (default: '1fr 3fr') */
  topGridTemplate?: string;
  /** Custom ratio for bottom area results:qsphere (default: '1fr 1fr') */
  bottomGridTemplate?: string;
}

/**
 * Qamposer - Embeddable Quantum Circuit Composer
 *
 * A complete quantum circuit editor with:
 * - Operations panel (gate library)
 * - Circuit editor (drag & drop)
 * - Results panel (probability histogram)
 * - Q-sphere visualization
 * - Code editor (OpenQASM)
 */
export function Qamposer({
  className = '',
  showHeader = true,
  title = 'Qamposer',
  codeEditorWidth = '280px',
  topGridTemplate = '1fr 3fr',
  bottomGridTemplate = '1fr 1fr',
  ...providerProps
}: QamposerProps) {
  return (
    <QamposerProvider {...providerProps}>
      <div className={`qamposer ${className}`.trim()}>
        {showHeader && (
          <header className="qamposer__header">
            <h1 className="qamposer__title">{title}</h1>
            <div className="qamposer__actions">
              <SimulationControls />
            </div>
          </header>
        )}

        <div
          className="qamposer__layout"
          style={{ gridTemplateColumns: `1fr ${codeEditorWidth}` } as React.CSSProperties}
        >
          {/* Left Area */}
          <div className="qamposer__left-area">
            {/* Top Area: Operations + Circuit Editor */}
            <div
              className="qamposer__top-area"
              style={{ gridTemplateColumns: topGridTemplate } as React.CSSProperties}
            >
              <aside className="qamposer__operations">
                <Operations />
              </aside>
              <main className="qamposer__circuit">
                <CircuitEditor />
              </main>
            </div>

            {/* Bottom Area: Probabilities + Q-sphere */}
            <div
              className="qamposer__bottom-area"
              style={{ gridTemplateColumns: bottomGridTemplate } as React.CSSProperties}
            >
              <div className="qamposer__results">
                <ResultsPanel />
              </div>
              <div className="qamposer__qsphere">
                <QSphereView />
              </div>
            </div>
          </div>

          {/* Right Sidebar: Code Editor */}
          <aside className="qamposer__code-editor">
            <CodeEditor />
          </aside>
        </div>
      </div>
    </QamposerProvider>
  );
}
