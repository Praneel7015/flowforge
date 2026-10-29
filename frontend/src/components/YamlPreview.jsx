import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PushToRepoModal from './PushToRepoModal';

export default function YamlPreview({ yaml, onClose, onResizeDelta, platform, onSyncToCanvas }) {
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
  const [isEditingYaml, setIsEditingYaml] = useState(false);
  const [draftYaml, setDraftYaml] = useState(prettyYaml);
  const [syncingToCanvas, setSyncingToCanvas] = useState(false);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    if (!isEditingYaml) {
      setDraftYaml(prettyYaml);
    }
  }, [prettyYaml, isEditingYaml]);

  const handleCopy = () => {
    navigator.clipboard.writeText(isEditingYaml ? draftYaml : prettyYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePushSuccess = (result) => {
    setPushResult(result);
    setShowPushModal(false);
  };

  const handleDownload = () => {
    const content = isEditingYaml ? draftYaml : prettyYaml;
    const blob = new Blob([content], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = shortFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyYamlToCanvas = async () => {
    if (!draftYaml.trim()) return;
    setSyncingToCanvas(true);
    setSyncError('');
    try {
      const { data } = await axios.post('/api/pipelines/import', {
        configText: draftYaml,
        cicdPlatform: platform?.name || 'gitlab',
      });
      onSyncToCanvas?.({
        yaml: draftYaml,
        nodes: data.nodes || [],
        edges: data.edges || [],
        detectedPlatform: data.detectedPlatform,
      });
      setIsEditingYaml(false);
    } catch (err) {
      setSyncError(err.response?.data?.error || 'Could not parse YAML into nodes.');
    } finally {
      setSyncingToCanvas(false);
    }
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

      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--ff-card-border)]">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-semibold text-[var(--ff-text)] ff-code truncate">{shortFileName}</h2>
            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-[var(--ff-accent-soft)] text-[var(--ff-accent)]">
              {displayName}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-muted)] truncate mt-0.5">
            {isEditingYaml ? 'Editing YAML — click Sync to Canvas to update nodes' : 'Live bidirectional config'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          {onSyncToCanvas && (
            <button
              onClick={() => {
                setSyncError('');
                if (isEditingYaml) {
                  setIsEditingYaml(false);
                  setDraftYaml(prettyYaml);
                } else {
                  setDraftYaml(prettyYaml);
                  setIsEditingYaml(true);
                }
              }}
              className={`px-2 py-1 text-xs rounded-lg transition-colors whitespace-nowrap ${
                isEditingYaml ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'ff-btn-secondary'
              }`}
              title="Edit YAML directly and sync changes back to canvas nodes"
            >
              {isEditingYaml ? 'Cancel Edit' : 'Edit YAML'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-xs rounded-lg transition-colors ff-btn-secondary whitespace-nowrap"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="px-2 py-1 text-xs rounded-lg transition-colors ff-btn-secondary whitespace-nowrap"
          >
            Download
          </button>
          <button
            onClick={() => setShowPushModal(true)}
            disabled={!(isEditingYaml ? draftYaml : prettyYaml).trim()}
            className="px-2.5 py-1 text-xs rounded-lg transition-opacity ff-btn-primary disabled:opacity-50 whitespace-nowrap"
            title="Commit or open a PR with this pipeline in a connected repo"
          >
            Push
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Collapse YAML preview"
              title="Collapse panel"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 3l5 5-5 5M9 3l5 5-5 5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {isEditingYaml && (
        <div className="px-3 py-2 bg-[var(--ff-surface-2)] border-b border-[var(--ff-card-border)] flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--ff-text-secondary)]">
            Modify jobs, stages, or scripts below and sync back to the visual graph.
          </span>
          <button
            onClick={handleApplyYamlToCanvas}
            disabled={syncingToCanvas}
            className="px-3 py-1 rounded-lg text-xs font-semibold ff-btn-primary whitespace-nowrap disabled:opacity-50"
          >
            {syncingToCanvas ? 'Syncing...' : 'Sync to Canvas ↻'}
          </button>
        </div>
      )}

      {syncError && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          {syncError}
        </div>
      )}

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
        <div className="px-3 py-1.5 bg-[var(--ff-card-bg)] border-b border-[var(--ff-card-border)]">
          <p className="text-[11px] text-[var(--ff-text-secondary)] ff-code truncate">{fileName}</p>
        </div>
      )}

      {isEditingYaml ? (
        <textarea
          value={draftYaml}
          onChange={(e) => setDraftYaml(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full p-4 text-xs text-[var(--ff-text)] ff-code leading-relaxed bg-[var(--ff-code-bg)] focus:outline-hidden resize-none"
        />
      ) : (
        <pre className="flex-1 overflow-auto p-4 text-xs text-[var(--ff-text-secondary)] ff-code leading-relaxed bg-[var(--ff-code-bg)] m-0">
          {prettyYaml || '# Add nodes on the canvas or load a starter template to generate YAML.'}
        </pre>
      )}

      {showPushModal && (
        <PushToRepoModal
          cicdPlatform={platform?.name}
          yamlContent={isEditingYaml ? draftYaml : prettyYaml}
          onClose={() => setShowPushModal(false)}
          onSuccess={handlePushSuccess}
        />
      )}
    </aside>
  );
}
