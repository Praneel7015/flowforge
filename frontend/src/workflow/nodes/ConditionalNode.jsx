import React, { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';

function ConditionalNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  const [draftCondition, setDraftCondition] = useState(data.config?.condition || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setDraftCondition(data.config?.condition || '');
  }, [data.config?.condition]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitCondition = () => {
    const trimmed = draftCondition.trim();
    if (trimmed !== (data.config?.condition || '')) {
      data.onInlineUpdate?.(id, {
        config: { ...(data.config || {}), condition: trimmed },
      });
    }
    setEditing(false);
  };

  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-[var(--ff-ring-offset)] ring-[var(--ff-accent)] shadow-lg'
    : 'hover:border-[var(--ff-border-strong)] transition-all shadow-sm';

  return (
    <div className={`px-3.5 py-2.5 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-surface-solid)] min-w-[195px] backdrop-blur-md ${selectedTone}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--ff-text-secondary)] font-semibold uppercase tracking-wider">
          Condition Gate
        </span>
      </div>
      <div className="text-sm text-[var(--ff-text)] font-semibold mt-0.5">{data.label}</div>

      <div className="mt-1.5">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftCondition}
            onChange={(e) => setDraftCondition(e.target.value)}
            onBlur={commitCondition}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitCondition();
              if (e.key === 'Escape') {
                setDraftCondition(data.config?.condition || '');
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="e.g. $CI_COMMIT_BRANCH == 'main'"
            className="nodrag w-full bg-[var(--ff-surface-solid)] border border-[var(--ff-accent)] rounded px-1.5 py-0.5 text-[11px] ff-code text-[var(--ff-text)] focus:outline-none"
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Double-click to edit condition expression"
            className="text-[11px] text-[var(--ff-text-secondary)] ff-code bg-[var(--ff-surface-inset)] hover:bg-[var(--ff-card-bg-hover)] px-2 py-1 rounded border border-[var(--ff-card-border-strong)] cursor-text truncate transition-colors"
          >
            {data.config?.condition || 'if: branch == main'}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-emerald-500 !w-3 !h-3 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-rose-500 !w-3 !h-3 !left-[70%]" />
    </div>
  );
}

export default memo(ConditionalNode);
