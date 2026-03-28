import React, { useState, useEffect } from 'react';

const STAGE_CONFIGS = {
  build: ['image', 'script', 'stage'],
  matrix_build: ['image', 'script', 'stage', 'matrix'],
  lint: ['image', 'script', 'stage'],
  test: ['image', 'script', 'stage'],
  integration_test: ['image', 'script', 'stage'],
  smoke_test: ['image', 'script', 'stage'],
  cache_restore: ['image', 'script', 'stage', 'cacheKey', 'cachePaths'],
  cache_save: ['image', 'script', 'stage', 'cacheKey', 'cachePaths'],
  security_scan: ['image', 'script', 'stage'],
  package: ['image', 'script', 'stage', 'artifactPath'],
  release: ['image', 'script', 'stage', 'tag'],
  approval_gate: ['stage', 'environment', 'approver'],
  deploy: ['image', 'script', 'stage', 'environment'],
  canary_deploy: ['image', 'script', 'stage', 'environment', 'trafficPercent'],
  blue_green_deploy: ['image', 'script', 'stage', 'environment', 'activeColor'],
  rollback: ['image', 'script', 'stage', 'environment'],
  notify: ['script', 'stage', 'channel'],
  conditional: ['condition'],
  trigger_push: ['branch'],
  trigger_mr: ['targetBranch'],
};

const FIELD_PLACEHOLDERS = {
  image: 'node:20-alpine',
  stage: 'build',
  matrix: '{"NODE_VERSION":["18","20"],"OS":["ubuntu-latest"]}',
  cacheKey: 'deps-${branch}',
  cachePaths: 'node_modules/, .pnpm-store/',
  artifactPath: 'dist/',
  environment: 'production',
  approver: 'team-leads',
  trafficPercent: '10',
  activeColor: 'green',
  tag: 'v1.0.0',
  channel: '#deployments',
  condition: 'branch == main',
  branch: 'main',
  targetBranch: 'main',
};

export default function NodeConfigPanel({ node, onSave, onClose, onDelete }) {
  const [config, setConfig] = useState(node.data.config || {});
  const fields = STAGE_CONFIGS[node.type] || ['script'];

  useEffect(() => {
    setConfig(node.data.config || {});
  }, [node]);

  const handleChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="absolute top-4 left-4 w-80 ff-surface shadow-[0_20px_40px_rgba(15,23,42,0.18)] z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{node.data.label}</h3>
          <span className="text-xs text-slate-500 ff-code">{node.type}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-800 text-sm">
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        {fields.map((field) => (
          <div key={field}>
            <label className="block text-xs text-slate-500 mb-1 capitalize">{field}</label>
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
                placeholder={FIELD_PLACEHOLDERS[field] || ''}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 px-4 py-3 border-t border-slate-200">
        <button
          onClick={() => onDelete?.(node.id)}
          className="px-4 py-2 rounded-lg text-sm transition-colors bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100"
        >
          Delete
        </button>
        <button
          onClick={() => onSave(node.id, config)}
          className="flex-1 py-2 rounded-lg text-sm font-medium transition-opacity ff-btn-primary"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm transition-colors ff-btn-secondary hover:border-slate-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
