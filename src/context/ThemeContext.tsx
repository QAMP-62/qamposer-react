import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'qamposer-theme';

// CSS variable definitions for each theme
const themes: Record<Theme, Record<string, string>> = {
  dark: {
    '--qamposer-bg-primary': '#161616',
    '--qamposer-bg-secondary': '#262626',
    '--qamposer-bg-tertiary': '#1a1a1a',
    '--qamposer-text-primary': '#f4f4f4',
    '--qamposer-text-secondary': '#a8a8a8',
    '--qamposer-text-tertiary': '#6f6f6f',
    '--qamposer-border': '#525252',
    '--qamposer-border-strong': '#6f6f6f',
    '--qamposer-accent': '#4285f4',
    '--qamposer-accent-hover': '#3367d6',
    '--qamposer-hover': 'rgba(255, 255, 255, 0.1)',
    '--qamposer-selected': 'rgba(66, 133, 244, 0.2)',
    '--qamposer-error': '#da1e28',
  },
  light: {
    '--qamposer-bg-primary': '#ffffff',
    '--qamposer-bg-secondary': '#f4f4f4',
    '--qamposer-bg-tertiary': '#e8e8e8',
    '--qamposer-text-primary': '#161616',
    '--qamposer-text-secondary': '#525252',
    '--qamposer-text-tertiary': '#8d8d8d',
    '--qamposer-border': '#d1d1d1',
    '--qamposer-border-strong': '#a8a8a8',
    '--qamposer-accent': '#0f62fe',
    '--qamposer-accent-hover': '#0043ce',
    '--qamposer-hover': 'rgba(0, 0, 0, 0.05)',
    '--qamposer-selected': 'rgba(15, 98, 254, 0.1)',
    '--qamposer-error': '#da1e28',
  },
};

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    }
    return defaultTheme;
  });

  const applyTheme = useCallback((newTheme: Theme) => {
    const themeVars = themes[newTheme];
    Object.entries(themeVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, applyTheme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
