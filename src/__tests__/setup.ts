import '@testing-library/jest-dom/vitest';

// happy-dom and Node 22+'s experimental global `localStorage` don't cooperate:
// Node's native `localStorage` getter returns undefined (with a warning) unless
// `--localstorage-file` is passed, and it shadows the implementation happy-dom
// would otherwise provide. Install a minimal in-memory Storage for tests so
// components that persist to localStorage (e.g. ThemeProvider) work on every
// Node version in CI.
function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  let usable = false;
  try {
    const existing = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
    if (existing) {
      existing.setItem('__probe__', '1');
      existing.removeItem('__probe__');
      usable = true;
    }
  } catch {
    usable = false;
  }
  if (usable) return;

  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: storage,
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
