import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'flowforge.theme';
const THEME_EVENT = 'flowforge:theme-change';
const DEFAULT_THEME = 'dark';

function getStoredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* storage unavailable */ }
  const domTheme = document.documentElement?.dataset?.theme;
  if (domTheme === 'light' || domTheme === 'dark') return domTheme;
  return DEFAULT_THEME;
}

function applyTheme(theme, animate = false) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;

  if (animate) {
    el.classList.add('ff-theme-transitioning');
  }

  el.dataset.theme = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* storage unavailable */ }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
  }

  if (animate) {
    setTimeout(() => el.classList.remove('ff-theme-transitioning'), 350);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);

  useEffect(() => {
    const current = getStoredTheme();
    if (document.documentElement.dataset.theme !== current) {
      applyTheme(current, false);
    }
    setThemeState(current);

    const handleThemeChange = (event) => {
      const next = event?.detail?.theme || getStoredTheme();
      if (next === 'light' || next === 'dark') {
        setThemeState(next);
      }
    };

    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY) {
        const next = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : DEFAULT_THEME;
        document.documentElement.dataset.theme = next;
        setThemeState(next);
      }
    };

    window.addEventListener(THEME_EVENT, handleThemeChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const current = getStoredTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    applyTheme(next, true);
  }, []);

  const setTheme = useCallback((value) => {
    if (value === 'light' || value === 'dark') {
      setThemeState(value);
      applyTheme(value, true);
    }
  }, []);

  return { theme, toggleTheme, setTheme };
}
