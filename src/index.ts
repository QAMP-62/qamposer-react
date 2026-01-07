/**
 * @qamposer/react - Embeddable Quantum Circuit Composer for React
 *
 * A modular React component library for building quantum circuit editors
 * with simulation capabilities.
 */

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export { Qamposer } from './presets';
export type { QamposerProps } from './presets';

// =============================================================================
// CORE COMPONENTS - Individual building blocks
// =============================================================================
export {
  CircuitEditor,
  Operations,
  ResultsPanel,
  QSphereView,
  CodeEditor,
  SimulationControls,
} from './components';

export type {
  CircuitEditorProps,
  OperationsProps,
  ResultsPanelProps,
  QSphereViewProps,
  CodeEditorProps,
  SimulationControlsProps,
} from './components';

// =============================================================================
// CONTEXT & HOOKS
// =============================================================================
export { QamposerProvider, useQamposer } from './context';
export { useQamposer as useQamposerContext } from './hooks'; // alias

// =============================================================================
// THEME
// =============================================================================
export { ThemeProvider, useTheme } from './context';
export type { Theme } from './context';

// =============================================================================
// ADAPTERS - Backend simulation connectors
// =============================================================================
export { qiskitAdapter, noopAdapter } from './adapters';
export type { QiskitAdapterConfig } from './adapters';

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
export { circuitToQasm, qasmToCircuit, createDefaultCircuit, generateGateId } from './utils';
