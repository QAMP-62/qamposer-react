import { useEffect, useState, type RefObject } from 'react';

export type ThemeMode = 'light' | 'dark';

// Below this relative luminance a surface is treated as dark
const DARK_THRESHOLD = 0.4;

/**
 * Resolves whether an element is rendered on a light or a dark surface.
 *
 * Canvas-based views (Plotly) cannot use CSS variables, so they need the theme
 * as a value. The background is read from the DOM rather than from ThemeContext
 * so that components used standalone - or themed by overriding the CSS
 * variables, as documented in the README - resolve correctly too.
 */
export function useThemeMode(ref: RefObject<HTMLElement | null>): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resolve = () => {
      const luminance = surfaceLuminance(element);
      setMode(luminance !== null && luminance >= DARK_THRESHOLD ? 'light' : 'dark');
    };

    resolve();

    // ThemeProvider writes the CSS variables to <html>'s inline style
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    });

    return () => observer.disconnect();
  }, [ref]);

  return mode;
}

/** Relative luminance (0-1) of the nearest opaque background, or null if none. */
function surfaceLuminance(element: HTMLElement): number | null {
  let node: HTMLElement | null = element;

  while (node) {
    const rgb = parseRgb(window.getComputedStyle(node).backgroundColor);
    if (rgb) {
      const [r, g, b] = rgb;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }
    node = node.parentElement;
  }

  return null;
}

/** Parses `rgb()` / `rgba()` as returned by getComputedStyle. Transparent -> null. */
function parseRgb(color: string): [number, number, number] | null {
  const match = /^rgba?\(([^)]+)\)$/.exec(color.trim());
  if (!match) return null;

  const parts = match[1]
    .split(/[,/\s]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  if (parts.length > 3 && parts[3] === 0) return null;

  return [parts[0], parts[1], parts[2]];
}
