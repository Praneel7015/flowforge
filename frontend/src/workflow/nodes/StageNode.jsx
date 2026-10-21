import React, { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';

const COLORS = {
  build: { border: 'border-sky-500/35', bg: 'bg-sky-500/10', text: 'text-sky-400', handle: '!bg-sky-400', badge: 'bg-sky-500/15 text-sky-300' },
  matrix_build: { border: 'border-blue-500/35', bg: 'bg-blue-500/10', text: 'text-blue-400', handle: '!bg-blue-400', badge: 'bg-blue-500/15 text-blue-300' },
  lint: { border: 'border-cyan-500/35', bg: 'bg-cyan-500/10', text: 'text-cyan-400', handle: '!bg-cyan-400', badge: 'bg-cyan-500/15 text-cyan-300' },
  test: { border: 'border-amber-500/35', bg: 'bg-amber-500/10', text: 'text-amber-400', handle: '!bg-amber-400', badge: 'bg-amber-500/15 text-amber-300' },
  integration_test: { border: 'border-orange-500/35', bg: 'bg-orange-500/10', text: 'text-orange-400', handle: '!bg-orange-400', badge: 'bg-orange-500/15 text-orange-300' },
  smoke_test: { border: 'border-lime-500/35', bg: 'bg-lime-500/10', text: 'text-lime-400', handle: '!bg-lime-400', badge: 'bg-lime-500/15 text-lime-300' },
  cache_restore: { border: 'border-emerald-500/35', bg: 'bg-emerald-500/10', text: 'text-emerald-400', handle: '!bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-300' },
  cache_save: { border: 'border-teal-500/35', bg: 'bg-teal-500/10', text: 'text-teal-400', handle: '!bg-teal-400', badge: 'bg-teal-500/15 text-teal-300' },
  security_scan: { border: 'border-rose-500/35', bg: 'bg-rose-500/10', text: 'text-rose-400', handle: '!bg-rose-400', badge: 'bg-rose-500/15 text-rose-300' },
  package: { border: 'border-violet-500/35', bg: 'bg-violet-500/10', text: 'text-violet-400', handle: '!bg-violet-400', badge: 'bg-violet-500/15 text-violet-300' },
  release: { border: 'border-fuchsia-500/35', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', handle: '!bg-fuchsia-400', badge: 'bg-fuchsia-500/15 text-fuchsia-300' },
  approval_gate: { border: 'border-yellow-500/35', bg: 'bg-yellow-500/10', text: 'text-yellow-400', handle: '!bg-yellow-400', badge: 'bg-yellow-500/15 text-yellow-300' },
  deploy: { border: 'border-indigo-500/35', bg: 'bg-indigo-500/10', text: 'text-indigo-400', handle: '!bg-indigo-400', badge: 'bg-indigo-500/15 text-indigo-300' },
  canary_deploy: { border: 'border-indigo-500/35', bg: 'bg-indigo-500/10', text: 'text-indigo-400', handle: '!bg-indigo-400', badge: 'bg-indigo-500/15 text-indigo-300' },
  blue_green_deploy: { border: 'border-blue-500/35', bg: 'bg-blue-500/10', text: 'text-blue-400', handle: '!bg-blue-400', badge: 'bg-blue-500/15 text-blue-300' },
  rollback: { border: 'border-red-500/35', bg: 'bg-red-500/10', text: 'text-red-400', handle: '!bg-red-400', badge: 'bg-red-500/15 text-red-300' },
  notify: { border: 'border-pink-500/35', bg: 'bg-pink-500/10', text: 'text-pink-400', handle: '!bg-pink-400', badge: 'bg-pink-500/15 text-pink-300' },
};

function StageNode({ id, data, type, selected }) {
  const c = COLORS[type] || COLORS.build;
  const [editingField, setEditingField] = useState(null); // 'label' | 'script' | null
  const [draftLabel, setDraftLabel] = useState(data.label || '');
  const [draftScript, setDraftScript] = useState(data.config?.script || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setDraftLabel(data.label || '');
  }, [data.label]);

  useEffect(() => {
    setDraftScript(data.config?.script || '');
  }, [data.config?.script]);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      if (typeof inputRef.current.select === 'function' && editingField === 'label') {
        inputRef.current.select();
      }
    }
  }, [editingField]);

  const commitLabel = () => {
    const trimmed = draftLabel.trim();
    if (trimmed && trimmed !== data.label) {
      data.onInlineUpdate?.(id, { label: trimmed });
    } else {
      setDraftLabel(data.label || '');
    }
    setEditingField(null);
  };

  const commitScript = () => {
    if (draftScript !== (data.config?.script || '')) {
      data.onInlineUpdate?.(id, {
        config: { ...(data.config || {}), script: draftScript },
      });
    }
    setEditingField(null);
  };

  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-[var(--ff-ring-offset)] ring-[var(--ff-accent)] shadow-lg'
    : 'hover:border-white/25 transition-all';

  const firstScriptLine = (data.config?.script || '')
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);

  return (
    <div
      className={`px-3.5 py-2.5 rounded-xl border ${c.border} ${c.bg} min-w-[205px] max-w-[260px] backdrop-blur-md ${selectedTone}`}
    >
      <Handle type="target" position={Position.Top} className={`${c.handle} !w-3 !h-3`} />

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] ${c.text} font-semibold uppercase tracking-wider`}>
          {type.replace(/_/g, ' ')}
        </span>
        {data.config?.stage && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${c.badge}`}>
            {data.config.stage}
          </span>
        )}
      </div>

      {/* Inline editable node title */}
      <div className="mt-1">
        {editingField === 'label' ? (
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
                setEditingField(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full bg-[var(--ff-surface-solid)] border border-[var(--ff-accent)] rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--ff-text)] focus:outline-none"
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingField('label');
            }}
            title="Double-click to rename inline, or click node to edit full config"
            className="text-sm text-[var(--ff-text)] font-semibold truncate cursor-text hover:underline decoration-dotted underline-offset-2"
          >
            {data.label}
          </div>
        )}
      </div>

      {/* Image / Environment pill */}
      {(data.config?.image || data.config?.environment) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ff-text-secondary)] ff-code">
          {data.config?.image && (
            <span className="px-1.5 py-0.5 rounded bg-black/20 border border-white/5 truncate max-w-[180px]">
              {data.config.image}
            </span>
          )}
          {data.config?.environment && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 truncate">
              env:{data.config.environment}
            </span>
          )}
        </div>
      )}

      {/* Inline editable script preview */}
      <div className="mt-1.5">
        {editingField === 'script' ? (
          <textarea
            ref={inputRef}
            rows={2}
            value={draftScript}
            onChange={(e) => setDraftScript(e.target.value)}
            onBlur={commitScript}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitScript();
              if (e.key === 'Escape') {
                setDraftScript(data.config?.script || '');
                setEditingField(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Enter shell commands..."
            className="nodrag w-full bg-[var(--ff-surface-solid)] border border-[var(--ff-accent)] rounded px-1.5 py-1 text-[11px] ff-code text-[var(--ff-text)] focus:outline-none resize-none"
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingField('script');
            }}
            title="Double-click to edit command inline"
            className="text-[11px] text-[var(--ff-muted)] ff-code truncate bg-black/20 hover:bg-black/30 px-2 py-1 rounded border border-white/5 cursor-text transition-colors"
          >
            {firstScriptLine ? `$ ${firstScriptLine}` : '+ Double-click to set script'}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className={`${c.handle} !w-3 !h-3`} />
    </div>
  );
}

export default memo(StageNode);
