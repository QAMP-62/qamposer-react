/**
 * No-operation adapter for editor-only mode
 *
 * Use this adapter when you only need the circuit editor
 * without simulation capabilities.
 */

import type { SimulationAdapter } from '../types';

/**
 * No-op adapter that disables simulation
 *
 * @example
 * ```tsx
 * import { QamposerProvider, QamposerMicro, noopAdapter } from '@qamposer/react';
 *
 * // Editor-only mode - RunButton will be disabled
 * <QamposerProvider adapter={noopAdapter}>
 *   <QamposerMicro />
 * </QamposerProvider>
 * ```
 */
export const noopAdapter: SimulationAdapter = {
  name: 'Editor Only',

  async simulate(): Promise<never> {
    throw new Error(
      'Simulation is not available in editor-only mode. ' +
        'Provide a simulation adapter to enable this feature.'
    );
  },

  async isAvailable(): Promise<boolean> {
    return false;
  },
};
