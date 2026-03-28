import React from 'react';

export default function YamlPreview({ yaml, onClose, platform }) {
  // Get filename from platform metadata, default to .gitlab-ci.yml
  const fileName = platform?.fileName || '.gitlab-ci.yml';
  const displayName = platform?.displayName || 'GitLab CI';

  // Extract just the filename for display (handle paths like .github/workflows/ci.yml)
  const shortFileName = fileName.split('/').pop();

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml);
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = shortFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="w-96 ff-surface flex flex-col ff-enter">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/70">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 ff-code">{shortFileName}</h2>
          <p className="text-xs text-slate-400">{displayName}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1 text-xs rounded transition-colors ff-btn-secondary"
          >
            Copy
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-xs rounded transition-opacity ff-btn-primary hover:opacity-90"
          >
            Download
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Show full path if different from filename */}
      {fileName !== shortFileName && (
        <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-700/70">
          <p className="text-xs text-slate-300 ff-code">{fileName}</p>
        </div>
      )}

      <pre className="flex-1 overflow-auto p-4 text-xs text-teal-100 ff-code leading-relaxed bg-slate-950/40">
        {yaml}
      </pre>
    </aside>
  );
}
