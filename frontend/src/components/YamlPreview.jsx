import React, { useState } from 'react';
import PushToRepoModal from './PushToRepoModal';

export default function YamlPreview({ yaml, onClose, onResizeDelta, platform }) {
  const normalizeYamlForDisplay = (rawYaml) => {
    if (typeof rawYaml !== 'string') return '';

    let output = rawYaml;

    // If model output returns escaped newlines, decode them for readable preview.
    if (/\\n/.test(output) && !/\r?\n/.test(output)) {
      output = output
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '  ')
        .replace(/\\"/g, '"');
    }

    if (output.startsWith('"') && output.endsWith('"')) {
      try {
        const parsed = JSON.parse(output);
        if (typeof parsed === 'string') {
          output = parsed;
        }
      } catch {
        // Keep original output when it's not a valid JSON string literal.
      }
    }

    return output;
  };

  const prettyYaml = normalizeYamlForDisplay(yaml);

  // Get filename from platform metadata, default to .gitlab-ci.yml
  const fileName = platform?.fileName || '.gitlab-ci.yml';
  const displayName = platform?.displayName || 'GitLab CI';

  // Extract just the filename for display (handle paths like .github/workflows/ci.yml)
  const shortFileName = fileName.split('/').pop();

  const [copied, setCopied] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(prettyYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePushSuccess = (result) => {
    setPushResult(result);
    setShowPushModal(false);
  };

  const handleDownload = () => {
    const blob = new Blob([prettyYaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = shortFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Drag the left edge to resize the panel. Parent owns the width and applies
  // the delta so the value persists across sessions.
  const startResize = (event) => {
    if (!onResizeDelta) return;
    event.preventDefault();
    const onMove = (ev) => onResizeDelta(ev.movementX);
    const stop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  return (
    <aside className="ff-surface relative flex flex-col h-full min-h-[280px] ff-enter overflow-hidden">
      {/* Resize handle (desktop only) */}
      {onResizeDelta && (
        <div
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          className="group hidden xl:block absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize z-20"
        >
          <div className="mx-auto h-full w-0.5 group-hover:bg-[var(--ff-accent)] transition-colors" />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-[var(--ff-card-border)]">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--ff-text)] ff-code truncate">{shortFileName}</h2>
          <p className="text-xs text-[var(--ff-muted)] truncate">{displayName}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1.5 text-xs rounded-lg transition-colors ff-btn-secondary whitespace-nowrap"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="px-2.5 py-1.5 text-xs rounded-lg transition-colors ff-btn-secondary whitespace-nowrap"
          >
            Download
          </button>
          <button
            onClick={() => setShowPushModal(true)}
            disabled={!prettyYaml.trim()}
            className="px-2.5 py-1.5 text-xs rounded-lg transition-opacity ff-btn-primary disabled:opacity-50 whitespace-nowrap"
            title="Commit or open a PR with this pipeline in a connected repo"
          >
            Push
          </button>
          <button
            onClick={onClose}
            aria-label="Collapse YAML preview"
            title="Collapse panel"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 3l5 5-5 5M9 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </div>

      {pushResult && (
        <div className="px-4 py-2 bg-[var(--ff-success)]/10 border-b border-[var(--ff-success)]/20">
          <p className="text-xs text-[var(--ff-success)] font-medium">
            {pushResult.mode === 'pr' || pushResult.mode === 'mr' ? 'Pull request opened' : 'Committed'}
            {pushResult.branch ? ` on ${pushResult.branch}` : ''}.
            {pushResult.url && (
              <>
                {' '}
                <a href={pushResult.url} target="_blank" rel="noopener noreferrer" className="underline">
                  View
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {/* Show full path if different from filename */}
      {fileName !== shortFileName && (
        <div className="px-4 py-2 bg-[var(--ff-card-bg)] border-b border-[var(--ff-card-border)]">
          <p className="text-xs text-[var(--ff-text-secondary)] ff-code truncate">{fileName}</p>
        </div>
      )}

      <pre className="flex-1 overflow-auto p-4 text-xs text-[var(--ff-text-secondary)] ff-code leading-relaxed bg-[var(--ff-code-bg)]">
        {prettyYaml}
      </pre>

      {showPushModal && (
        <PushToRepoModal
          cicdPlatform={platform?.name}
          yamlContent={prettyYaml}
          onClose={() => setShowPushModal(false)}
          onSuccess={handlePushSuccess}
        />
      )}
    </aside>
  );
}
