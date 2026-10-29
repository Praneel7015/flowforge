import React, { useState, useEffect, useCallback } from 'react';
import {
  BUILT_IN_TEMPLATES,
  TEMPLATES_CHANGED_EVENT,
  readSavedTemplates,
  writeSavedTemplates,
} from './templateStore';

export default function NodeTemplates({ onLoadTemplate }) {
  const [savedTemplates, setSavedTemplates] = useState(readSavedTemplates);

  // Re-read when a template is saved from anywhere
  useEffect(() => {
    const handler = () => setSavedTemplates(readSavedTemplates());
    window.addEventListener(TEMPLATES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(TEMPLATES_CHANGED_EVENT, handler);
  }, []);

  const allTemplates = [...BUILT_IN_TEMPLATES, ...savedTemplates];

  const handleDelete = useCallback((id) => {
    const updated = savedTemplates.filter((t) => t.id !== id);
    setSavedTemplates(updated);
    writeSavedTemplates(updated);
  }, [savedTemplates]);

  return (
    <div className="space-y-1.5">
      {allTemplates.map((template) => (
        <div
          key={template.id}
          className="px-3 py-2 rounded-lg border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] hover:bg-[var(--ff-card-bg-hover)] hover:border-[var(--ff-card-border-hover)] transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => onLoadTemplate(template)}
              className="flex-1 text-left"
            >
              <p className="text-[13px] font-medium text-[var(--ff-text)]">{template.name}</p>
              <p className="text-[11px] text-[var(--ff-muted)] mt-0.5">{template.description}</p>
            </button>
            {!template.builtIn && (
              <button
                onClick={() => handleDelete(template.id)}
                className="text-[11px] text-[var(--ff-muted)] hover:text-[var(--ff-danger)] transition-colors flex-shrink-0"
                title="Delete template"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
      {allTemplates.length === 0 && (
        <p className="text-xs text-[var(--ff-muted)]">No templates available.</p>
      )}
    </div>
  );
}
