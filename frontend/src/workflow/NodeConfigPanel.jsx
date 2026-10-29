import React, { useState, useEffect } from 'react';
import { toCommandList } from '../utils/scriptCommands';

const STAGE_CONFIGS = {
  build: ['image', 'stage', 'script'],
  matrix_build: ['image', 'stage', 'matrix', 'script'],
  lint: ['image', 'stage', 'script'],
  test: ['image', 'stage', 'script'],
  integration_test: ['image', 'stage', 'script'],
  smoke_test: ['image', 'stage', 'script'],
  cache_restore: ['image', 'stage', 'cacheKey', 'cachePaths', 'script'],
  cache_save: ['image', 'stage', 'cacheKey', 'cachePaths', 'script'],
  security_scan: ['image', 'stage', 'script'],
  package: ['image', 'stage', 'artifactPath', 'script'],
  release: ['image', 'stage', 'tag', 'script'],
  approval_gate: ['stage', 'environment', 'approver', 'script'],
  deploy: ['image', 'stage', 'environment', 'script'],
  canary_deploy: ['image', 'stage', 'environment', 'trafficPercent', 'script'],
  blue_green_deploy: ['image', 'stage', 'environment', 'activeColor', 'script'],
  rollback: ['image', 'stage', 'environment', 'script'],
  notify: ['stage', 'channel', 'script'],
  conditional: ['condition'],
  trigger_push: ['branch'],
  trigger_mr: ['targetBranch'],
};

const FIELD_LABELS = {
  image: 'Container Image',
  stage: 'Pipeline Stage',
  script: 'Shell Script / Commands',
  matrix: 'Matrix Strategy (JSON)',
  cacheKey: 'Cache Key',
  cachePaths: 'Cache Paths (comma-separated)',
  artifactPath: 'Artifact Output Path',
  environment: 'Target Environment',
  approver: 'Required Approver / Group',
  trafficPercent: 'Canary Traffic %',
  activeColor: 'Active Stack Color',
  tag: 'Release Tag',
  channel: 'Notification Channel',
  condition: 'Condition Expression',
  branch: 'Trigger Branch',
  targetBranch: 'Target Merge Branch',
};

const FIELD_PLACEHOLDERS = {
  image: 'node:20-alpine',
  stage: 'build',
  matrix: '{"NODE_VERSION":["18","20"],"OS":["ubuntu-latest"]}',
  cacheKey: 'deps-${CI_COMMIT_REF_SLUG}',
  cachePaths: 'node_modules/, .pnpm-store/',
  artifactPath: 'dist/',
  environment: 'production',
  approver: 'release-managers',
  trafficPercent: '10',
  activeColor: 'green',
  tag: 'v1.0.0',
  channel: '#deployments',
  condition: '$CI_COMMIT_BRANCH == "main"',
  branch: 'main',
  targetBranch: 'main',
};

const SCRIPT_PRESETS = {
  build: ['npm ci && npm run build', 'pnpm install --frozen-lockfile && pnpm build', 'docker build -t app:$CI_COMMIT_SHA .'],
  lint: ['npm run lint', 'npx eslint . --max-warnings=0', 'ruff check .'],
  test: ['npm test -- --ci', 'pytest --maxfail=1 -q', 'go test -race ./...'],
  security_scan: ['npm audit --audit-level=high', 'trivy fs --exit-code 1 .', 'semgrep ci'],
  deploy: ['npx vercel --prod --token=$VERCEL_TOKEN', 'kubectl rollout restart deployment/app', './scripts/deploy.sh production'],
};

/**
 * Editor for a script stored as a list of commands. Each command gets its own
 * box, so the line breaks inside an `if ...; then ... fi` block stay part of
 * that one command instead of being read as separate commands.
 */
