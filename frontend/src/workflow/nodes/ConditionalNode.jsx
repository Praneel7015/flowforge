import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function ConditionalNode({ data }) {
  return (
    <div className="px-4 py-3 rounded-xl border border-slate-400/45 bg-slate-500/10 min-w-[170px] backdrop-blur-sm">
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-slate-300 text-lg">◆</span>
        <div>
          <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wider">Condition</div>
          <div className="text-sm text-white font-medium">{data.label}</div>
        </div>
      </div>
      {data.config?.condition && (
        <div className="mt-1 text-xs text-slate-400 ff-code">{data.config.condition}</div>
      )}
      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-emerald-400 !w-3 !h-3 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-rose-400 !w-3 !h-3 !left-[70%]" />
    </div>
  );
}

export default memo(ConditionalNode);
