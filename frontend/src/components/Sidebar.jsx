import React, { useCallback } from 'react';

const NODE_TYPES = [
  { type: 'trigger_push', label: 'Git Push Trigger', tone: 'emerald', icon: '↑' },
  { type: 'trigger_mr', label: 'Merge Request Trigger', tone: 'green', icon: '⇌' },
  { type: 'build', label: 'Build Stage', tone: 'sky', icon: '⚙' },
  { type: 'matrix_build', label: 'Matrix Build', tone: 'blue', icon: '☷', advanced: true },
  { type: 'lint', label: 'Lint / Static Analysis', tone: 'cyan', icon: '≡' },
  { type: 'test', label: 'Unit Tests', tone: 'amber', icon: '✓' },
  { type: 'integration_test', label: 'Integration Tests', tone: 'orange', icon: '⧉' },
  { type: 'smoke_test', label: 'Smoke Tests', tone: 'lime', icon: '◌' },
  { type: 'cache_restore', label: 'Cache Restore', tone: 'emerald', icon: '⤓', advanced: true },
  { type: 'cache_save', label: 'Cache Save', tone: 'teal', icon: '⤒', advanced: true },
  { type: 'security_scan', label: 'Security Scan', tone: 'rose', icon: '⛨' },
  { type: 'package', label: 'Package Artifact', tone: 'violet', icon: '⬢' },
  { type: 'release', label: 'Release', tone: 'fuchsia', icon: '✦' },
  { type: 'approval_gate', label: 'Approval Gate', tone: 'yellow', icon: '⌛', advanced: true },
  { type: 'deploy', label: 'Deploy', tone: 'indigo', icon: '▲' },
  { type: 'canary_deploy', label: 'Canary Deploy', tone: 'indigo', icon: '◔', advanced: true },
  { type: 'blue_green_deploy', label: 'Blue/Green Deploy', tone: 'blue', icon: '◐', advanced: true },
  { type: 'rollback', label: 'Rollback', tone: 'red', icon: '↺' },
  { type: 'notify', label: 'Notification', tone: 'pink', icon: '✉' },
  { type: 'conditional', label: 'Conditional Logic', tone: 'slate', icon: '◆' },
];

export default function Sidebar({ featureFlags, onAddNode }) {
  const onDragStart = (event, nodeType, label) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleKeyDown = useCallback(
    (event, nodeType, label) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onAddNode?.(nodeType, label);
      }
    },
    [onAddNode]
  );

  const showAdvancedNodes = featureFlags?.advancedNodes !== false;
  const visibleNodeTypes = showAdvancedNodes
    ? NODE_TYPES
    : NODE_TYPES.filter((node) => !node.advanced);

  const nodeColorMap = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    green: 'bg-green-500/15 text-green-400 border-green-500/20',
    sky: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    orange: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    lime: 'bg-lime-500/15 text-lime-400 border-lime-500/20',
    teal: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    fuchsia: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    indigo: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    pink: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
    slate: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };

  const nodeAccentMap = {
    emerald: 'border-l-emerald-500',
    green: 'border-l-green-500',
    sky: 'border-l-sky-500',
    blue: 'border-l-blue-500',
    cyan: 'border-l-cyan-500',
    amber: 'border-l-amber-500',
    orange: 'border-l-orange-500',
    lime: 'border-l-lime-500',
    teal: 'border-l-teal-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
    fuchsia: 'border-l-fuchsia-500',
    yellow: 'border-l-yellow-500',
    indigo: 'border-l-indigo-500',
    red: 'border-l-red-500',
    pink: 'border-l-pink-500',
    slate: 'border-l-slate-500',
  };

  return (
    <aside className="h-full p-4 overflow-y-auto ff-enter bg-[var(--ff-card-bg)] backdrop-blur-xl border-r border-[var(--ff-card-border)]">
      <h2 className="text-xs font-semibold text-[var(--ff-muted)] uppercase tracking-[0.14em] mb-4">
        Node Library
      </h2>
      <div className="space-y-2.5">
        {visibleNodeTypes.map((node) => (
          <div
            key={node.type}
            role="button"
            tabIndex={0}
            aria-label={`Add ${node.label} node to canvas`}
            draggable
            onDragStart={(e) => onDragStart(e, node.type, node.label)}
            onKeyDown={(e) => handleKeyDown(e, node.type, node.label)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing
              border border-[var(--ff-card-border)] border-l-2 ${nodeAccentMap[node.tone] || nodeAccentMap.slate}
              bg-[var(--ff-card-bg)] hover:bg-[var(--ff-card-bg-hover)] hover:border-[var(--ff-card-border-hover)]
              focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent
              transition-all text-sm backdrop-blur-sm`}
          >
            <span
              className={`w-7 h-7 rounded-lg border text-sm flex items-center justify-center ${
                nodeColorMap[node.tone] || nodeColorMap.slate
              }`}
            >
              {node.icon}
            </span>
            <span className="text-[var(--ff-text-secondary)] font-medium">{node.label}</span>
          </div>
        ))}
      </div>

      {!showAdvancedNodes && (
        <p className="mt-3 text-xs text-[var(--ff-muted)]">
          Advanced nodes are disabled by feature flag.
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-[var(--ff-card-border)]">
        <p className="text-xs text-[var(--ff-muted)] leading-relaxed">
          Drag nodes onto the canvas or press Enter to add them. Connect nodes to define execution order.
        </p>
      </div>
    </aside>
  );
}
