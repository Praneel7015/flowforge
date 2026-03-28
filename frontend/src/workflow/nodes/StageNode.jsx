import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const COLORS = {
  build: { border: 'border-sky-500/30', bg: 'bg-sky-500/10', text: 'text-sky-400', handle: '!bg-sky-400' },
  matrix_build: { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400', handle: '!bg-blue-400' },
  lint: { border: 'border-cyan-500/30', bg: 'bg-cyan-500/10', text: 'text-cyan-400', handle: '!bg-cyan-400' },
  test: { border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-400', handle: '!bg-amber-400' },
  integration_test: { border: 'border-orange-500/30', bg: 'bg-orange-500/10', text: 'text-orange-400', handle: '!bg-orange-400' },
  smoke_test: { border: 'border-lime-500/30', bg: 'bg-lime-500/10', text: 'text-lime-400', handle: '!bg-lime-400' },
  cache_restore: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', handle: '!bg-emerald-400' },
  cache_save: { border: 'border-teal-500/30', bg: 'bg-teal-500/10', text: 'text-teal-400', handle: '!bg-teal-400' },
  security_scan: { border: 'border-rose-500/30', bg: 'bg-rose-500/10', text: 'text-rose-400', handle: '!bg-rose-400' },
  package: { border: 'border-violet-500/30', bg: 'bg-violet-500/10', text: 'text-violet-400', handle: '!bg-violet-400' },
  release: { border: 'border-fuchsia-500/30', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', handle: '!bg-fuchsia-400' },
  approval_gate: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', text: 'text-yellow-400', handle: '!bg-yellow-400' },
  deploy: { border: 'border-indigo-500/30', bg: 'bg-indigo-500/10', text: 'text-indigo-400', handle: '!bg-indigo-400' },
  canary_deploy: { border: 'border-indigo-500/30', bg: 'bg-indigo-500/10', text: 'text-indigo-400', handle: '!bg-indigo-400' },
  blue_green_deploy: { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400', handle: '!bg-blue-400' },
  rollback: { border: 'border-red-500/30', bg: 'bg-red-500/10', text: 'text-red-400', handle: '!bg-red-400' },
  notify: { border: 'border-pink-500/30', bg: 'bg-pink-500/10', text: 'text-pink-400', handle: '!bg-pink-400' },
};

function StageNode({ data, type, selected }) {
  const c = COLORS[type] || COLORS.build;
  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-[var(--ff-ring-offset)] ring-[var(--ff-accent)] shadow-none'
    : '';

  return (
    <div className={`px-4 py-3 rounded-xl border ${c.border} ${c.bg} min-w-[170px] ${selectedTone}`}>
      <Handle type="target" position={Position.Top} className={`${c.handle} !w-3 !h-3`} />
      <div className="flex items-center gap-2">
        <div>
          <div className={`text-xs ${c.text} font-semibold uppercase tracking-wider`}>{type.replace('_', ' ')}</div>
          <div className="text-sm text-[var(--ff-text)] font-medium">{data.label}</div>
        </div>
      </div>
      {data.config?.image && (
        <div className="mt-1 text-xs text-[var(--ff-text-secondary)] ff-code">Image: {data.config.image}</div>
      )}
      <Handle type="source" position={Position.Bottom} className={`${c.handle} !w-3 !h-3`} />
    </div>
  );
}

export default memo(StageNode);
