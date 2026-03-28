import React from 'react';

const NODE_TYPES = [
  { type: 'trigger_push', label: 'Git Push Trigger', color: 'bg-green-600', icon: '↑' },
  { type: 'trigger_mr', label: 'Merge Request Trigger', color: 'bg-green-500', icon: '⇌' },
  { type: 'build', label: 'Build Stage', color: 'bg-blue-600', icon: '⚙' },
  { type: 'test', label: 'Unit Tests', color: 'bg-yellow-600', icon: '✓' },
  { type: 'security_scan', label: 'Security Scan', color: 'bg-red-600', icon: '⛨' },
  { type: 'deploy', label: 'Deploy', color: 'bg-purple-600', icon: '▲' },
  { type: 'notify', label: 'Notification', color: 'bg-pink-600', icon: '✉' },
  { type: 'conditional', label: 'Conditional Logic', color: 'bg-gray-600', icon: '◆' },
];

export default function Sidebar() {
  const onDragStart = (event, nodeType, label) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const nodeColorMap = {
    'bg-green-600': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    'bg-green-500': 'border-green-400/35 bg-green-500/10 text-green-100',
    'bg-blue-600': 'border-sky-500/40 bg-sky-500/10 text-sky-100',
    'bg-yellow-600': 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    'bg-red-600': 'border-rose-500/40 bg-rose-500/10 text-rose-100',
    'bg-purple-600': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-100',
    'bg-pink-600': 'border-pink-500/40 bg-pink-500/10 text-pink-100',
    'bg-gray-600': 'border-slate-500/40 bg-slate-500/10 text-slate-100',
  };

  return (
    <aside className="w-64 ff-surface p-4 overflow-y-auto ff-enter">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Pipeline Nodes
      </h2>
      <div className="space-y-2">
        {NODE_TYPES.map((node) => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => onDragStart(e, node.type, node.label)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing
              border ${nodeColorMap[node.color]} hover:brightness-110
              transition-all text-sm`}
          >
            <span className="text-base">{node.icon}</span>
            <span className="text-slate-100">{node.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-700/60">
        <p className="text-xs text-slate-400 leading-relaxed">
          Drag nodes onto the canvas to build your CI/CD pipeline. Connect them to define execution order.
        </p>
      </div>
    </aside>
  );
}
