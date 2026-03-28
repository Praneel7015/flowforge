import React, { useEffect } from 'react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'Z'], action: 'Undo last action', section: 'Editor' },
  { keys: ['Ctrl', 'Y'], action: 'Redo last action', section: 'Editor' },
  { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo (alternate)', section: 'Editor' },
  { keys: ['Delete'], action: 'Delete selected nodes', section: 'Editor' },
  { keys: ['Backspace'], action: 'Delete selected nodes', section: 'Editor' },
  { keys: ['Right-click drag'], action: 'Box select multiple nodes', section: 'Editor' },
  { keys: ['Right-click node'], action: 'Open node config panel', section: 'Editor' },
  { keys: ['Enter'], action: 'Add focused sidebar node to canvas', section: 'Sidebar' },
  { keys: ['?'], action: 'Toggle this shortcuts panel', section: 'Global' },
];

function groupBySection(shortcuts) {
  const groups = {};
  for (const s of shortcuts) {
    if (!groups[s.section]) groups[s.section] = [];
    groups[s.section].push(s);
  }
  return groups;
}

export default function KeyboardShortcuts({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const grouped = groupBySection(SHORTCUTS);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ff-overlay)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--ff-modal-bg)] border border-[var(--ff-border-strong)] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[var(--ff-text)]">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-xs text-[var(--ff-muted)] hover:text-[var(--ff-text)] transition-colors"
          >
            Close
          </button>
        </div>

        <div className="space-y-5">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <p className="text-xs uppercase tracking-widest text-[var(--ff-muted)] font-medium mb-2">{section}</p>
              <div className="space-y-2">
                {items.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--ff-text-secondary)]">{shortcut.action}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <kbd
                          key={j}
                          className="px-2 py-0.5 rounded-md text-xs font-mono bg-[var(--ff-card-bg)] border border-[var(--ff-border-strong)] text-[var(--ff-text-secondary)]"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs text-[var(--ff-muted)]">
          Press <kbd className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--ff-card-bg)] border border-[var(--ff-border-strong)]">?</kbd> or <kbd className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--ff-card-bg)] border border-[var(--ff-border-strong)]">Esc</kbd> to close.
        </p>
      </div>
    </div>
  );
}
