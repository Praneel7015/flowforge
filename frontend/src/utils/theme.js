import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'flowforge.theme';
const DEFAULT_THEME = 'dark';

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return DEFAULT_THEME;
}

function applyTheme(theme, animate = false) {
  const el = document.documentElement;

  if (animate) {
    el.classList.add('ff-theme-transitioning');
  }

  el.dataset.theme = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}

  if (animate) {
    setTimeout(() => el.classList.remove('ff-theme-transitioning'), 350);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
      return next;
    });
  }, []);

  const setTheme = useCallback((value) => {
    if (value === 'light' || value === 'dark') {
      applyTheme(value, true);
      setThemeState(value);
    }
  }, []);

  return { theme, toggleTheme, setTheme };
}
