import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const COLORS = {
  build: { border: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-700', handle: '!bg-sky-500', icon: '⚙' },
  matrix_build: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', handle: '!bg-blue-500', icon: '☷' },
  lint: { border: 'border-cyan-200', bg: 'bg-cyan-50', text: 'text-cyan-700', handle: '!bg-cyan-500', icon: '≡' },
  test: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', handle: '!bg-amber-500', icon: '✓' },
  integration_test: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700', handle: '!bg-orange-500', icon: '⧉' },
  smoke_test: { border: 'border-lime-200', bg: 'bg-lime-50', text: 'text-lime-700', handle: '!bg-lime-500', icon: '◌' },
  cache_restore: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', handle: '!bg-emerald-500', icon: '⤓' },
  cache_save: { border: 'border-teal-200', bg: 'bg-teal-50', text: 'text-teal-700', handle: '!bg-teal-500', icon: '⤒' },
  security_scan: { border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700', handle: '!bg-rose-500', icon: '⛨' },
  package: { border: 'border-violet-200', bg: 'bg-violet-50', text: 'text-violet-700', handle: '!bg-violet-500', icon: '⬢' },
  release: { border: 'border-fuchsia-200', bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', handle: '!bg-fuchsia-500', icon: '✦' },
  approval_gate: { border: 'border-yellow-200', bg: 'bg-yellow-50', text: 'text-yellow-700', handle: '!bg-yellow-500', icon: '⌛' },
  deploy: { border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-700', handle: '!bg-indigo-500', icon: '▲' },
  canary_deploy: { border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-700', handle: '!bg-indigo-500', icon: '◔' },
  blue_green_deploy: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', handle: '!bg-blue-500', icon: '◐' },
  rollback: { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700', handle: '!bg-red-500', icon: '↺' },
  notify: { border: 'border-pink-200', bg: 'bg-pink-50', text: 'text-pink-700', handle: '!bg-pink-500', icon: '✉' },
};

function StageNode({ data, type, selected }) {
  const c = COLORS[type] || COLORS.build;
  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-white ring-slate-900/70 shadow-[0_0_0_1px_rgba(15,23,42,0.45)]'
    : '';

  return (
    <div className={`px-4 py-3 rounded-xl border ${c.border} ${c.bg} min-w-[170px] ${selectedTone}`}>
      <Handle type="target" position={Position.Top} className={`${c.handle} !w-3 !h-3`} />
      <div className="flex items-center gap-2">
        <span className={`${c.text} text-lg`}>{c.icon}</span>
        <div>
          <div className={`text-[10px] ${c.text} font-semibold uppercase tracking-wider`}>{type.replace('_', ' ')}</div>
          <div className="text-sm text-slate-900 font-medium">{data.label}</div>
        </div>
      </div>
      {data.config?.image && (
        <div className="mt-1 text-xs text-slate-600 ff-code">Image: {data.config.image}</div>
      )}
      <Handle type="source" position={Position.Bottom} className={`${c.handle} !w-3 !h-3`} />
    </div>
  );
}

export default memo(StageNode);
