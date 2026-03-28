import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'flowforge.theme';
const DEFAULT_THEME = 'dark';

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Ignore storage read errors.
  }
  return DEFAULT_THEME;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage write errors.
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((value) => {
    if (value === 'light' || value === 'dark') {
      setThemeState(value);
    }
  }, []);

  return { theme, toggleTheme, setTheme };
}
