import React, { useCallback } from 'react';
import NodeTemplates from './NodeTemplates';

const NODE_TYPES = [
  { type: 'trigger_push', label: 'Git Push Trigger', tone: 'emerald', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 2v7M7 2L4.5 4.5M7 2l2.5 2.5"/><circle cx="7" cy="11" r="1.5"/></svg> },
  { type: 'trigger_mr', label: 'Merge Request Trigger', tone: 'green', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="4" cy="4" r="1.5"/><circle cx="10" cy="4" r="1.5"/><circle cx="4" cy="11" r="1.5"/><path d="M4 5.5v4M10 5.5c0 3-6 3-6 4"/></svg> },
  { type: 'build', label: 'Build Stage', tone: 'sky', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="10" height="7" rx="1.5"/><path d="M5 5V3.5A2 2 0 019 3.5V5"/></svg> },
  { type: 'matrix_build', label: 'Matrix Build', tone: 'blue', advanced: true, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="2" width="4" height="4" rx="0.5"/><rect x="8" y="2" width="4" height="4" rx="0.5"/><rect x="2" y="8" width="4" height="4" rx="0.5"/><rect x="8" y="8" width="4" height="4" rx="0.5"/></svg> },
  { type: 'lint', label: 'Lint / Static Analysis', tone: 'cyan', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M4 4h6M4 7h4M4 10h5"/></svg> },
  { type: 'test', label: 'Unit Tests', tone: 'amber', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7l2 2 4-4"/></svg> },
  { type: 'integration_test', label: 'Integration Tests', tone: 'orange', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="4" width="4" height="6" rx="1"/><rect x="8" y="4" width="4" height="6" rx="1"/><path d="M6 7h2"/></svg> },
  { type: 'smoke_test', label: 'Smoke Tests', tone: 'lime', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="7" cy="7" r="3"/><path d="M7 2v2M7 10v2M2 7h2M10 7h2"/></svg> },
  { type: 'cache_restore', label: 'Cache Restore', tone: 'emerald', advanced: true, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 7a4 4 0 017.5-2"/><path d="M11 7a4 4 0 01-7.5 2"/><path d="M10.5 3v2h-2"/></svg> },
  { type: 'cache_save', label: 'Cache Save', tone: 'teal', advanced: true, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 2v7M7 9L4.5 6.5M7 9l2.5-2.5"/><path d="M3 11h8"/></svg> },
  { type: 'security_scan', label: 'Security Scan', tone: 'rose', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1.5L2.5 3.5v3c0 3.5 4.5 5.5 4.5 5.5s4.5-2 4.5-5.5v-3L7 1.5z"/></svg> },
  { type: 'package', label: 'Package Artifact', tone: 'violet', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5L7 2l4.5 2.5v5L7 12l-4.5-2.5z"/><path d="M7 7v5M2.5 4.5L7 7l4.5-2.5"/></svg> },
  { type: 'release', label: 'Release', tone: 'fuchsia', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 2l1.5 3h3L9 7.5l1 3.5L7 9l-3 2 1-3.5L2.5 5h3z"/></svg> },
  { type: 'approval_gate', label: 'Approval Gate', tone: 'yellow', advanced: true, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 3v4M5 5l2 2 2-2"/><rect x="3" y="9" width="8" height="3" rx="1"/></svg> },
  { type: 'deploy', label: 'Deploy', tone: 'indigo', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 12V4M7 4l3 3M7 4L4 7"/><path d="M3 2h8"/></svg> },
  { type: 'canary_deploy', label: 'Canary Deploy', tone: 'indigo', advanced: true, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 12V6M7 6l2 2M7 6L5 8"/><circle cx="7" cy="3.5" r="1.5"/></svg> },
  { type: 'blue_green_deploy', label: 'Blue/Green Deploy', tone: 'blue', advanced: true, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="5" cy="7" r="3"/><circle cx="9" cy="7" r="3"/></svg> },
  { type: 'rollback', label: 'Rollback', tone: 'red', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M4 5l-2 2 2 2"/><path d="M2 7h8a2 2 0 010 4H7"/></svg> },
  { type: 'notify', label: 'Notification', tone: 'pink', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11a2 2 0 004 0"/><path d="M7 2a4 4 0 014 4c0 2 1 3 1 3H2s1-1 1-3a4 4 0 014-4z"/></svg> },
  { type: 'conditional', label: 'Conditional Logic', tone: 'slate', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 2l4 5-4 5-4-5z"/></svg> },
];

const TONE_BG = {
  emerald: 'bg-emerald-500/15 text-emerald-500',
  green: 'bg-green-500/15 text-green-500',
  sky: 'bg-sky-500/15 text-sky-500',
  blue: 'bg-blue-500/15 text-blue-500',
  cyan: 'bg-cyan-500/15 text-cyan-500',
  amber: 'bg-amber-500/15 text-amber-500',
  orange: 'bg-orange-500/15 text-orange-500',
  lime: 'bg-lime-500/15 text-lime-500',
  teal: 'bg-teal-500/15 text-teal-500',
  rose: 'bg-rose-500/15 text-rose-500',
  violet: 'bg-violet-500/15 text-violet-500',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-500',
  yellow: 'bg-yellow-500/15 text-yellow-500',
  indigo: 'bg-indigo-500/15 text-indigo-500',
  red: 'bg-red-500/15 text-red-500',
  pink: 'bg-pink-500/15 text-pink-500',
  slate: 'bg-slate-500/15 text-slate-500',
};

export default function Sidebar({ featureFlags, onAddNode, onLoadTemplate }) {
  const onDragStart = (event, nodeType, label) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleKeyDown = useCallback(
    (event, nodeType, label) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onAddNode?.(nodeType, label);
      }
    },
    [onAddNode]
  );

  const showAdvancedNodes = featureFlags?.advancedNodes !== false;
  const visibleNodeTypes = showAdvancedNodes
    ? NODE_TYPES
    : NODE_TYPES.filter((node) => !node.advanced);

  return (
    <aside className="h-full overflow-y-auto ff-enter bg-[var(--ff-surface)] border-r border-[var(--ff-card-border)]">
      <div className="p-4">
        <h2 className="text-[10px] font-semibold text-[var(--ff-muted)] uppercase tracking-[0.16em] mb-3">
          Node Library
        </h2>
        <div className="space-y-1.5">
          {visibleNodeTypes.map((node) => (
            <div
              key={node.type}
              role="button"
              tabIndex={0}
              aria-label={`Add ${node.label} node to canvas`}
              draggable
              onDragStart={(e) => onDragStart(e, node.type, node.label)}
              onKeyDown={(e) => handleKeyDown(e, node.type, node.label)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing
                bg-[var(--ff-card-bg)] hover:bg-[var(--ff-card-bg-hover)] border border-[var(--ff-card-border)] hover:border-[var(--ff-card-border-hover)]
                focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:ring-offset-1
                transition-all text-sm"
            >
              <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${TONE_BG[node.tone] || TONE_BG.slate}`}>
                {node.icon}
              </span>
              <span className="text-[var(--ff-text-secondary)] font-medium text-[13px]">{node.label}</span>
            </div>
          ))}
        </div>

        {!showAdvancedNodes && (
          <p className="mt-3 text-xs text-[var(--ff-muted)]">
            Advanced nodes are disabled by feature flag.
          </p>
        )}

        {/* Templates section */}
        <div className="mt-5 pt-4 border-t border-[var(--ff-card-border)]">
          <h2 className="text-[10px] font-semibold text-[var(--ff-muted)] uppercase tracking-[0.16em] mb-3">
            Templates
          </h2>
          <NodeTemplates onLoadTemplate={onLoadTemplate} />
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--ff-card-border)]">
          <p className="text-[11px] text-[var(--ff-muted)] leading-relaxed">
            Drag nodes onto the canvas or press Enter to add them.
          </p>
        </div>
      </div>
    </aside>
  );
}
