import { createContext } from 'react';
import type { QamposerContextValue } from '../types';

export const QamposerContext = createContext<QamposerContextValue | null>(null);
