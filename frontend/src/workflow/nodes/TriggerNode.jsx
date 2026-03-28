import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function TriggerNode({ data, type }) {
  const isMR = type === 'trigger_mr';

  return (
    <div className="px-4 py-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 min-w-[170px] backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="text-emerald-300 text-lg">{isMR ? '⇌' : '↑'}</span>
        <div>
          <div className="text-[10px] text-emerald-200 font-semibold uppercase tracking-wider">Trigger</div>
          <div className="text-sm text-white font-medium">{data.label}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400 !w-3 !h-3" />
    </div>
  );
}

export default memo(TriggerNode);
