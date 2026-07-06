import React, { useRef, useState } from 'react';
import axios from 'axios';

const PLATFORM_LABELS = {
  auto: 'Auto-detect',
  github: 'GitHub Actions',
  gitlab: 'GitLab CI',
  jenkins: 'Jenkins',
  circleci: 'CircleCI',
};

const EXAMPLE = `# Paste a .gitlab-ci.yml, GitHub Actions workflow,
# CircleCI config, or a Jenkinsfile here.`;

export default function ImportPipelineModal({ open, onClose, onImported, cicdPlatform, availablePlatforms }) {
  const [content, setContent] = useState('');
  const [platform, setPlatform] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  if (!open) return null;

  const platformOptions = ['auto', ...(availablePlatforms?.map((p) => p.name) || ['github', 'gitlab', 'jenkins', 'circleci'])];

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result || ''));
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!content.trim()) {
      setError('Paste or upload a pipeline file first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post('/api/pipelines/import', {
        yaml: content,
        cicdPlatform: platform === 'auto' ? cicdPlatform || 'auto' : platform,
      });
      onImported(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not parse this pipeline. Check the format and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ff-overlay)] p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--ff-card-border)] bg-[var(--ff-sidebar-bg)] shadow-xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--ff-text)]">Import Existing Pipeline</h3>
            <p className="text-xs text-[var(--ff-muted)] mt-0.5">
              Paste or upload a pipeline config and visualize it as an editable node graph.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ff-muted)] hover:text-[var(--ff-text)] transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--ff-muted)]">Source format</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="ff-input px-3 py-1.5 text-sm w-auto"
          >
            {platformOptions.map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p] || p}</option>
            ))}
          </select>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="ff-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            Upload file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yml,.yaml,.txt,Jenkinsfile,text/*"
            onChange={handleFile}
            className="hidden"
          />
          {fileName && <span className="text-xs text-[var(--ff-muted)] truncate max-w-[160px]">{fileName}</span>}
        </div>

        {/* Editor */}
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setError(''); }}
          placeholder={EXAMPLE}
          spellCheck={false}
          rows={14}
          className="ff-input p-3 text-xs ff-code resize-none leading-relaxed"
        />

        {error && (
          <p className="text-sm text-[var(--ff-danger)] bg-[var(--ff-danger)]/10 border border-[var(--ff-danger)]/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={loading || !content.trim()}
            className="flex-1 ff-btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Parsing…' : 'Visualize Pipeline'}
          </button>
          <button
            onClick={onClose}
            className="ff-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
