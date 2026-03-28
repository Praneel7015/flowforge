import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import ProviderSelector from '../components/ProviderSelector';
import BringYourOwnModelPanel from '../components/BringYourOwnModelPanel';

const PLATFORM_CREDS_KEY = 'flowforge.platformCredentials.v1';
const N8N_CONFIG_KEY = 'flowforge.n8n.v1';

function readPlatformCredentials() {
  try {
    const raw = localStorage.getItem(PLATFORM_CREDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writePlatformCredentials(creds) {
  try { localStorage.setItem(PLATFORM_CREDS_KEY, JSON.stringify(creds)); } catch { /* ignore */ }
}

function readN8nConfig() {
  try {
    const raw = localStorage.getItem(N8N_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, webhookUrl: '', chatWebhookUrl: '' };
  } catch { return { enabled: false, webhookUrl: '', chatWebhookUrl: '' }; }
}

const MODEL_PRESETS = {
  featherless: [
    'Qwen/Qwen2.5-Coder-1.5B-Instruct',
    'meta-llama/Llama-3.1-70B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.3',
  ],
  openai: ['gpt-4o', 'gpt-4.1-mini', 'gpt-4o-mini'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-haiku-20240307'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
  ollama: ['llama3', 'mistral', 'codellama'],
};

function RuntimeCard({ title, description, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border px-4 py-4 transition-all ${
        selected
          ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] ring-1 ring-[var(--ff-border-strong)]'
          : 'border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] hover:border-[var(--ff-border-strong)] hover:bg-[var(--ff-card-bg-hover)]'
      }`}
    >
      <p className={`text-sm font-semibold ${selected ? 'text-[var(--ff-text)]' : 'text-[var(--ff-text)]'}`}>{title}</p>
      <p className={`text-xs mt-1 leading-relaxed ${selected ? 'text-[var(--ff-text-secondary)]' : 'text-[var(--ff-muted)]'}`}>
        {description}
      </p>
    </button>
  );
}

function StepBadge({ step, label, active, completed }) {
  const tone = active
    ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] text-[var(--ff-text)]'
    : completed
      ? 'border-[var(--ff-border)] bg-[var(--ff-accent-soft)] text-[var(--ff-text-secondary)]'
      : 'border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-muted)]';

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${tone}`}>
      {`Step ${step}: ${label}`}
    </div>
  );
}

function LlmAndProviderStep({
  providers,
  selectedProviders,
  onProviderChange,
  llmType,
  onLlmTypeChange,
}) {
  return (
    <section className="ff-surface-soft p-5 md:p-6">
      <h3 className="text-base md:text-lg font-semibold text-[var(--ff-text)]">Step 1: LLM and Provider</h3>
      <p className="text-sm text-[var(--ff-text-secondary)] mt-1">
        Choose the runtime style and the main provider targets for this workspace.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RuntimeCard
          title="Cloud LLM"
          description="Use hosted APIs like OpenAI, Anthropic, Gemini, or Featherless for high quality and scale."
          selected={llmType === 'cloud'}
          onSelect={() => onLlmTypeChange('cloud')}
        />
        <RuntimeCard
          title="Local LLM"
          description="Use Ollama for local inference when privacy, offline usage, or local experimentation matters."
          selected={llmType === 'local'}
          onSelect={() => onLlmTypeChange('local')}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--ff-muted)]">LLM Provider</p>
          <ProviderSelector
            type="ai"
            providers={providers.ai || []}
            selected={selectedProviders.ai}
            onChange={(value) => onProviderChange('ai', value)}
            allowDisabled
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--ff-muted)]">Pipeline Target</p>
          <ProviderSelector
            type="cicd"
            providers={providers.cicd || []}
            selected={selectedProviders.cicd}
            onChange={(value) => onProviderChange('cicd', value)}
          />
        </div>
      </div>
    </section>
  );
}

