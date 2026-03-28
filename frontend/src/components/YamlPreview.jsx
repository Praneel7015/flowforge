import React, { useState } from 'react';

export default function YamlPreview({ yaml, onClose, platform }) {
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

  const handleCopy = () => {
    navigator.clipboard.writeText(prettyYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <aside className="ff-surface flex flex-col h-full min-h-[280px] ff-enter">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ff-card-border)]">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ff-text)] ff-code">{shortFileName}</h2>
          <p className="text-xs text-[var(--ff-muted)]">{displayName}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs rounded-lg transition-colors ff-btn-secondary"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs rounded-lg transition-opacity ff-btn-primary"
          >
            Download
          </button>
          <button
            onClick={onClose}
            aria-label="Close YAML preview"
            className="px-2 py-1 text-xs text-[var(--ff-muted)] hover:text-[var(--ff-text)] transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Show full path if different from filename */}
      {fileName !== shortFileName && (
        <div className="px-4 py-2 bg-[var(--ff-card-bg)] border-b border-[var(--ff-card-border)]">
          <p className="text-xs text-[var(--ff-text-secondary)] ff-code">{fileName}</p>
        </div>
      )}

      <pre className="flex-1 overflow-auto p-4 text-xs text-[var(--ff-text-secondary)] ff-code leading-relaxed bg-[var(--ff-code-bg)]">
        {prettyYaml}
      </pre>
    </aside>
  );
}
