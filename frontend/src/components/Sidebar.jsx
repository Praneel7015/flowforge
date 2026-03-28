import React from 'react';

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

export default function Sidebar({ featureFlags }) {
  const onDragStart = (event, nodeType, label) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const showAdvancedNodes = featureFlags?.advancedNodes !== false;
  const visibleNodeTypes = showAdvancedNodes
    ? NODE_TYPES
    : NODE_TYPES.filter((node) => !node.advanced);

  const nodeColorMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    lime: 'bg-lime-50 text-lime-700 border-lime-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    pink: 'bg-pink-50 text-pink-700 border-pink-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <aside className="ff-surface h-full p-4 overflow-y-auto ff-enter">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.14em] mb-4">
        Node Library
      </h2>
      <div className="space-y-2.5">
        {visibleNodeTypes.map((node) => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => onDragStart(e, node.type, node.label)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing
              border border-slate-200 bg-white hover:border-slate-300 transition-all text-sm"
          >
            <span
              className={`w-7 h-7 rounded-lg border text-sm flex items-center justify-center ${
                nodeColorMap[node.tone] || nodeColorMap.slate
              }`}
            >
              {node.icon}
            </span>
            <span className="text-slate-700 font-medium">{node.label}</span>
          </div>
        ))}
      </div>

      {!showAdvancedNodes && (
        <p className="mt-3 text-[11px] text-slate-500">
          Advanced nodes are disabled by feature flag.
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-500 leading-relaxed">
          Drag nodes onto the canvas to build your CI/CD pipeline. Connect them to define execution order.
        </p>
      </div>
    </aside>
  );
}
