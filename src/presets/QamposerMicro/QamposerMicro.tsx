import { QamposerProvider } from '../../context/QamposerProvider';
import { ThemeProvider, useTheme, type Theme } from '../../context/ThemeContext';
import { Operations } from '../../components/Operations';
import { CircuitEditor } from '../../components/CircuitEditor';
import { SimulationControls } from '../../components/SimulationControls';
import type { QamposerProviderProps } from '../../types';
import './QamposerMicro.scss';

export interface QamposerMicroProps extends Omit<QamposerProviderProps, 'children'> {
  /** Additional CSS class */
  className?: string;
  /** Show header (default: true) */
  showHeader?: boolean;
  /** Custom title (default: 'Qamposer') */
  title?: string;
  /** Custom ratio for operations:circuit (default: '1fr 3fr') */
  gridTemplate?: string;
  /** Default theme (default: 'dark') */
  defaultTheme?: Theme;
  /** Show theme toggle button (default: true) */
  showThemeToggle?: boolean;
}

/**
 * QamposerMicro - Minimal Quantum Circuit Composer
 *
 * A compact circuit editor with:
 * - Operations panel (gate library)
 * - Circuit editor (drag & drop)
 * - Simulation controls
 *
 * Ideal for embedding in games, educational apps, or space-constrained layouts.
 * Exposes the same data callbacks as the full Qamposer component.
 */
export function QamposerMicro({
  className = '',
  showHeader = true,
  title = 'Qamposer',
  gridTemplate = '1fr 3fr',
  defaultTheme = 'dark',
  showThemeToggle = true,
  ...providerProps
}: QamposerMicroProps) {
  return (
    <ThemeProvider defaultTheme={defaultTheme}>
      <QamposerProvider {...providerProps}>
        <QamposerMicroContent
          className={className}
          showHeader={showHeader}
          title={title}
          gridTemplate={gridTemplate}
          showThemeToggle={showThemeToggle}
        />
      </QamposerProvider>
    </ThemeProvider>
  );
}

// Internal component to access theme context
function QamposerMicroContent({
  className,
  showHeader,
  title,
  gridTemplate,
  showThemeToggle,
}: {
  className: string;
  showHeader: boolean;
  title: string;
  gridTemplate: string;
  showThemeToggle: boolean;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={`qamposer-micro ${className}`.trim()}>
      {showHeader && (
        <header className="qamposer-micro__header">
          <h1 className="qamposer-micro__title">{title}</h1>
          <div className="qamposer-micro__actions">
            {showThemeToggle && (
              <button
                className="qamposer-micro__theme-toggle"
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
        className="qamposer-micro__layout"
        style={{ gridTemplateColumns: gridTemplate } as React.CSSProperties}
      >
        <aside className="qamposer-micro__operations">
          <Operations />
        </aside>
        <main className="qamposer-micro__circuit">
          <CircuitEditor />
        </main>
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
