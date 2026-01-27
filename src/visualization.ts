/**
 * @qamposer/react/visualization - Visualization components requiring plotly
 *
 * This module contains components that depend on react-plotly.js.
 * Import from '@qamposer/react/visualization' only when you need
 * visualization functionality (QSphere, ResultsPanel).
 *
 * @example
 * ```typescript
 * // Full preset with QSphere (requires plotly)
 * import { Qamposer } from '@qamposer/react/visualization';
 *
 * // Individual visualization components (requires plotly)
 * import { QSphereView, ResultsPanel } from '@qamposer/react/visualization';
 * ```
 *
 * Peer dependencies required:
 * - react-plotly.js
 * - plotly.js-basic-dist-min (or plotly.js)
 */

// =============================================================================
// PRESETS - Full preset with QSphere visualization
// =============================================================================
export { Qamposer } from './presets/Qamposer';
export type { QamposerProps } from './presets/Qamposer';

// =============================================================================
// VISUALIZATION COMPONENTS (require plotly)
// =============================================================================
export { QSphereView } from './components/QSphereView';
export type { QSphereViewProps } from './components/QSphereView';

export { ResultsPanel } from './components/ResultsPanel';
export type { ResultsPanelProps } from './components/ResultsPanel';
