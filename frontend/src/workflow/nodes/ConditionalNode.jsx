import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function ConditionalNode({ data, selected }) {
  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-[var(--ff-ring-offset)] ring-emerald-400/60 shadow-none'
    : '';

  return (
    <div className={`px-4 py-3 rounded-xl border border-slate-500/30 bg-slate-500/10 min-w-[170px] ${selectedTone}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-[var(--ff-text-secondary)] text-lg">◆</span>
        <div>
          <div className="text-xs text-[var(--ff-text-secondary)] font-semibold uppercase tracking-wider">Condition</div>
          <div className="text-sm text-[var(--ff-text)] font-medium">{data.label}</div>
        </div>
      </div>
      {data.config?.condition && (
        <div className="mt-1 text-xs text-[var(--ff-text-secondary)] ff-code">{data.config.condition}</div>
      )}
      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-emerald-500 !w-3 !h-3 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-rose-500 !w-3 !h-3 !left-[70%]" />
    </div>
  );
}

export default memo(ConditionalNode);