function ModelAndOverridesStep({
  selectedProviders,
  byomConfig,
  onByomChange,
  providerSelfTestEnabled,
}) {
  const currentProvider = selectedProviders.ai;
  const modelPresets = MODEL_PRESETS[currentProvider] || [];

  return (
    <>
      <section className="ff-surface-soft p-5 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-[var(--ff-text)]">Step 2: Model and Overrides</h3>
        <p className="text-sm text-[var(--ff-text-secondary)] mt-1">
          Pick a model preset and optionally configure runtime key and endpoint overrides.
        </p>

        <div className="mt-5">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--ff-muted)] mb-2">Model Quick Picks</p>
          <div className="flex flex-wrap gap-2">
            {modelPresets.map((model) => (
              <button
                key={model}
                onClick={() => onByomChange({ ...byomConfig, model })}
                className="rounded-full border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] px-3 py-1.5 text-xs text-[var(--ff-text-secondary)] hover:border-[var(--ff-border-strong)] hover:bg-[var(--ff-card-bg-hover)] transition-colors"
              >
                {model}
              </button>
            ))}
            {modelPresets.length === 0 && (
              <p className="text-xs text-[var(--ff-muted)]">No model presets available for this provider.</p>
            )}
          </div>
        </div>
      </section>

      <section className="ff-surface-soft p-5 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-[var(--ff-text)]">Connection and Model Overrides</h3>
        <p className="text-sm text-[var(--ff-text-secondary)] mt-1 mb-4">
          Set model overrides and optional custom credentials for requests sent from this workspace.
        </p>

        <BringYourOwnModelPanel
          selectedProvider={selectedProviders.ai}
          value={byomConfig}
          onChange={onByomChange}
          providerSelfTestEnabled={providerSelfTestEnabled}
        />
      </section>
    </>
  );
}

