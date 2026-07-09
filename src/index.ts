/**
 * @qamposer/react - Embeddable Quantum Circuit Composer for React
 *
 * A modular React component library for building quantum circuit editors
 * with simulation capabilities.
 *
 * This is the core module with NO plotly dependency.
 * For QSphere visualization, import from '@qamposer/react/visualization'.
 *
 * @example
 * ```typescript
 * // Core components (no plotly required)
 * import { QamposerMicro, CircuitEditor, Operations } from '@qamposer/react';
 *
 * // Full preset with QSphere (requires plotly)
 * import { Qamposer, QSphereView } from '@qamposer/react/visualization';
 * ```
 */

// =============================================================================
// PRESETS - Ready-to-use component compositions (core only)
// =============================================================================

// Micro preset - minimal (Operations, CircuitEditor only) - NO plotly
export { QamposerMicro } from './presets/QamposerMicro';
export type { QamposerMicroProps } from './presets/QamposerMicro';

// Note: Full Qamposer preset (with QSphere) is in '@qamposer/react/visualization'

// =============================================================================
// CORE COMPONENTS - Individual building blocks (no plotly)
// =============================================================================
export { CircuitEditor } from './components/CircuitEditor';
export { Operations } from './components/Operations';
export { CodeEditor } from './components/CodeEditor';
export { SimulationControls } from './components/SimulationControls';

// Note: QSphereView and ResultsPanel are in '@qamposer/react/visualization' (require plotly)

export type { CircuitEditorProps } from './components/CircuitEditor';
export type { OperationsProps } from './components/Operations';
export type { CodeEditorProps } from './components/CodeEditor';
export type { SimulationControlsProps } from './components/SimulationControls';

// =============================================================================
// CONTEXT & HOOKS
// =============================================================================
export { QamposerProvider } from './context/QamposerProvider';
export { useQamposer } from './hooks/useQamposer';

// =============================================================================
// THEME
// =============================================================================
export { ThemeProvider, useTheme } from './context/ThemeContext';
export type { Theme } from './context/ThemeContext';

// =============================================================================
// ADAPTERS - Backend simulation connectors
// =============================================================================
export { qiskitAdapter } from './adapters/qiskit';
export { noopAdapter } from './adapters/noop';
export { localAdapter } from './adapters/local';
export type { QiskitAdapterConfig } from './adapters/types';
export type { LocalAdapterConfig } from './adapters/local';

// =============================================================================
// TYPES - Core type definitions
// =============================================================================
export type {
  // Gate types
  Gate,
  GateType,
  GateInfo,
  // Circuit types
  Circuit,
  CircuitRequest,
  // Simulation types
  SimulationResult,
  SimulationCompleteEvent,
  QSpherePoint,
  SimulationAdapter,
  // Provider types
  QamposerProviderProps,
  QamposerContextValue,
  QamposerConfig,
  QasmParseResult,
} from './types';

// =============================================================================
// UTILITIES - Helper functions
// =============================================================================
export {
  circuitToQasm,
  qasmToCircuit,
  createDefaultCircuit,
  generateGateId,
} from './utils/openqasm';
