import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function TriggerNode({ data, type, selected }) {
  const isMR = type === 'trigger_mr';
  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-white ring-slate-900/70 shadow-[0_0_0_1px_rgba(15,23,42,0.45)]'
    : '';

  return (
    <div
      className={`px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 min-w-[170px] ${selectedTone}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-emerald-700 text-lg">{isMR ? '⇌' : '↑'}</span>
        <div>
          <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">Trigger</div>
          <div className="text-sm text-slate-900 font-medium">{data.label}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3" />
    </div>
  );
}

export default memo(TriggerNode);
