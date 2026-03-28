import React from 'react';

const providerHints = {
  featherless: {
    model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
    baseUrl: 'https://api.featherless.ai/v1',
  },
  openai: {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    model: 'claude-sonnet-4-5',
    baseUrl: '',
  },
  gemini: {
    model: 'gemini-1.5-pro',
    baseUrl: '',
  },
  ollama: {
    model: 'llama3',
    baseUrl: 'http://localhost:11434',
  },
};

export default function BringYourOwnModelPanel({ selectedProvider, value, onChange }) {
  const hints = providerHints[selectedProvider] || providerHints.featherless;

  return (
    <div className="ff-surface-soft px-4 py-3 flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2 mr-2">
        <input
          id="byom-toggle"
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="accent-teal-500"
        />
        <label htmlFor="byom-toggle" className="text-xs text-slate-200 font-medium">
          Bring Your Own Model Key
        </label>
      </div>

      {value.enabled && (
        <>
          <div className="min-w-[230px] flex-1">
            <label className="text-[11px] text-slate-500 block mb-1">API Key</label>
            <input
              type="password"
              value={value.apiKey}
              onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
              placeholder="Paste your key (sent per request, not stored)"
              className="ff-input px-3 py-2 text-xs"
            />
          </div>

          <div className="min-w-[200px] flex-1">
            <label className="text-[11px] text-slate-500 block mb-1">Model (optional)</label>
            <input
              type="text"
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              placeholder={hints.model}
              className="ff-input px-3 py-2 text-xs ff-code"
            />
          </div>

          <div className="min-w-[240px] flex-1">
            <label className="text-[11px] text-slate-500 block mb-1">Base URL (optional)</label>
            <input
              type="text"
              value={value.baseUrl}
              onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
              placeholder={hints.baseUrl || 'Use provider default'}
              className="ff-input px-3 py-2 text-xs ff-code"
            />
          </div>
        </>
      )}
    </div>
  );
}
