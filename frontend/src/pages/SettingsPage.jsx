import React, { useEffect, useState } from 'react';
import ProviderSelector from '../components/ProviderSelector';
import BringYourOwnModelPanel from '../components/BringYourOwnModelPanel';

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
          ? 'border-slate-900 bg-slate-900 text-slate-100 shadow-[0_10px_24px_rgba(15,23,42,0.22)]'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
      }`}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className={`text-xs mt-1 leading-relaxed ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
        {description}
      </p>
    </button>
  );
}

function StepBadge({ step, label, active, completed }) {
  const tone = active
    ? 'border-slate-900 bg-slate-900 text-slate-100'
    : completed
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : 'border-slate-300 bg-white text-slate-500';

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
      <h3 className="text-base md:text-lg font-semibold text-slate-900">Step 1: LLM and Provider</h3>
      <p className="text-sm text-slate-600 mt-1">
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
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">LLM Provider</p>
          <ProviderSelector
            type="ai"
            providers={providers.ai || []}
            selected={selectedProviders.ai}
            onChange={(value) => onProviderChange('ai', value)}
            allowDisabled
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Pipeline Target</p>
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
        <h3 className="text-base md:text-lg font-semibold text-slate-900">Step 2: Model and Overrides</h3>
        <p className="text-sm text-slate-600 mt-1">
          Pick a model preset and optionally configure runtime key and endpoint overrides.
        </p>

        <div className="mt-5">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Model Quick Picks</p>
          <div className="flex flex-wrap gap-2">
            {modelPresets.map((model) => (
              <button
                key={model}
                onClick={() => onByomChange({ ...byomConfig, model })}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-slate-400 transition-colors"
              >
                {model}
              </button>
            ))}
            {modelPresets.length === 0 && (
              <p className="text-xs text-slate-500">No model presets available for this provider.</p>
            )}
          </div>
        </div>
      </section>

      <section className="ff-surface-soft p-5 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-slate-900">Connection and Model Overrides</h3>
        <p className="text-sm text-slate-600 mt-1 mb-4">
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
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 md:p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-amber-800 font-semibold">
              First-Run Setup
            </p>
            <h3 className="text-lg md:text-xl font-semibold text-slate-900 mt-1">
              Configure your workspace in two quick steps
            </h3>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
              Complete setup to unlock all navigation pages, or skip for now and use limited mode.
            </p>

            <div className="mt-4">
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-slate-900 transition-all" style={{ width: progressWidth }} />
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
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 md:p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-amber-800 font-semibold">
              Limited Mode
            </p>
            <h3 className="text-lg md:text-xl font-semibold text-slate-900 mt-1">
              Builder and Settings are available
            </h3>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
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
                <p className="text-xs text-amber-800 mt-2">
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
      </div>
    </div>
  );
}
