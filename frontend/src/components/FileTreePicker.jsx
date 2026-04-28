import React, { useMemo, useState } from 'react';

const MAX_FILES = 30;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = 80000;

const ICON_MAP = {
  js: '📄', jsx: '📄', ts: '📄', tsx: '📄',
  json: '📋', yml: '⚙️', yaml: '⚙️', toml: '⚙️', env: '🔑',
  md: '📝', txt: '📝',
  py: '🐍', go: '🐹', java: '☕', rb: '💎', rs: '🦀',
  Dockerfile: '🐳', sh: '⚡', bash: '⚡',
  css: '🎨', scss: '🎨', html: '🌐',
  gitignore: '👁️', lock: '🔒',
};

function getFileIcon(path) {
  const name = path.split('/').pop();
  if (ICON_MAP[name]) return ICON_MAP[name];
  const ext = name.split('.').pop()?.toLowerCase();
  return ICON_MAP[ext] || '📄';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.round(bytes / 1024)}KB`;
}

function buildTree(items) {
  const root = {};
  for (const item of items) {
    const parts = item.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node[dir]) node[dir] = { __isDir: true, __children: {} };
      node = node[dir].__children;
    }
    const filename = parts[parts.length - 1];
    if (item.type === 'dir') {
      if (!node[filename]) node[filename] = { __isDir: true, __children: {} };
    } else {
      node[filename] = { __isDir: false, __item: item };
    }
  }
  return root;
}

function TreeNode({ name, node, depth, selectedPaths, onToggle, disabledPaths }) {
  const [open, setOpen] = useState(depth < 2);

  if (node.__isDir) {
    const children = node.__children;
    const childKeys = Object.keys(children).sort((a, b) => {
      const aDir = children[a].__isDir;
      const bDir = children[b].__isDir;
      if (aDir && !bDir) return -1;
      if (!aDir && bDir) return 1;
      return a.localeCompare(b);
    });

    const allFilePaths = [];
    function collectFiles(n) {
      if (!n.__isDir) { allFilePaths.push(n.__item.path); return; }
      Object.values(n.__children).forEach(collectFiles);
    }
    collectFiles(node);

    const selectedCount = allFilePaths.filter((p) => selectedPaths.has(p)).length;
    const allSelected = allFilePaths.length > 0 && selectedCount === allFilePaths.length;
    const someSelected = selectedCount > 0 && !allSelected;

    return (
      <div>
        <div
          className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-[var(--ff-card-bg-hover)] cursor-pointer group"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            <span className="text-[var(--ff-muted)] text-xs">{open ? '▾' : '▸'}</span>
            <span className="text-xs text-[var(--ff-text-secondary)] font-medium truncate">{name}/</span>
          </button>
          {allFilePaths.length > 0 && (
            <label className="flex items-center flex-shrink-0 cursor-pointer" title={allSelected ? 'Deselect all' : 'Select all'}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={() => onToggle(allFilePaths, !allSelected)}
                className="w-3 h-3 accent-[var(--ff-accent)] opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </label>
          )}
        </div>
        {open && (
          <div>
            {childKeys.map((key) => (
              <TreeNode
                key={key}
                name={key}
                node={children[key]}
                depth={depth + 1}
                selectedPaths={selectedPaths}
                onToggle={onToggle}
                disabledPaths={disabledPaths}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const item = node.__item;
  const selected = selectedPaths.has(item.path);
  const disabled = !selected && disabledPaths.has(item.path);

  return (
    <label
      className={`flex items-center gap-2 py-0.5 px-1 rounded cursor-pointer group ${
        selected ? 'bg-[var(--ff-accent-soft)]' : 'hover:bg-[var(--ff-card-bg-hover)]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
      title={disabled ? `Maximum ${MAX_FILES} files` : item.path}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={() => onToggle([item.path], !selected)}
        className="w-3 h-3 accent-[var(--ff-accent)] flex-shrink-0"
      />
      <span className="text-xs">{getFileIcon(item.path)}</span>
      <span className={`text-xs truncate flex-1 ${selected ? 'text-[var(--ff-text)]' : 'text-[var(--ff-text-secondary)]'}`}>
        {name}
      </span>
      {item.size > 0 && (
        <span className="text-[10px] text-[var(--ff-muted)] flex-shrink-0">{formatSize(item.size)}</span>
      )}
    </label>
  );
}

export default function FileTreePicker({ tree, selectedPaths, onChange, loading }) {
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const disabledSet = useMemo(() => {
    if (selectedSet.size < MAX_FILES) return new Set();
    const allPaths = tree.filter((i) => i.type === 'file').map((i) => i.path);
    return new Set(allPaths.filter((p) => !selectedSet.has(p)));
  }, [selectedSet, tree]);

  const treeData = useMemo(() => buildTree(tree), [tree]);

  const estimatedTokens = useMemo(() => {
    const totalChars = selectedPaths.reduce((sum, p) => {
      const item = tree.find((i) => i.path === p);
      return sum + (item?.size || 500);
    }, 0);
    return Math.round(totalChars / APPROX_CHARS_PER_TOKEN);
  }, [selectedPaths, tree]);

  const contextPercent = Math.min(100, Math.round((estimatedTokens * APPROX_CHARS_PER_TOKEN / MAX_CONTEXT_CHARS) * 100));

  function handleToggle(paths, select) {
    const next = new Set(selectedSet);
    for (const p of paths) {
      if (select) {
        if (next.size < MAX_FILES) next.add(p);
      } else {
        next.delete(p);
      }
    }
    onChange([...next]);
  }

  const rootKeys = Object.keys(treeData).sort((a, b) => {
    const aDir = treeData[a].__isDir;
    const bDir = treeData[b].__isDir;
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--ff-muted)] text-sm">
        <div className="w-4 h-4 border-2 border-[var(--ff-border)] border-t-[var(--ff-accent)] rounded-full animate-spin mr-2" />
        Loading file tree...
      </div>
    );
  }

  if (tree.length === 0) {
    return <p className="text-xs text-[var(--ff-muted)] py-4 text-center">No files found in this branch.</p>;
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--ff-muted)]">
          {selectedSet.size} / {MAX_FILES} files selected
        </p>
        <div className="flex items-center gap-3">
          {selectedSet.size > 0 && (
            <button
              onClick={() => onChange([])}
              className="text-xs text-[var(--ff-danger)] hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Context budget bar */}
      {selectedSet.size > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[var(--ff-muted)]">
            <span>Context estimate</span>
            <span className={contextPercent > 85 ? 'text-[var(--ff-warning)]' : ''}>
              ~{estimatedTokens.toLocaleString()} tokens ({contextPercent}%)
            </span>
          </div>
          <div className="h-1 rounded-full bg-[var(--ff-card-bg-hover)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${contextPercent > 85 ? 'bg-[var(--ff-warning)]' : 'bg-[var(--ff-accent)]'}`}
              style={{ width: `${contextPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-2 max-h-72 overflow-y-auto text-sm">
        {rootKeys.map((key) => (
          <TreeNode
            key={key}
            name={key}
            node={treeData[key]}
            depth={0}
            selectedPaths={selectedSet}
            onToggle={handleToggle}
            disabledPaths={disabledSet}
          />
        ))}
      </div>

      {selectedSet.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...selectedSet].map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[var(--ff-accent-soft)] text-[var(--ff-text-secondary)] border border-[var(--ff-border)]"
            >
              {p.split('/').pop()}
              <button
                onClick={() => handleToggle([p], false)}
                className="text-[var(--ff-muted)] hover:text-[var(--ff-danger)] transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
