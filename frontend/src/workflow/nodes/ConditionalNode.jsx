import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function ConditionalNode({ data, selected }) {
  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-white ring-slate-900/70 shadow-[0_0_0_1px_rgba(15,23,42,0.45)]'
    : '';

  return (
    <div className={`px-4 py-3 rounded-xl border border-slate-300 bg-slate-100 min-w-[170px] ${selectedTone}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-slate-700 text-lg">◆</span>
        <div>
          <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Condition</div>
          <div className="text-sm text-slate-900 font-medium">{data.label}</div>
        </div>
      </div>
      {data.config?.condition && (
        <div className="mt-1 text-xs text-slate-600 ff-code">{data.config.condition}</div>
      )}
      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-emerald-500 !w-3 !h-3 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-rose-500 !w-3 !h-3 !left-[70%]" />
    </div>
  );
}

export default memo(ConditionalNode);
