import React, { useState, useEffect } from 'react';

const STAGE_CONFIGS = {
  build: ['image', 'script', 'stage'],
  test: ['image', 'script', 'stage'],
  security_scan: ['image', 'script', 'stage'],
  deploy: ['image', 'script', 'stage', 'environment'],
  notify: ['script', 'stage', 'channel'],
  conditional: ['condition'],
  trigger_push: ['branch'],
  trigger_mr: ['targetBranch'],
};

export default function NodeConfigPanel({ node, onSave, onClose }) {
  const [config, setConfig] = useState(node.data.config || {});
  const fields = STAGE_CONFIGS[node.type] || ['script'];

  useEffect(() => {
    setConfig(node.data.config || {});
  }, [node]);

  const handleChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="absolute top-4 left-4 w-80 ff-surface shadow-2xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/70">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{node.data.label}</h3>
          <span className="text-xs text-slate-500 ff-code">{node.type}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        {fields.map((field) => (
          <div key={field}>
            <label className="block text-xs text-slate-400 mb-1 capitalize">{field}</label>
            {field === 'script' ? (
              <textarea
                value={config[field] || ''}
                onChange={(e) => handleChange(field, e.target.value)}
                rows={3}
                className="ff-input px-3 py-2 text-sm ff-code resize-none"
                placeholder={`echo "Running ${node.data.label}"`}
              />
            ) : (
              <input
                type="text"
                value={config[field] || ''}
                onChange={(e) => handleChange(field, e.target.value)}
                className="ff-input px-3 py-2 text-sm"
                placeholder={field === 'image' ? 'node:18-alpine' : ''}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 px-4 py-3 border-t border-slate-700/70">
        <button
          onClick={() => onSave(node.id, config)}
          className="flex-1 py-2 rounded-lg text-sm font-medium transition-opacity ff-btn-primary hover:opacity-90"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm transition-colors ff-btn-secondary hover:border-slate-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
