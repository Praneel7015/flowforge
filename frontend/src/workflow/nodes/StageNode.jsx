import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const COLORS = {
  build: { border: 'border-sky-400/45', bg: 'bg-sky-500/10', text: 'text-sky-200', handle: '!bg-sky-400', icon: '⚙' },
  test: { border: 'border-amber-400/45', bg: 'bg-amber-500/10', text: 'text-amber-200', handle: '!bg-amber-400', icon: '✓' },
  security_scan: { border: 'border-rose-400/45', bg: 'bg-rose-500/10', text: 'text-rose-200', handle: '!bg-rose-400', icon: '⛨' },
  deploy: { border: 'border-indigo-400/45', bg: 'bg-indigo-500/10', text: 'text-indigo-200', handle: '!bg-indigo-400', icon: '▲' },
  notify: { border: 'border-pink-400/45', bg: 'bg-pink-500/10', text: 'text-pink-200', handle: '!bg-pink-400', icon: '✉' },
};

function StageNode({ data, type }) {
  const c = COLORS[type] || COLORS.build;

  return (
    <div className={`px-4 py-3 rounded-xl border ${c.border} ${c.bg} min-w-[170px] backdrop-blur-sm`}>
      <Handle type="target" position={Position.Top} className={`${c.handle} !w-3 !h-3`} />
      <div className="flex items-center gap-2">
        <span className={`${c.text} text-lg`}>{c.icon}</span>
        <div>
          <div className={`text-[10px] ${c.text} font-semibold uppercase tracking-wider`}>{type.replace('_', ' ')}</div>
          <div className="text-sm text-white font-medium">{data.label}</div>
        </div>
      </div>
      {data.config?.image && (
        <div className="mt-1 text-xs text-slate-400 ff-code">Image: {data.config.image}</div>
      )}
      <Handle type="source" position={Position.Bottom} className={`${c.handle} !w-3 !h-3`} />
    </div>
  );
}

export default memo(StageNode);