function ScriptCommandList({ commands, onChange, placeholder }) {
  const update = (index, value) => onChange(commands.map((cmd, i) => (i === index ? value : cmd)));
  const remove = (index) => {
    const next = commands.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : '');
  };

  return (
    <div className="space-y-1.5">
      {commands.map((command, index) => (
        <div key={index} className="flex items-start gap-1">
          <textarea
            value={typeof command === 'string' ? command : ''}
            onChange={(e) => update(index, e.target.value)}
            rows={Math.min(8, Math.max(2, String(command).split('\n').length))}
            aria-label={`Command ${index + 1}`}
            className="ff-input px-3 py-2 text-xs ff-code leading-relaxed resize-y"
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={`Remove command ${index + 1}`}
            className="w-6 h-6 mt-1 flex-shrink-0 rounded flex items-center justify-center text-[var(--ff-muted)] hover:text-red-400 hover:bg-red-500/10 text-xs transition-colors"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default function NodeConfigPanel({ node, onUpdate, onSave, onClose, onDelete }) {
  const [config, setConfig] = useState(node.data.config || {});
  const [label, setLabel] = useState(node.data.label || '');
  const fields = STAGE_CONFIGS[node.type] || ['image', 'stage', 'script'];
  const presets = SCRIPT_PRESETS[node.type] || [];

  useEffect(() => {
    setConfig(node.data.config || {});
    setLabel(node.data.label || '');
  }, [node.id]);

  const handleLabelChange = (nextLabel) => {
    setLabel(nextLabel);
    onUpdate?.(node.id, config, nextLabel.trim() || node.data.label || node.type);
  };

  const handleFieldChange = (key, value) => {
    const nextConfig = { ...config, [key]: value };
    setConfig(nextConfig);
    onUpdate?.(node.id, nextConfig, label.trim() || node.data.label || node.type);
  };

  const handleDone = () => {
    const trimmed = label.trim();
    onSave?.(node.id, config, trimmed || node.data.label || node.type);
  };

  return (
    <div
      className="nodrag nopan absolute top-4 left-4 w-80 sm:w-96 max-h-[calc(100%-5rem)] flex flex-col bg-[var(--ff-modal-bg)] border border-[var(--ff-card-border-strong)] rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl z-20 overflow-hidden ff-enter"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ff-card-border)] bg-[var(--ff-surface)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ff-text)] truncate">
              Node Inspector
            </h3>
          </div>
          <span className="text-[11px] text-[var(--ff-muted)] ff-code">{node.type} · Live Sync</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close node configuration"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--ff-muted)] mb-1">
            Step / Job Name
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="ff-input px-3 py-2 text-sm font-medium"
            placeholder="Block name (e.g. Build & Test)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDone();
            }}
          />
        </div>

        {fields.map((field) => (
          <div key={field}>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--ff-muted)] mb-1">
              {FIELD_LABELS[field] || field}
            </label>
            {field === 'script' ? (
              <div className="space-y-1.5">
                {Array.isArray(config.script) ? (
                  <ScriptCommandList
                    commands={config.script}
                    onChange={(next) => handleFieldChange('script', next)}
                    placeholder={`echo "Running ${label || node.data.label}"`}
                  />
                ) : (
                  <textarea
                    value={config[field] || ''}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    rows={4}
                    className="ff-input px-3 py-2 text-xs ff-code leading-relaxed resize-y"
                    placeholder={`echo "Running ${label || node.data.label}"`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    // A one-command-per-line string becomes a list first, so its
                    // commands keep their meaning next to the new multi-line one.
                    const current = Array.isArray(config.script) ? config.script : toCommandList(config.script);
                    handleFieldChange('script', [...current, '']);
                  }}
                  className="text-[10px] ff-code px-2 py-0.5 rounded border border-dashed border-[var(--ff-card-border-strong)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:border-[var(--ff-accent)] transition-colors"
                  title="Add a command that can span several lines, such as an if/fi block"
                >
                  + Multi-line command
                </button>
                {presets.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {presets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleFieldChange('script', preset)}
                        className="text-[10px] ff-code px-2 py-0.5 rounded border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:border-[var(--ff-accent)] transition-colors truncate max-w-full"
                        title={`Use preset: ${preset}`}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                value={config[field] || ''}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                className="ff-input px-3 py-2 text-xs ff-code"
                placeholder={FIELD_PLACEHOLDERS[field] || ''}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--ff-card-border)] bg-[var(--ff-surface)]">
        <button
          onClick={() => onDelete?.(node.id)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
        >
          Delete Node
        </button>
        <span className="text-[11px] text-[var(--ff-muted)] ml-auto">Changes auto-sync to YAML</span>
        <button
          onClick={handleDone}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-opacity ff-btn-primary"
        >
          Done
        </button>
      </div>
    </div>
  );
}
