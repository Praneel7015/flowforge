import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function TriggerNode({ data, type, selected }) {
  const isMR = type === 'trigger_mr';
  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-[var(--ff-ring-offset)] ring-[var(--ff-accent)] shadow-none'
    : '';

  return (
    <div
      className={`px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 min-w-[170px] ${selectedTone}`}
    >
      <div className="flex items-center gap-2">
        <div>
          <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Trigger</div>
          <div className="text-sm text-[var(--ff-text)] font-medium">{data.label}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3" />
    </div>
  );
}

export default memo(TriggerNode);
