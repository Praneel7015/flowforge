import React, { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';
import { firstScriptLine as scriptPreview, isCommandArray } from '../../utils/scriptCommands';

const COLORS = {
  build: { border: 'border-sky-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-sky-500', handle: '!bg-sky-500', badge: 'bg-sky-500/15 text-sky-500 border border-sky-500/25' },
  matrix_build: { border: 'border-blue-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-blue-500', handle: '!bg-blue-500', badge: 'bg-blue-500/15 text-blue-500 border border-blue-500/25' },
  lint: { border: 'border-cyan-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-cyan-500', handle: '!bg-cyan-500', badge: 'bg-cyan-500/15 text-cyan-500 border border-cyan-500/25' },
  test: { border: 'border-amber-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-amber-500', handle: '!bg-amber-500', badge: 'bg-amber-500/15 text-amber-500 border border-amber-500/25' },
  integration_test: { border: 'border-orange-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-orange-500', handle: '!bg-orange-500', badge: 'bg-orange-500/15 text-orange-500 border border-orange-500/25' },
  smoke_test: { border: 'border-lime-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-lime-600', handle: '!bg-lime-500', badge: 'bg-lime-500/15 text-lime-600 border border-lime-500/25' },
  cache_restore: { border: 'border-emerald-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-emerald-500', handle: '!bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25' },
  cache_save: { border: 'border-teal-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-teal-500', handle: '!bg-teal-500', badge: 'bg-teal-500/15 text-teal-500 border border-teal-500/25' },
  security_scan: { border: 'border-rose-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-rose-500', handle: '!bg-rose-500', badge: 'bg-rose-500/15 text-rose-500 border border-rose-500/25' },
  package: { border: 'border-violet-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-violet-500', handle: '!bg-violet-500', badge: 'bg-violet-500/15 text-violet-500 border border-violet-500/25' },
  release: { border: 'border-fuchsia-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-fuchsia-500', handle: '!bg-fuchsia-500', badge: 'bg-fuchsia-500/15 text-fuchsia-500 border border-fuchsia-500/25' },
  approval_gate: { border: 'border-yellow-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-yellow-600', handle: '!bg-yellow-500', badge: 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/25' },
  deploy: { border: 'border-indigo-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-indigo-500', handle: '!bg-indigo-500', badge: 'bg-indigo-500/15 text-indigo-500 border border-indigo-500/25' },
  canary_deploy: { border: 'border-indigo-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-indigo-500', handle: '!bg-indigo-500', badge: 'bg-indigo-500/15 text-indigo-500 border border-indigo-500/25' },
  blue_green_deploy: { border: 'border-blue-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-blue-500', handle: '!bg-blue-500', badge: 'bg-blue-500/15 text-blue-500 border border-blue-500/25' },
  rollback: { border: 'border-red-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-red-500', handle: '!bg-red-500', badge: 'bg-red-500/15 text-red-500 border border-red-500/25' },
  notify: { border: 'border-pink-500/40', bg: 'bg-[var(--ff-surface-solid)]', text: 'text-pink-500', handle: '!bg-pink-500', badge: 'bg-pink-500/15 text-pink-500 border border-pink-500/25' },
};

const RUN_STATUS_STYLES = {
  passed: {
    label: 'PASSED',
    pill: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
    dot: 'bg-emerald-400',
    nodeRing: 'border-emerald-500/50 shadow-[0_0_14px_rgba(16,185,129,0.16)]',
  },
  running: {
    label: 'RUNNING',
    pill: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    dot: 'bg-amber-400 animate-pulse',
    nodeRing: 'border-amber-500/60 shadow-[0_0_16px_rgba(245,158,11,0.22)]',
  },
  failed: {
    label: 'FAILED',
    pill: 'bg-rose-500/15 text-rose-400 border border-rose-500/35',
    dot: 'bg-rose-500',
    nodeRing: 'border-rose-500/70 ring-1 ring-rose-500/40 shadow-[0_0_18px_rgba(244,63,94,0.28)]',
  },
  pending: {
    label: 'PENDING',
    pill: 'bg-sky-500/10 text-sky-400 border border-sky-500/25',
    dot: 'bg-sky-400/80 animate-pulse',
    nodeRing: '',
  },
  skipped: {
    label: 'SKIPPED',
    pill: 'bg-[var(--ff-surface-inset)] text-[var(--ff-muted)] border border-[var(--ff-card-border-strong)]',
    dot: 'bg-[var(--ff-muted)]',
    nodeRing: 'opacity-75',
  },
};

function StageNode({ id, data, type, selected }) {
  const c = COLORS[type] || COLORS.build;
  const runStatusKey = typeof data?.runStatus === 'string' ? data.runStatus.toLowerCase() : '';
  const statusStyle = RUN_STATUS_STYLES[runStatusKey] || null;
  const [editingField, setEditingField] = useState(null); // 'label' | 'script' | null
  const [draftLabel, setDraftLabel] = useState(data.label || '');
  // A list of commands (which may span lines) is edited in the node inspector,
  // where each command keeps its line breaks; the inline box only edits the
  // legacy one-command-per-line string.
  const scriptIsList = isCommandArray(data.config?.script);
  const inlineScript = scriptIsList ? '' : data.config?.script || '';
  const [draftScript, setDraftScript] = useState(inlineScript);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraftLabel(data.label || '');
  }, [data.label]);

  useEffect(() => {
    setDraftScript(inlineScript);
  }, [inlineScript]);

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
    if (draftScript !== inlineScript) {
      data.onInlineUpdate?.(id, {
        config: { ...(data.config || {}), script: draftScript },
      });
    }
    setEditingField(null);
  };

  const selectedTone = selected
    ? 'ring-2 ring-offset-2 ring-offset-[var(--ff-ring-offset)] ring-[var(--ff-accent)] shadow-lg'
    : 'hover:border-[var(--ff-border-strong)] transition-all shadow-sm';

  const firstScriptLine = scriptPreview(data.config?.script);

  return (
    <div
      className={`px-3.5 py-2.5 rounded-xl border ${statusStyle?.nodeRing || c.border} ${c.bg} min-w-[205px] max-w-[260px] backdrop-blur-md ${selectedTone}`}
    >
      <Handle type="target" position={Position.Top} className={`${c.handle} !w-3 !h-3`} />

      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[10px] ${c.text} font-semibold uppercase tracking-wider truncate`}>
          {type.replace(/_/g, ' ')}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {statusStyle && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide ${statusStyle.pill}`}
              title={`Execution status: ${statusStyle.label}${data.runDuration ? ` (${data.runDuration})` : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
              <span>{statusStyle.label}</span>
              {data.runDuration && (
                <span className="font-mono font-normal opacity-80">{data.runDuration}</span>
              )}
            </span>
          )}
          {!statusStyle && data.config?.stage && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${c.badge}`}>
              {data.config.stage}
            </span>
          )}
        </div>
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
            <span className="px-1.5 py-0.5 rounded bg-[var(--ff-surface-inset)] border border-[var(--ff-card-border-strong)] text-[var(--ff-text-secondary)] truncate max-w-[180px]">
              {data.config.image}
            </span>
          )}
          {data.config?.environment && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] border border-[var(--ff-card-border-strong)] truncate">
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
                setDraftScript(inlineScript);
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
              if (!scriptIsList) setEditingField('script');
            }}
            title={
              scriptIsList
                ? 'Multi-line commands: click the node to edit them in the inspector'
                : 'Double-click to edit command inline'
            }
            className="text-[11px] text-[var(--ff-text-secondary)] ff-code truncate bg-[var(--ff-surface-inset)] hover:bg-[var(--ff-card-bg-hover)] px-2 py-1 rounded border border-[var(--ff-card-border-strong)] cursor-text transition-colors"
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
