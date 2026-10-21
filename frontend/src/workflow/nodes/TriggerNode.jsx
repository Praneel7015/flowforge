import React, { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';

function TriggerNode({ id, data, type, selected }) {
  const isMR = type === 'trigger_mr';
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(data.label || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setDraftLabel(data.label || '');
  }, [data.label]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitLabel = () => {
    const trimmed = draftLabel.trim();
    if (trimmed && trimmed !== data.label) {
      data.onInlineUpdate?.(id, { label: trimmed });
    } else {
      setDraftLabel(data.label || '');
    }
    setEditing(false);
  };

  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-[var(--ff-ring-offset)] ring-[var(--ff-accent)] shadow-lg'
    : 'hover:border-emerald-400/50 transition-all';

  const branchValue = isMR
    ? data.config?.targetBranch || 'main'
    : data.config?.branch || 'main';

  return (
    <div
      className={`px-3.5 py-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 min-w-[195px] backdrop-blur-md ${selectedTone}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
          {isMR ? 'PR / MR Trigger' : 'Push Trigger'}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 ff-code">
          {branchValue}
        </span>
      </div>

      <div className="mt-1">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitLabel();
              if (e.key === 'Escape') {
                setDraftLabel(data.label || '');
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full bg-[var(--ff-surface-solid)] border border-emerald-400 rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--ff-text)] focus:outline-none"
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Double-click to rename trigger"
            className="text-sm text-[var(--ff-text)] font-semibold truncate cursor-text hover:underline decoration-dotted underline-offset-2"
          >
            {data.label}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3" />
    </div>
  );
}

export default memo(TriggerNode);
