import { QamposerProvider } from '../../context/QamposerProvider';
import { ThemeProvider, useTheme, type Theme } from '../../context/ThemeContext';
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
  /** Default theme (default: 'dark') */
  defaultTheme?: Theme;
  /** Show theme toggle button (default: true) */
  showThemeToggle?: boolean;
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
  defaultTheme = 'dark',
  showThemeToggle = true,
  ...providerProps
}: QamposerProps) {
  return (
    <ThemeProvider defaultTheme={defaultTheme}>
      <QamposerProvider {...providerProps}>
        <QamposerContent
          className={className}
          showHeader={showHeader}
          title={title}
          codeEditorWidth={codeEditorWidth}
          topGridTemplate={topGridTemplate}
          bottomGridTemplate={bottomGridTemplate}
          showThemeToggle={showThemeToggle}
        />
      </QamposerProvider>
    </ThemeProvider>
  );
}

// Internal component to access theme context
function QamposerContent({
  className,
  showHeader,
  title,
  codeEditorWidth,
  topGridTemplate,
  bottomGridTemplate,
  showThemeToggle,
}: {
  className: string;
  showHeader: boolean;
  title: string;
  codeEditorWidth: string;
  topGridTemplate: string;
  bottomGridTemplate: string;
  showThemeToggle: boolean;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={`qamposer ${className}`.trim()}>
      {showHeader && (
        <header className="qamposer__header">
          <h1 className="qamposer__title">{title}</h1>
          <div className="qamposer__actions">
            {showThemeToggle && (
              <button
                className="qamposer__theme-toggle"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            )}
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
  );
}

// Theme toggle icons
function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
