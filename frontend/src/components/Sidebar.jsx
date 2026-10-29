import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NodeTemplates from './NodeTemplates';

const NODE_TYPES = [
  { type: 'trigger_push', label: 'Git Push Trigger', tone: 'emerald', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2.5v7.5M8 2.5L5.5 5M8 2.5L10.5 5"/><circle cx="8" cy="12" r="1.5"/></svg> },
  { type: 'trigger_mr', label: 'Merge Request Trigger', tone: 'green', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="4.5" cy="4.5" r="1.5"/><circle cx="11.5" cy="4.5" r="1.5"/><circle cx="4.5" cy="11.5" r="1.5"/><path d="M4.5 6v4M11.5 6c0 3-7 3-7 4"/></svg> },
  { type: 'build', label: 'Build Stage', tone: 'sky', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5.5" width="11" height="7.5" rx="1.5"/><path d="M5.5 5.5V4a2.5 2.5 0 015 0v1.5"/></svg> },
  { type: 'matrix_build', label: 'Matrix Build', tone: 'blue', advanced: true, icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.75"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="0.75"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="0.75"/><rect x="9" y="9" width="4.5" height="4.5" rx="0.75"/></svg> },
  { type: 'lint', label: 'Lint / Static Analysis', tone: 'cyan', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 4.5h7M4.5 8h4.5M4.5 11.5h6"/></svg> },
  { type: 'test', label: 'Unit Tests', tone: 'amber', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5l2.5 2.5 5.5-5.5"/></svg> },
  { type: 'integration_test', label: 'Integration Tests', tone: 'orange', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4.5" width="4.5" height="7" rx="1"/><rect x="9.5" y="4.5" width="4.5" height="7" rx="1"/><path d="M6.5 8h3"/></svg> },
  { type: 'smoke_test', label: 'Smoke Tests', tone: 'lime', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2"/></svg> },
  { type: 'cache_restore', label: 'Cache Restore', tone: 'emerald', advanced: true, icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8a4.5 4.5 0 018.2-2.2"/><path d="M12.5 8a4.5 4.5 0 01-8.2 2.2"/><path d="M12 3.5V6H9.5"/></svg> },
  { type: 'cache_save', label: 'Cache Save', tone: 'teal', advanced: true, icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2.5V10M8 10L5.5 7.5M8 10l2.5-2.5"/><path d="M3.5 12.5h9"/></svg> },
  { type: 'security_scan', label: 'Security Scan', tone: 'rose', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L3 4.2v3.3c0 3.8 5 6 5 6s5-2.2 5-6V4.2L8 2z"/></svg> },
  { type: 'package', label: 'Package Artifact', tone: 'violet', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5l5-2.8L13 5v6l-5 2.8L3 11z"/><path d="M8 7.8v6M3 5l5 2.8L13 5"/></svg> },
  { type: 'release', label: 'Release', tone: 'fuchsia', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2.2l1.6 3.3h3.4l-2.7 2.6.9 3.7L8 9.9l-3.2 1.9.9-3.7L3 5.5h3.4z"/></svg> },
  { type: 'approval_gate', label: 'Approval Gate', tone: 'yellow', advanced: true, icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v4.5M5.8 5.5L8 7.5l2.2-2"/><rect x="3.5" y="10" width="9" height="3.2" rx="1"/></svg> },
  { type: 'deploy', label: 'Deploy', tone: 'indigo', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 13V4.5M8 4.5l3 3M8 4.5l-3 3"/><path d="M3.5 2.5h9"/></svg> },
  { type: 'canary_deploy', label: 'Canary Deploy', tone: 'indigo', advanced: true, icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 13V7M8 7l2.2 2.2M8 7L5.8 9.2"/><circle cx="8" cy="4" r="1.5"/></svg> },
  { type: 'blue_green_deploy', label: 'Blue/Green Deploy', tone: 'blue', advanced: true, icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="8" r="3.2"/><circle cx="10" cy="8" r="3.2"/></svg> },
  { type: 'rollback', label: 'Rollback', tone: 'red', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 5.5L2.5 7.5l2 2"/><path d="M2.5 7.5h8.5a2.5 2.5 0 010 5H8"/></svg> },
  { type: 'notify', label: 'Notification', tone: 'pink', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.2a2 2 0 004 0"/><path d="M8 2.5a4 4 0 014 4c0 2.2 1.2 3.2 1.2 3.2H2.8S4 8.7 4 6.5a4 4 0 014-4z"/></svg> },
  { type: 'conditional', label: 'Conditional Logic', tone: 'slate', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2.5L12.5 8 8 13.5 3.5 8z"/></svg> },
];

// Node types grouped by pipeline phase so the library reads top-to-bottom like a
// real CI/CD flow. Order within each category also follows typical execution.
const CATEGORIES = [
  { id: 'triggers', label: 'Triggers', types: ['trigger_push', 'trigger_mr'] },
  { id: 'build', label: 'Build & Cache', types: ['build', 'matrix_build', 'cache_restore', 'cache_save'] },
  { id: 'quality', label: 'Test & Quality', types: ['lint', 'test', 'integration_test', 'smoke_test', 'security_scan'] },
  { id: 'package', label: 'Package & Release', types: ['package', 'release'] },
  { id: 'deploy', label: 'Deploy', types: ['approval_gate', 'deploy', 'canary_deploy', 'blue_green_deploy', 'rollback'] },
  { id: 'flow', label: 'Flow & Notify', types: ['conditional', 'notify'] },
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

const EXPANDED_KEY = 'flowforge.nodeLibrary.expanded.v2';
const NODE_BY_TYPE = Object.fromEntries(NODE_TYPES.map((node) => [node.type, node]));

function readStoredExpanded() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Sidebar({ featureFlags, onAddNode, onLoadTemplate, onImport }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => {
    const base = {
      triggers: true,
      build: true,
      quality: false,
      package: false,
      deploy: false,
      flow: false,
    };
    const stored = readStoredExpanded();
    return stored ? { ...base, ...stored } : base;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
    } catch {
      // Ignore storage write issues.
    }
  }, [expanded]);

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

  const toggleCategory = useCallback((id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const showAdvancedNodes = featureFlags?.advancedNodes !== false;
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  // Resolve each category to its currently-visible nodes (respecting the advanced
  // feature flag and the search filter). Empty categories are dropped.
  const visibleCategories = useMemo(() => {
    return CATEGORIES.map((category) => {
      let nodes = category.types.map((type) => NODE_BY_TYPE[type]).filter(Boolean);
      if (!showAdvancedNodes) nodes = nodes.filter((node) => !node.advanced);
      if (isSearching) {
        nodes = nodes.filter(
          (node) =>
            node.label.toLowerCase().includes(normalizedQuery) ||
            node.type.replace(/_/g, ' ').includes(normalizedQuery)
        );
      }
      return { ...category, nodes };
    }).filter((category) => category.nodes.length > 0);
  }, [showAdvancedNodes, isSearching, normalizedQuery]);

  const renderNode = (node) => (
    <div
      key={node.type}
      role="button"
      tabIndex={0}
      aria-label={`Add ${node.label} node to canvas`}
      draggable
      onDragStart={(e) => onDragStart(e, node.type, node.label)}
      onClick={() => onAddNode?.(node.type, node.label)}
      onKeyDown={(e) => handleKeyDown(e, node.type, node.label)}
      className="group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer lg:cursor-grab active:cursor-grabbing
        bg-[var(--ff-card-bg)] hover:bg-[var(--ff-card-bg-hover)] border border-[var(--ff-card-border)] hover:border-[var(--ff-card-border-hover)]
        focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)] focus-visible:ring-offset-1
        transition-all text-sm"
    >
      <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${TONE_BG[node.tone] || TONE_BG.slate}`}>
        {node.icon}
      </span>
      <span className="text-[var(--ff-text-secondary)] group-hover:text-[var(--ff-text)] font-medium text-[13px] truncate flex-1">
        {node.label}
      </span>
      <span className="text-[11px] text-[var(--ff-muted)] opacity-0 group-hover:opacity-100 transition-opacity font-mono">
        +
      </span>
    </div>
  );

  return (
    <aside className="h-full overflow-y-auto ff-enter bg-[var(--ff-surface)] border-r border-[var(--ff-card-border)]">
      <div className="p-4">
        {onImport && (
          <button
            onClick={onImport}
            className="w-full mb-4 flex items-center justify-center gap-2 ff-btn-secondary rounded-lg px-3 py-2 text-[13px] font-medium"
            title="Import an existing pipeline file and visualize it"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 10V2.5M8 10L5.5 7.5M8 10l2.5-2.5" /><path d="M3 12.5h10" />
            </svg>
            Import Pipeline
          </button>
        )}

        <h2 className="text-[10px] font-semibold text-[var(--ff-muted)] uppercase tracking-[0.16em] mb-2.5">
          Node Library
        </h2>

        {/* Search / filter */}
        <div className="relative mb-3">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ff-muted)] pointer-events-none"
            width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5l3 3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes..."
            aria-label="Search node library"
            className="ff-input pl-8 pr-7 py-1.5 text-xs"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ff-muted)] hover:text-[var(--ff-text)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          )}
        </div>

        {/* Categorized node list */}
        <div className="space-y-1.5">
          {visibleCategories.map((category) => {
            const open = isSearching || expanded[category.id];
            return (
              <div key={category.id}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  disabled={isSearching}
                  aria-expanded={open}
                  className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors disabled:hover:bg-transparent disabled:cursor-default"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${open ? 'rotate-90' : ''}`}
                  >
                    <path d="M5.5 3.5L10 8l-4.5 4.5" />
                  </svg>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{category.label}</span>
                  <span className="ml-auto text-[10px] font-medium text-[var(--ff-muted)] tabular-nums">
                    {category.nodes.length}
                  </span>
                </button>

                {open && (
                  <div className="space-y-1.5 mt-1 mb-1 pl-1">
                    {category.nodes.map(renderNode)}
                  </div>
                )}
              </div>
            );
          })}

          {visibleCategories.length === 0 && (
            <p className="px-1.5 py-3 text-xs text-[var(--ff-muted)]">
              No nodes match “{query.trim()}”.
            </p>
          )}
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
      </div>
    </aside>
  );
}
