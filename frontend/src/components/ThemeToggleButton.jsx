import React from 'react';
import { useTheme } from '../utils/theme';

export default function ThemeToggleButton({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`ff-theme-toggle${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
    >
      <span
        className={
          theme === 'light' ? 'ff-theme-toggle-mark ff-theme-toggle-mark-active' : 'ff-theme-toggle-mark'
        }
        aria-hidden
      >
        {'\u263C\uFE0E'}
      </span>
      <span
        className={
          theme === 'dark' ? 'ff-theme-toggle-mark ff-theme-toggle-mark-active' : 'ff-theme-toggle-mark'
        }
        aria-hidden
      >
        {'\u263D\uFE0E'}
      </span>
    </button>
  );
}
