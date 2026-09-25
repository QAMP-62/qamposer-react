import { useContext, useEffect, type ReactNode } from 'react';
import { QamposerContext } from '../context/QamposerContext';
import { QamposerProvider } from '../context/QamposerProvider';
import { ThemeProvider, useOptionalTheme, type Theme } from '../context/ThemeContext';
import type { QamposerProviderProps } from '../types';

type PresetProviderProps = Omit<QamposerProviderProps, 'children'>;

interface PresetProvidersProps {
  /** Preset name used in warnings */
  presetName: string;
  defaultTheme: Theme;
  providerProps: PresetProviderProps;
  children: ReactNode;
}

/**
 * Wraps a preset in ThemeProvider / QamposerProvider unless the app already
 * provides them. Reusing an outer QamposerProvider lets sibling components
 * share the preset's state through useQamposer().
 */
export function PresetProviders({
  presetName,
  defaultTheme,
  providerProps,
  children,
}: PresetProvidersProps) {
  const outerQamposer = useContext(QamposerContext);
  const outerTheme = useOptionalTheme();

  const ignoredProps = outerQamposer
    ? Object.keys(providerProps).filter(
        (key) => providerProps[key as keyof PresetProviderProps] !== undefined
      )
    : [];
  const ignoredPropsKey = ignoredProps.join(', ');

  useEffect(() => {
    if (ignoredPropsKey) {
      console.warn(
        `<${presetName}> is inside a <QamposerProvider>, so these props are ignored: ` +
          `${ignoredPropsKey}. Pass them to the outer <QamposerProvider> instead.`
      );
    }
  }, [presetName, ignoredPropsKey]);

  const content = outerQamposer ? (
    children
  ) : (
    <QamposerProvider {...providerProps}>{children}</QamposerProvider>
  );

  return outerTheme ? (
    content
  ) : (
    <ThemeProvider defaultTheme={defaultTheme}>{content}</ThemeProvider>
  );
}