const PLATFORM_INTEGRATIONS = [
  {
    key: 'gitlab',
    label: 'GitLab',
    description: 'Connect to GitLab for pipeline triggering, status checks, and MR comments.',
    fields: [
      { name: 'instanceUrl', label: 'Instance URL', placeholder: 'https://gitlab.com', span: 2 },
      { name: 'token', label: 'Personal Access Token', placeholder: 'glpat-...', type: 'password', span: 2 },
      { name: 'projectId', label: 'Default Project ID', placeholder: '12345' },
      { name: 'username', label: 'Username', placeholder: 'your-username' },
    ],
  },
  {
    key: 'github',
    label: 'GitHub',
    description: 'Connect to GitHub for Actions workflows, PR comments, and issue creation.',
    fields: [
      { name: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password', span: 2 },
      { name: 'repository', label: 'Default Repository', placeholder: 'owner/repo' },
      { name: 'username', label: 'Username', placeholder: 'your-username' },
    ],
  },
  {
    key: 'bitbucket',
    label: 'Bitbucket',
    description: 'Connect to Bitbucket for Pipelines integration and repository management.',
    fields: [
      { name: 'workspace', label: 'Workspace', placeholder: 'my-workspace' },
      { name: 'username', label: 'Username', placeholder: 'your-username' },
      { name: 'appPassword', label: 'App Password', placeholder: 'Enter app password', type: 'password', span: 2 },
      { name: 'repository', label: 'Default Repository', placeholder: 'my-repo' },
    ],
  },
  {
    key: 'circleci',
    label: 'CircleCI',
    description: 'Connect to CircleCI for pipeline management and status monitoring.',
    fields: [
      { name: 'token', label: 'API Token', placeholder: 'Enter CircleCI token', type: 'password', span: 2 },
      { name: 'orgSlug', label: 'Organization Slug', placeholder: 'gh/my-org' },
      { name: 'project', label: 'Project Name', placeholder: 'my-project' },
    ],
  },
];

const VALIDATION_STORAGE_KEY = 'flowforge.platformValidation.v1';

function readValidationState() {
  try {
    const raw = localStorage.getItem(VALIDATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeValidationState(state) {
  try { localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function getRequiredFields(platform) {
  switch (platform) {
    case 'gitlab': return ['token'];
    case 'github': return ['token'];
    case 'bitbucket': return ['username', 'appPassword'];
    case 'circleci': return ['token'];
    default: return [];
  }
}

function PlatformCredentialsStep() {
  const [creds, setCreds] = useState(readPlatformCredentials);
  const [activePlatform, setActivePlatform] = useState('gitlab');
  const [validation, setValidation] = useState(readValidationState);
  // { [platform]: { status: 'idle'|'testing'|'valid'|'invalid', message: '', user: '' } }

  const update = useCallback((platform, field, value) => {
    setCreds((prev) => {
      const next = { ...prev, [platform]: { ...prev[platform], [field]: value } };
      writePlatformCredentials(next);
      return next;
    });
    // Reset validation when credentials change
    setValidation((prev) => {
      const next = { ...prev };
      delete next[platform];
      writeValidationState(next);
      return next;
    });
  }, []);

  const handleClear = useCallback((platformKey) => {
    setCreds((prev) => {
      const next = { ...prev };
      delete next[platformKey];
      writePlatformCredentials(next);
      return next;
    });
    setValidation((prev) => {
      const next = { ...prev };
      delete next[platformKey];
      writeValidationState(next);
      return next;
    });
  }, []);

  const handleTestConnection = useCallback(async (platformKey) => {
    const platformCreds = creds[platformKey] || {};
    const required = getRequiredFields(platformKey);
    const missing = required.filter((f) => !platformCreds[f]?.trim());

    if (missing.length > 0) {
      const labels = missing.map((f) => {
        const p = PLATFORM_INTEGRATIONS.find((p) => p.key === platformKey);
        const field = p?.fields.find((fl) => fl.name === f);
        return field?.label || f;
      });
      setValidation((prev) => {
        const next = { ...prev, [platformKey]: { status: 'invalid', message: `Required: ${labels.join(', ')}`, user: '' } };
        writeValidationState(next);
        return next;
      });
      return;
    }

    setValidation((prev) => ({ ...prev, [platformKey]: { status: 'testing', message: '', user: '' } }));

    try {
      const { data } = await axios.post('/api/platforms/validate', {
        platform: platformKey,
        credentials: platformCreds,
      });

      const result = {
        status: data.valid ? 'valid' : 'invalid',
        message: data.valid ? (data.message || 'Connected') : (data.error || 'Validation failed'),
        user: data.user || '',
      };
      setValidation((prev) => {
        const next = { ...prev, [platformKey]: result };
        writeValidationState(next);
        return next;
      });
    } catch {
      const result = { status: 'invalid', message: 'Could not reach validation server. Is the backend running?', user: '' };
      setValidation((prev) => {
        const next = { ...prev, [platformKey]: result };
        writeValidationState(next);
        return next;
      });
    }
  }, [creds]);

  const currentPlatform = PLATFORM_INTEGRATIONS.find((p) => p.key === activePlatform) || PLATFORM_INTEGRATIONS[0];
  const currentCreds = creds[activePlatform] || {};
  const currentValidation = validation[activePlatform] || { status: 'idle', message: '', user: '' };
  const hasAnyInput = Object.values(currentCreds).some((v) => typeof v === 'string' && v.trim());

  const statusColor = {
    idle: 'text-[var(--ff-muted)]',
    testing: 'text-[var(--ff-info)]',
    valid: 'text-[var(--ff-success)]',
    invalid: 'text-[var(--ff-danger)]',
  };

  return (
    <section className="ff-surface-soft p-5 md:p-6">
      <h3 className="text-base md:text-lg font-semibold text-[var(--ff-text)]">Platform Integrations</h3>
      <p className="text-sm text-[var(--ff-text-secondary)] mt-1">
        Connect to your CI/CD platforms. Credentials are validated against the real API before being marked as connected.
      </p>

      <div className="mt-4 space-y-4">
        {/* Platform tabs */}
        <div className="flex flex-wrap gap-2">
          {PLATFORM_INTEGRATIONS.map((p) => {
            const pValidation = validation[p.key];
            const isValid = pValidation?.status === 'valid';
            const isInvalid = pValidation?.status === 'invalid';
            return (
              <button
                key={p.key}
                onClick={() => setActivePlatform(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  activePlatform === p.key
                    ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] text-[var(--ff-text)]'
                    : 'border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)] hover:border-[var(--ff-border-strong)]'
                }`}
              >
                {p.label}
                {isValid && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[var(--ff-success)] inline-block" />}
                {isInvalid && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[var(--ff-danger)] inline-block" />}
              </button>
            );
          })}
        </div>

        {/* Active platform form */}
        <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-[var(--ff-text)]">{currentPlatform.label}</p>
              <p className="text-xs text-[var(--ff-muted)] mt-0.5">{currentPlatform.description}</p>
            </div>
            {currentValidation.status === 'valid' && (
              <span className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--ff-success)]/10 text-[var(--ff-success)] border border-[var(--ff-success)]/20">
                Verified
              </span>
            )}
            {currentValidation.status === 'invalid' && (
              <span className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--ff-danger)]/10 text-[var(--ff-danger)] border border-[var(--ff-danger)]/20">
                Failed
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {currentPlatform.fields.map((field) => {
              const isRequired = getRequiredFields(activePlatform).includes(field.name);
              return (
                <div key={field.name} className={field.span === 2 ? 'md:col-span-2' : ''}>
                  <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] block mb-1.5">
                    {field.label}{isRequired ? ' *' : ''}
                  </label>
                  <input
                    type={field.type || 'text'}
                    value={currentCreds[field.name] || ''}
                    onChange={(e) => update(activePlatform, field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className="ff-input px-3 py-2 text-sm"
                  />
                </div>
              );
            })}
          </div>

          {/* Actions row */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleTestConnection(activePlatform)}
              disabled={!hasAnyInput || currentValidation.status === 'testing'}
              className="ff-btn-primary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {currentValidation.status === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>

            {hasAnyInput && (
              <button
                onClick={() => handleClear(activePlatform)}
                className="text-xs text-[var(--ff-danger)] hover:underline"
              >
                Clear credentials
              </button>
            )}
          </div>

          {/* Validation feedback */}
          {currentValidation.status !== 'idle' && currentValidation.status !== 'testing' && currentValidation.message && (
            <div className={`mt-3 flex items-start gap-2 text-sm ${statusColor[currentValidation.status]}`}>
              <span className="flex-shrink-0 mt-0.5">
                {currentValidation.status === 'valid' ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="6"/><path d="M4.5 7l2 2 3.5-3.5"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="6"/><path d="M7 4v3M7 9.5v.5"/></svg>
                )}
              </span>
              <span>{currentValidation.message}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-[var(--ff-muted)]">
          Credentials are stored in your browser only. The Test Connection button validates against the real platform API.
        </p>
      </div>
    </section>
  );
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function N8nSettingsStep() {
  const [config, setConfig] = useState(readN8nConfig);
  const [webhookTest, setWebhookTest] = useState({ status: 'idle', message: '' });
  const [chatTest, setChatTest] = useState({ status: 'idle', message: '' });

  const update = useCallback((field, value) => {
    setConfig((prev) => {
      const next = { ...prev, [field]: value };
      try { localStorage.setItem(N8N_CONFIG_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    // Reset test status when URL changes
    if (field === 'webhookUrl') setWebhookTest({ status: 'idle', message: '' });
    if (field === 'chatWebhookUrl') setChatTest({ status: 'idle', message: '' });
  }, []);

  const testWebhook = useCallback(async (url, setter) => {
    if (!url?.trim()) {
      setter({ status: 'invalid', message: 'URL is required.' });
      return;
    }
    if (!isValidUrl(url)) {
      setter({ status: 'invalid', message: 'Invalid URL. Must start with http:// or https://' });
      return;
    }

    setter({ status: 'testing', message: '' });
    try {
      const { data } = await axios.post('/api/n8n/forward', {
        webhookUrl: url,
        payload: { test: true, source: 'flowforge', timestamp: new Date().toISOString() },
      });
      setter({ status: 'valid', message: 'Webhook reachable and responded successfully.' });
    } catch (err) {
      const detail = err.response?.data?.details || err.response?.data?.error || 'Could not reach webhook.';
      setter({ status: 'invalid', message: typeof detail === 'string' ? detail : 'Webhook unreachable.' });
    }
  }, []);

  const statusIcon = (state) => {
    if (state.status === 'valid') return <span className="w-1.5 h-1.5 rounded-full bg-[var(--ff-success)] inline-block" />;
    if (state.status === 'invalid') return <span className="w-1.5 h-1.5 rounded-full bg-[var(--ff-danger)] inline-block" />;
    return null;
  };

  const statusColor = {
    idle: 'text-[var(--ff-muted)]',
    testing: 'text-[var(--ff-info)]',
    valid: 'text-[var(--ff-success)]',
    invalid: 'text-[var(--ff-danger)]',
  };

  return (
    <section className="ff-surface-soft p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base md:text-lg font-semibold text-[var(--ff-text)]">n8n Integration</h3>
          <p className="text-sm text-[var(--ff-text-secondary)] mt-1">
            Connect FlowForge to n8n for automated workflows and custom AI routing.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-full border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ff-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="accent-current"
          />
          Enable n8n
        </label>
      </div>

      {config.enabled && (
        <div className="mt-4 space-y-4">
          {/* Pipeline webhook */}
          <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)]">Pipeline Webhook URL</label>
              {statusIcon(webhookTest)}
            </div>
            <input
              type="text"
              value={config.webhookUrl}
              onChange={(e) => update('webhookUrl', e.target.value)}
              placeholder="https://your-n8n.example.com/webhook/pipeline"
              className="ff-input px-3 py-2 text-sm ff-code"
            />
            <p className="text-xs text-[var(--ff-muted)] mt-1.5">
              Pipeline YAML will be POSTed here on generate/export.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => testWebhook(config.webhookUrl, setWebhookTest)}
                disabled={!config.webhookUrl?.trim() || webhookTest.status === 'testing'}
                className="ff-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {webhookTest.status === 'testing' ? 'Testing...' : 'Test Webhook'}
              </button>
              {webhookTest.status !== 'idle' && webhookTest.message && (
                <span className={`text-xs ${statusColor[webhookTest.status]}`}>{webhookTest.message}</span>
              )}
            </div>
          </div>

          {/* Chat webhook */}
          <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)]">Chat Webhook URL (optional)</label>
              {statusIcon(chatTest)}
            </div>
            <input
              type="text"
              value={config.chatWebhookUrl}
              onChange={(e) => update('chatWebhookUrl', e.target.value)}
              placeholder="https://your-n8n.example.com/webhook/chat"
              className="ff-input px-3 py-2 text-sm ff-code"
            />
            <p className="text-xs text-[var(--ff-muted)] mt-1.5">
              Route chat messages through n8n instead of direct AI.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => testWebhook(config.chatWebhookUrl, setChatTest)}
                disabled={!config.chatWebhookUrl?.trim() || chatTest.status === 'testing'}
                className="ff-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {chatTest.status === 'testing' ? 'Testing...' : 'Test Webhook'}
              </button>
              {chatTest.status !== 'idle' && chatTest.message && (
                <span className={`text-xs ${statusColor[chatTest.status]}`}>{chatTest.message}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SettingsPage({
  providers,
  selectedProviders,
  onProviderChange,
  llmType,
  onLlmTypeChange,
  byomConfig,
  onByomChange,
  providerSelfTestEnabled,
  isOnboarding = false,
  isLimitedMode = false,
  canCompleteOnboarding = false,
  onCompleteOnboarding,
  onSkipForNow,
}) {
  const [wizardStep, setWizardStep] = useState(1);

  useEffect(() => {
    if (isOnboarding) {
      setWizardStep(1);
    }
  }, [isOnboarding]);

  const canContinueStep1 = Boolean(selectedProviders.ai && selectedProviders.cicd);
  const progressWidth = wizardStep === 1 ? '50%' : '100%';

  if (isOnboarding) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-5 ff-enter">
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 md:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-400 font-semibold">
              First-Run Setup
            </p>
            <h3 className="text-lg md:text-xl font-semibold text-[var(--ff-text)] mt-1">
              Configure your workspace in two quick steps
            </h3>
            <p className="text-sm text-[var(--ff-text-secondary)] mt-2 leading-relaxed">
              Complete setup to unlock all navigation pages, or skip for now and use limited mode.
            </p>

            <div className="mt-4">
              <div className="h-1.5 rounded-full bg-[var(--ff-card-bg-hover)] overflow-hidden">
                <div className="h-full bg-[var(--ff-accent)] transition-all" style={{ width: progressWidth }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <StepBadge step={1} label="Provider" active={wizardStep === 1} completed={wizardStep > 1} />
                <StepBadge step={2} label="Overrides" active={wizardStep === 2} completed={false} />
              </div>
            </div>
          </section>

          {wizardStep === 1 && (
            <LlmAndProviderStep
              providers={providers}
              selectedProviders={selectedProviders}
              onProviderChange={onProviderChange}
              llmType={llmType}
              onLlmTypeChange={onLlmTypeChange}
            />
          )}

          {wizardStep === 2 && (
            <ModelAndOverridesStep
              selectedProviders={selectedProviders}
              byomConfig={byomConfig}
              onByomChange={onByomChange}
              providerSelfTestEnabled={providerSelfTestEnabled}
            />
          )}

          <section className="ff-surface-soft p-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onSkipForNow?.()}
              className="ff-btn-secondary rounded-xl px-4 py-2 text-sm font-medium"
            >
              Skip for now (limited mode)
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {wizardStep === 2 && (
                <button
                  onClick={() => setWizardStep(1)}
                  className="ff-btn-secondary rounded-xl px-4 py-2 text-sm font-medium"
                >
                  Back
                </button>
              )}

              {wizardStep === 1 && (
                <button
                  onClick={() => setWizardStep(2)}
                  disabled={!canContinueStep1}
                  className="ff-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Continue to Step 2
                </button>
              )}

              {wizardStep === 2 && (
                <button
                  onClick={() => onCompleteOnboarding?.()}
                  disabled={!canCompleteOnboarding}
                  className="ff-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Finish setup and unlock workspace
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5 ff-enter">
        {isLimitedMode && (
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 md:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-400 font-semibold">
              Limited Mode
            </p>
            <h3 className="text-lg md:text-xl font-semibold text-[var(--ff-text)] mt-1">
              Builder and Settings are available
            </h3>
            <p className="text-sm text-[var(--ff-text-secondary)] mt-2 leading-relaxed">
              Generate, Migration, Health, and Chat pages are locked until full setup is completed.
            </p>
            <div className="mt-4">
              <button
                onClick={() => onCompleteOnboarding?.()}
                disabled={!canCompleteOnboarding}
                className="ff-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Unlock full workspace
              </button>
              {!canCompleteOnboarding && (
                <p className="text-xs text-amber-400 mt-2">
                  Select both AI provider and pipeline target first.
                </p>
              )}
            </div>
          </section>
        )}

        <LlmAndProviderStep
          providers={providers}
          selectedProviders={selectedProviders}
          onProviderChange={onProviderChange}
          llmType={llmType}
          onLlmTypeChange={onLlmTypeChange}
        />

        <ModelAndOverridesStep
          selectedProviders={selectedProviders}
          byomConfig={byomConfig}
          onByomChange={onByomChange}
          providerSelfTestEnabled={providerSelfTestEnabled}
        />

        <PlatformCredentialsStep />
        <N8nSettingsStep />
      </div>
    </div>
  );
}
