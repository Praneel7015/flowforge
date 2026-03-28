import React, { useEffect, useState } from 'react';
import axios from 'axios';

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

export default function BringYourOwnModelPanel({
  selectedProvider,
  value,
  onChange,
  providerSelfTestEnabled = true,
}) {
  const hints = providerHints[selectedProvider] || providerHints.featherless;
  const [testState, setTestState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    setTestState({ status: 'idle', message: '' });
  }, [selectedProvider, value.enabled, value.apiKey, value.model, value.baseUrl]);

  const handleSelfTest = async () => {
    if (!selectedProvider) {
      return;
    }

    setTestState({ status: 'loading', message: '' });
    try {
      const { data } = await axios.post(`/api/config/providers/ai/${selectedProvider}/self-test`, {
        aiOptions: value,
      });

      if (data.valid) {
        const info = data.warning || `Connection successful (${data.metadata?.model || 'default model'})`;
        setTestState({ status: data.warning ? 'warning' : 'success', message: info });
      } else {
        setTestState({ status: 'error', message: data.error || 'Provider test failed' });
      }
    } catch (err) {
      setTestState({
        status: 'error',
        message: err.response?.data?.error || 'Provider test failed',
      });
    }
  };

  const feedbackColor =
    testState.status === 'success'
      ? 'text-emerald-400'
      : testState.status === 'warning'
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="rounded-2xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ff-text)]">Runtime Overrides</p>
          <p className="text-xs text-[var(--ff-muted)] mt-1">
            API key values are used per request and are not persisted in local storage.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 rounded-full border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ff-text-secondary)] cursor-pointer">
          <input
            id="byom-toggle"
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            className="accent-emerald-500"
          />
          Use custom API key
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] block mb-1.5">
            Model preference
          </label>
          <input
            type="text"
            value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            placeholder={hints.model}
            className="ff-input px-3 py-2 text-sm ff-code"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] block mb-1.5">
            Base URL (optional)
          </label>
          <input
            type="text"
            value={value.baseUrl}
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            placeholder={hints.baseUrl || 'Use provider default'}
            className="ff-input px-3 py-2 text-sm ff-code"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] block mb-1.5">
            API key (optional)
          </label>
          <input
            type="password"
            value={value.apiKey}
            onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
            disabled={!value.enabled}
            placeholder={value.enabled ? 'Paste your key' : 'Enable custom key to edit'}
            className="ff-input px-3 py-2 text-sm disabled:opacity-40"
          />
        </div>
      </div>

      {providerSelfTestEnabled && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSelfTest}
            disabled={testState.status === 'loading'}
            className="ff-btn-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {testState.status === 'loading' ? 'Testing connection...' : 'Test provider connection'}
          </button>

          {testState.status !== 'idle' && testState.message && (
            <p className={`text-sm ${feedbackColor}`}>{testState.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
