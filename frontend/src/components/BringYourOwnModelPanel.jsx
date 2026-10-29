import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { PROVIDER_FIELDS, API_KEY_LABELS, NO_BASE_URL, SECRET_FIELD_NAMES } from '../utils/providerFields';

const API_KEY_STORAGE_KEY = 'flowforge.apikey.v1';

const providerHints = {
  groq: {
    model: 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  openai: {
    model: 'gpt-6-luna',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    model: 'claude-sonnet-5-5',
    baseUrl: '',
  },
  gemini: {
    model: 'gemini-3.8-flash',
    baseUrl: '',
  },
  vertex: {
    model: 'gemini-3.8-flash',
    baseUrl: '',
  },
  bedrock: {
    model: 'us.anthropic.claude-sonnet-4-6',
    baseUrl: '',
  },
  openai_compatible: {
    model: 'e.g. deepseek/deepseek-chat (required)',
    baseUrl: 'https://openrouter.ai/api/v1 (required)',
  },
  ollama: {
    model: 'llama3',
    baseUrl: 'http://localhost:11434',
  },
};

// "Remember" stores the API key plus provider secrets (Vertex JSON, AWS keys).
function readSavedCredentials() {
  try {
    const raw = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        key: typeof parsed?.key === 'string' ? parsed.key : '',
        secrets: parsed?.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {},
      };
    }
  } catch { /* ignore */ }
  return { key: '', secrets: {} };
}

function hasSavedCredentials() {
  const { key, secrets } = readSavedCredentials();
  return Boolean(key) || Object.values(secrets).some(Boolean);
}

function persistCredentials(key, secrets = {}) {
  try {
    const kept = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v));
    if (key || Object.keys(kept).length > 0) {
      localStorage.setItem(
        API_KEY_STORAGE_KEY,
        JSON.stringify({ key, secrets: kept, savedAt: new Date().toISOString() })
      );
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

const pickSecrets = (value) => Object.fromEntries(SECRET_FIELD_NAMES.map((n) => [n, value[n] || '']));

export default function BringYourOwnModelPanel({
  selectedProvider,
  value,
  onChange,
  providerSelfTestEnabled = true,
}) {
  const hints = providerHints[selectedProvider] || providerHints.groq;
  const [testState, setTestState] = useState({ status: 'idle', message: '' });
  const [rememberKey, setRememberKey] = useState(() => hasSavedCredentials());
  const abortRef = useRef(null);

  // On mount, restore saved credentials if available
  useEffect(() => {
    const { key, secrets } = readSavedCredentials();
    const hasSecrets = Object.values(secrets).some(Boolean);
    if ((key && !value.apiKey) || hasSecrets) {
      onChange({ ...value, ...secrets, apiKey: value.apiKey || key, enabled: true });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    setTestState({ status: 'idle', message: '' });
  }, [selectedProvider, value]);

  // Persist or clear credentials when the remember toggle or values change
  const secretsSignature = JSON.stringify(pickSecrets(value));
  useEffect(() => {
    if (rememberKey) {
      persistCredentials(value.apiKey, pickSecrets(value));
    } else {
      persistCredentials('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberKey, value.apiKey, secretsSignature]);

  const extraFields = PROVIDER_FIELDS[selectedProvider] || [];
  const showBaseUrl = !NO_BASE_URL.has(selectedProvider);
  const apiKeyLabel = API_KEY_LABELS[selectedProvider] || 'API key (optional)';

  // Same rule as real requests: only this provider's fields, secrets only when enabled.
  const buildSelfTestOptions = () => {
    const options = {
      model: value.model,
      apiKey: value.enabled ? value.apiKey : '',
      ...(showBaseUrl ? { baseUrl: value.baseUrl } : {}),
    };
    for (const field of extraFields) {
      if (!field.secret || value.enabled) options[field.name] = value[field.name] || '';
    }
    return options;
  };

  const handleSelfTest = async () => {
    if (!selectedProvider) return;

    setTestState({ status: 'loading', message: '' });
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { data } = await axios.post(
        `/api/config/providers/ai/${selectedProvider}/self-test`,
        { aiOptions: buildSelfTestOptions() },
        { signal: controller.signal }
      );

      if (data.valid) {
        const info = data.warning || `Connection successful (${data.metadata?.model || 'default model'})`;
        setTestState({ status: data.warning ? 'warning' : 'success', message: info });
      } else {
        setTestState({ status: 'error', message: data.error || 'Provider test failed' });
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      setTestState({
        status: 'error',
        message: err.response?.data?.error || 'Provider test failed',
      });
    }
  };

  const handleClearSavedKey = () => {
    persistCredentials('');
    setRememberKey(false);
    onChange({ ...value, apiKey: '', ...Object.fromEntries(SECRET_FIELD_NAMES.map((n) => [n, ''])) });
  };

  const feedbackColor =
    testState.status === 'success'
      ? 'text-[var(--ff-success)]'
      : testState.status === 'warning'
        ? 'text-[var(--ff-warning)]'
        : 'text-[var(--ff-danger)]';

  const hasSavedKey = hasSavedCredentials();

  return (
    <div className="rounded-2xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ff-text)]">Runtime Overrides</p>
          <p className="text-xs text-[var(--ff-muted)] mt-1">
            {rememberKey
              ? 'Credentials are saved in this browser and persist across refreshes.'
              : 'Credentials are session-only and cleared on refresh.'}
          </p>
        </div>

        <label className="inline-flex items-center gap-2 rounded-full border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ff-text-secondary)] cursor-pointer">
          <input
            id="byom-toggle"
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            className="accent-current"
          />
          Use custom credentials
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

        {showBaseUrl && (
        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] block mb-1.5">
            {selectedProvider === 'openai_compatible' ? 'Base URL' : 'Base URL (optional)'}
          </label>
          <input
            type="text"
            value={value.baseUrl}
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            placeholder={hints.baseUrl || 'Use provider default'}
            className="ff-input px-3 py-2 text-sm ff-code"
          />
        </div>
        )}

        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] block mb-1.5">
            {apiKeyLabel}
          </label>
          <input
            type="password"
            value={value.apiKey}
            onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
            disabled={!value.enabled}
            placeholder={value.enabled ? 'Paste your key' : 'Enable custom credentials to edit'}
            className="ff-input px-3 py-2 text-sm disabled:opacity-40"
          />
        </div>

        {extraFields.map((field) => {
          const locked = field.secret && !value.enabled;
          const common = {
            value: value[field.name] || '',
            onChange: (e) => onChange({ ...value, [field.name]: e.target.value }),
            disabled: locked,
            placeholder: locked ? 'Enable custom credentials to edit' : field.placeholder,
            className: `ff-input px-3 py-2 text-sm disabled:opacity-40 ${field.password ? '' : 'ff-code'}`,
          };
          return (
            <div key={field.name} className={field.span === 2 ? 'md:col-span-2' : ''}>
              <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] block mb-1.5">
                {field.label}
              </label>
              {field.multiline ? (
                <textarea rows={4} spellCheck={false} {...common} />
              ) : (
                <input type={field.password ? 'password' : 'text'} autoComplete="off" {...common} />
              )}
            </div>
          );
        })}
      </div>

      {/* Remember key + clear */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-[var(--ff-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={rememberKey}
            onChange={(e) => setRememberKey(e.target.checked)}
            disabled={!value.enabled}
            className="accent-current"
          />
          Remember credentials in this browser
        </label>

        {hasSavedKey && (
          <button
            onClick={handleClearSavedKey}
            className="text-xs text-[var(--ff-danger)] hover:underline"
          >
            Clear saved credentials
          </button>
        )}
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
