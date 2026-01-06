import { useContext } from 'react';
import { QamposerContext } from '../context/QamposerContext';
import type { QamposerContextValue } from '../types';

/**
 * Hook to access Qamposer context
 *
 * Must be used within a QamposerProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { circuit, addGate, simulate } = useQamposer();
 *
 *   return (
 *     <div>
 *       <p>Qubits: {circuit.qubits}</p>
 *       <p>Gates: {circuit.gates.length}</p>
 *       <button onClick={() => simulate(1024)}>Run</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useQamposer(): QamposerContextValue {
  const context = useContext(QamposerContext);

  if (context === null) {
    throw new Error(
      'useQamposer must be used within a QamposerProvider. ' +
        'Wrap your component tree with <QamposerProvider>.'
    );
  }

  return context;
}
