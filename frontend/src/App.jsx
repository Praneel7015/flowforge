import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import WorkflowEditor from './workflow/WorkflowEditor';
import Sidebar from './components/Sidebar';
import PromptPanel from './components/PromptPanel';
import YamlPreview from './components/YamlPreview';
import JenkinsConverter from './components/JenkinsConverter';
import HealthAdvisor from './components/HealthAdvisor';
import PipelineChat from './components/PipelineChat';
import SettingsPage from './pages/SettingsPage';
import { getClientFeatureFlags, mergeFeatureFlags } from './utils/featureFlags';

const clientFeatureFlags = getClientFeatureFlags();
const SETTINGS_STORAGE_KEY = 'flowforge.preferences.v1';
const ONBOARDING_STORAGE_KEY = 'flowforge.onboarding.v1';
const ONBOARDING_STATUS = {
  required: 'required',
  limited: 'limited',
  completed: 'completed',
};

const NAV_ITEMS = [
  { id: 'builder', label: 'Builder', icon: '◧' },
  { id: 'prompt', label: 'Generate', icon: '✦' },
  { id: 'jenkins', label: 'Migrate', icon: '⇄' },
  { id: 'health', label: 'Health', icon: '◎' },
  { id: 'chat', label: 'Chat', icon: '◈' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const PANEL_META = {
  builder: {
    title: 'Workflow Builder',
    subtitle: 'Build pipelines visually, connect stages, and export clean CI/CD YAML.',
  },
  prompt: {
    title: 'Generate From Prompt',
    subtitle: 'Describe the workflow and generate a production-ready pipeline structure.',
  },
  jenkins: {
    title: 'Migrate Existing Pipeline',
    subtitle: 'Convert Jenkinsfiles into modern pipeline configs and editable nodes.',
  },
  health: {
    title: 'Health Advisor',
    subtitle: 'Analyze pipeline quality across speed, security, and reliability.',
  },
  chat: {
    title: 'Pipeline Assistant',
    subtitle: 'Ask questions, troubleshoot, and improve your current pipeline quickly.',
  },
  settings: {
    title: 'Workspace Settings',
    subtitle: 'Choose LLM type, model provider, model preference, and runtime options.',
  },
};

const DEFAULT_BYOM = {
  enabled: false,
  apiKey: '',
  model: '',
  baseUrl: '',
};

function inferLlmType(providerName) {
  return providerName === 'ollama' ? 'local' : 'cloud';
}

function readStoredPreferences() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readOnboardingStatus() {
  if (typeof window === 'undefined') {
    return { status: ONBOARDING_STATUS.required };
  }

  try {
    const onboardingRaw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (onboardingRaw) {
      const onboarding = JSON.parse(onboardingRaw);

      if (onboarding?.status === ONBOARDING_STATUS.completed) {
        return { status: ONBOARDING_STATUS.completed };
      }

      if (onboarding?.status === ONBOARDING_STATUS.limited) {
        return { status: ONBOARDING_STATUS.limited };
      }

      // Backward compatibility for older onboarding shape.
      if (typeof onboarding?.completed === 'boolean') {
        return {
          status: onboarding.completed
            ? ONBOARDING_STATUS.completed
            : ONBOARDING_STATUS.required,
        };
      }
    }

    // Existing users with saved preferences should not be forced through first-run flow again.
    const hasSavedPreferences = Boolean(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
    if (hasSavedPreferences) {
      return { status: ONBOARDING_STATUS.completed };
    }
  } catch {
    // Ignore malformed local data and fall back to first-run onboarding.
  }

  return { status: ONBOARDING_STATUS.required };
}

function canUseProvider(providerList, name) {
  return providerList.some((provider) => provider.name === name);
}

function getFallbackProviders() {
  return {
    ai: [
      { name: 'featherless', displayName: 'Featherless AI', enabled: false },
      { name: 'anthropic', displayName: 'Claude (Anthropic)', enabled: false },
      { name: 'gemini', displayName: 'Gemini (Google)', enabled: false },
      { name: 'openai', displayName: 'GPT (OpenAI)', enabled: false },
      { name: 'ollama', displayName: 'Ollama (Local)', enabled: true },
    ],
    cicd: [
      { name: 'gitlab', displayName: 'GitLab CI', fileName: '.gitlab-ci.yml', enabled: true },
      { name: 'github', displayName: 'GitHub Actions', fileName: '.github/workflows/ci.yml', enabled: true },
      { name: 'jenkins', displayName: 'Jenkins Pipeline', fileName: 'Jenkinsfile', enabled: true },
      { name: 'circleci', displayName: 'CircleCI', fileName: '.circleci/config.yml', enabled: true },
    ],
    defaults: { aiProvider: 'featherless', cicdPlatform: 'gitlab' },
    features: { advancedNodes: true, providerSelfTest: true },
  };
}

function pickInitialSelection(providerData, storedPreferences) {
  const defaultAI =
    providerData.defaults?.aiProvider ||
    providerData.ai.find((provider) => provider.enabled)?.name ||
    providerData.ai[0]?.name ||
    'featherless';

  const defaultCICD =
    providerData.defaults?.cicdPlatform ||
    providerData.cicd.find((platform) => platform.enabled)?.name ||
    providerData.cicd[0]?.name ||
    'gitlab';

  const preferredAI =
    storedPreferences?.selectedProviders?.ai &&
    canUseProvider(providerData.ai, storedPreferences.selectedProviders.ai)
      ? storedPreferences.selectedProviders.ai
      : defaultAI;

  const preferredCICD =
    storedPreferences?.selectedProviders?.cicd &&
    canUseProvider(providerData.cicd, storedPreferences.selectedProviders.cicd)
      ? storedPreferences.selectedProviders.cicd
      : defaultCICD;

  return {
    selectedProviders: {
      ai: preferredAI,
      cicd: preferredCICD,
    },
    llmType:
      storedPreferences?.llmType === 'local' || storedPreferences?.llmType === 'cloud'
        ? storedPreferences.llmType
        : inferLlmType(preferredAI),
    byomConfig: {
      ...DEFAULT_BYOM,
      enabled: Boolean(storedPreferences?.byomConfig?.enabled),
      model:
        typeof storedPreferences?.byomConfig?.model === 'string'
          ? storedPreferences.byomConfig.model
          : '',
      baseUrl:
        typeof storedPreferences?.byomConfig?.baseUrl === 'string'
          ? storedPreferences.byomConfig.baseUrl
          : '',
    },
  };
}

export default function App() {
  const [yamlOutput, setYamlOutput] = useState('');
  const [activePanel, setActivePanel] = useState('builder');
  const [importedWorkflow, setImportedWorkflow] = useState(null);

  // Provider state
  const [providers, setProviders] = useState({ ai: [], cicd: [], defaults: {} });
  const [selectedProviders, setSelectedProviders] = useState({
    ai: null,
    cicd: null,
  });
  const [byomConfig, setByomConfig] = useState(DEFAULT_BYOM);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [featureFlags, setFeatureFlags] = useState(clientFeatureFlags);
  const [llmType, setLlmType] = useState('cloud');
  const [onboardingStatus, setOnboardingStatus] = useState(
    () => readOnboardingStatus().status
  );

  const initializeWorkspaceState = useCallback((providerData, shouldUseServerFeatures = true) => {
    const storedPreferences = readStoredPreferences();
    const initial = pickInitialSelection(providerData, storedPreferences);

    setProviders(providerData);
    setFeatureFlags(
      shouldUseServerFeatures
        ? mergeFeatureFlags(clientFeatureFlags, providerData.features)
        : clientFeatureFlags
    );
    setSelectedProviders(initial.selectedProviders);
    setLlmType(initial.llmType);
    setByomConfig(initial.byomConfig);
    setProvidersLoaded(true);
  }, []);

  // Fetch available providers on mount
  useEffect(() => {
    axios
      .get('/api/config/providers')
      .then(({ data }) => {
        initializeWorkspaceState(data, true);
      })
      .catch((err) => {
        console.error('Failed to load providers:', err);
        initializeWorkspaceState(getFallbackProviders(), false);
      });
  }, [initializeWorkspaceState]);

  useEffect(() => {
    if (!providersLoaded) return;

    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          selectedProviders,
          llmType,
          byomConfig: {
            enabled: byomConfig.enabled,
            model: byomConfig.model,
            baseUrl: byomConfig.baseUrl,
          },
        })
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }, [
    byomConfig.baseUrl,
    byomConfig.enabled,
    byomConfig.model,
    llmType,
    providersLoaded,
    selectedProviders,
  ]);

  useEffect(() => {
    if (!providersLoaded) {
      return;
    }

    if (onboardingStatus === ONBOARDING_STATUS.required && activePanel !== 'settings') {
      setActivePanel('settings');
      return;
    }

    if (
      onboardingStatus === ONBOARDING_STATUS.limited &&
      !['builder', 'settings'].includes(activePanel)
    ) {
      setActivePanel('builder');
    }
  }, [activePanel, onboardingStatus, providersLoaded]);

  const handleGenerated = (result) => {
    setYamlOutput(typeof result?.yaml === 'string' ? result.yaml : '');
    setImportedWorkflow({
      nodes: Array.isArray(result?.nodes) ? result.nodes : [],
      edges: Array.isArray(result?.edges) ? result.edges : [],
    });

    if (
      typeof result?.targetPlatform === 'string' &&
      providers.cicd.some((platform) => platform.name === result.targetPlatform)
    ) {
      setSelectedProviders((prev) => ({
        ...prev,
        cicd: result.targetPlatform,
      }));
    }

    setActivePanel('builder');
  };

  const handleImportedWorkflowApplied = useCallback(() => {
    setImportedWorkflow(null);
  }, []);

  const persistOnboardingStatus = useCallback((status) => {
    try {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({
          status,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }, []);

  const handleCompleteOnboarding = useCallback(() => {
    setOnboardingStatus(ONBOARDING_STATUS.completed);
    setActivePanel('builder');
    persistOnboardingStatus(ONBOARDING_STATUS.completed);
  }, [persistOnboardingStatus]);

  const handleSkipOnboarding = useCallback(() => {
    setOnboardingStatus(ONBOARDING_STATUS.limited);
    setActivePanel('builder');
    persistOnboardingStatus(ONBOARDING_STATUS.limited);
  }, [persistOnboardingStatus]);

  const handleProviderChange = useCallback((type, value) => {
    setSelectedProviders((prev) => ({ ...prev, [type]: value }));
    if (type === 'ai') {
      setLlmType(inferLlmType(value));
    }
  }, []);

  const handleLlmTypeChange = useCallback(
    (nextType) => {
      setLlmType(nextType);

      setSelectedProviders((prev) => {
        if (nextType === 'local') {
          const hasOllama = providers.ai.some((provider) => provider.name === 'ollama');
          if (hasOllama) {
            return { ...prev, ai: 'ollama' };
          }
          return prev;
        }

        if (prev.ai !== 'ollama') {
          return prev;
        }

        const cloudProvider =
          providers.ai.find((provider) => provider.name !== 'ollama' && provider.enabled) ||
          providers.ai.find((provider) => provider.name !== 'ollama') ||
          providers.ai.find((provider) => provider.name === 'ollama');

        return cloudProvider ? { ...prev, ai: cloudProvider.name } : prev;
      });
    },
    [providers.ai]
  );

  const hasRuntimeAiOptions =
    byomConfig.enabled ||
    byomConfig.model.trim().length > 0 ||
    byomConfig.baseUrl.trim().length > 0;

  const aiOptions = hasRuntimeAiOptions
    ? {
        apiKey: byomConfig.enabled ? byomConfig.apiKey : '',
        model: byomConfig.model,
        baseUrl: byomConfig.baseUrl,
      }
    : undefined;

  // Get current CI/CD platform metadata
  const currentCICDPlatform = providers.cicd.find((p) => p.name === selectedProviders.cicd) || {
    name: 'gitlab',
    displayName: 'GitLab CI',
    fileName: '.gitlab-ci.yml',
  };

  const selectedAI = useMemo(
    () => providers.ai.find((provider) => provider.name === selectedProviders.ai) || null,
    [providers.ai, selectedProviders.ai]
  );

  const isOnboardingRequired =
    providersLoaded && onboardingStatus === ONBOARDING_STATUS.required;
  const isLimitedMode = providersLoaded && onboardingStatus === ONBOARDING_STATUS.limited;

  const currentPanelMeta = PANEL_META[activePanel] || PANEL_META.builder;
  const showSidebar = activePanel === 'builder';
  const showYamlPanel =
    Boolean(yamlOutput) &&
    activePanel !== 'chat' &&
    activePanel !== 'health' &&
    activePanel !== 'settings';

  const panelContent = (() => {
    if (activePanel === 'builder') {
      return (
        <WorkflowEditor
          onYamlExport={setYamlOutput}
          importedWorkflow={importedWorkflow}
          onImportedWorkflowApplied={handleImportedWorkflowApplied}
          cicdPlatform={selectedProviders.cicd}
        />
      );
    }

    if (activePanel === 'prompt') {
      return (
        <PromptPanel
          onGenerated={handleGenerated}
          aiProvider={selectedProviders.ai}
          cicdPlatform={selectedProviders.cicd}
          aiOptions={aiOptions}
        />
      );
    }

    if (activePanel === 'jenkins') {
      return (
        <JenkinsConverter
          onConverted={handleGenerated}
          aiProvider={selectedProviders.ai}
          cicdPlatform={selectedProviders.cicd}
          aiOptions={aiOptions}
          availablePlatforms={providers.cicd}
        />
      );
    }

    if (activePanel === 'health') {
      return (
        <HealthAdvisor
          currentYaml={yamlOutput}
          aiProvider={selectedProviders.ai}
          cicdPlatform={selectedProviders.cicd}
          aiOptions={aiOptions}
        />
      );
    }

    if (activePanel === 'chat') {
      return (
        <PipelineChat
          currentYaml={yamlOutput}
          aiProvider={selectedProviders.ai}
          cicdPlatform={selectedProviders.cicd}
          aiOptions={aiOptions}
        />
      );
    }

    return (
      <SettingsPage
        providers={providers}
        selectedProviders={selectedProviders}
        onProviderChange={handleProviderChange}
        llmType={llmType}
        onLlmTypeChange={handleLlmTypeChange}
        byomConfig={byomConfig}
        onByomChange={setByomConfig}
        providerSelfTestEnabled={featureFlags.providerSelfTest}
        isOnboarding={isOnboardingRequired}
        isLimitedMode={isLimitedMode}
        canCompleteOnboarding={Boolean(selectedProviders.ai && selectedProviders.cicd)}
        onCompleteOnboarding={handleCompleteOnboarding}
        onSkipForNow={handleSkipOnboarding}
      />
    );
  })();

  const renderNavigationButton = (item, compact = false) => {
    const isActive = activePanel === item.id;
    const isLocked =
      (isOnboardingRequired && item.id !== 'settings') ||
      (isLimitedMode && !['builder', 'settings'].includes(item.id));

    const lockedMessage = isOnboardingRequired
      ? 'Complete onboarding in Settings to unlock this page'
      : 'Limited mode: finish setup in Settings to unlock this page';

    return (
      <button
        key={item.id}
        onClick={() => {
          if (isLocked) {
            setActivePanel('settings');
            return;
          }
          setActivePanel(item.id);
        }}
        className={`ff-nav-btn ${isActive ? 'ff-nav-btn-active' : ''} ${
          compact ? 'ff-nav-btn-compact' : ''
        } ${isLocked ? 'opacity-55' : ''}`}
        title={isLocked ? lockedMessage : undefined}
      >
        <span className="text-xs opacity-70">{item.icon}</span>
        <span>{item.label}</span>
        {isLocked && <span className="ml-auto text-[10px] font-semibold opacity-70">LOCKED</span>}
      </button>
    );
  };

  const loadingView = (
    <div className="h-full ff-surface p-6 flex items-center justify-center">
      <p className="text-sm text-slate-500">Loading workspace configuration...</p>
    </div>
  );

  return (
    <div className="ff-app-shell text-slate-900">
      <div className="h-screen p-3 md:p-4">
        <div className="h-full w-full rounded-[24px] border border-slate-200/80 bg-white/70 backdrop-blur-xl shadow-[0_22px_55px_rgba(15,23,42,0.08)] overflow-hidden flex">
          <aside className="hidden lg:flex w-64 border-r border-slate-200/80 bg-white/65 flex-col">
            <div className="px-5 pt-6 pb-4 border-b border-slate-200/80">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">FlowForge</p>
              <h1 className="text-2xl font-bold tracking-tight mt-1">Pipeline Studio</h1>
              <p className="text-xs text-slate-500 mt-2">
                A cleaner workspace for generating, editing, and shipping CI/CD pipelines.
              </p>
            </div>

            <nav className="p-4 space-y-2">{NAV_ITEMS.map((item) => renderNavigationButton(item))}</nav>

            <div className="mt-auto p-4 border-t border-slate-200/80 space-y-3">
              <div className="ff-surface-soft p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Current Stack</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{selectedAI?.displayName || 'No AI provider selected'}</p>
                <p className="text-xs text-slate-500">{currentCICDPlatform.displayName}</p>
                {byomConfig.enabled && <p className="text-xs text-blue-700 mt-2">Custom key enabled</p>}
                {isOnboardingRequired && (
                  <p className="text-xs text-slate-700 mt-2 font-medium">
                    First-run setup required
                  </p>
                )}
                {isLimitedMode && (
                  <p className="text-xs text-amber-700 mt-2 font-medium">
                    Limited mode is active
                  </p>
                )}
              </div>
              <button
                onClick={() => setActivePanel('settings')}
                className="w-full ff-btn-secondary rounded-xl px-3 py-2 text-sm font-medium"
              >
                Open Settings
              </button>
            </div>
          </aside>

          <div className="flex-1 min-w-0 flex flex-col">
            <header className="border-b border-slate-200/80 bg-white/60 px-4 md:px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">
                    {currentPanelMeta.title}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">{currentPanelMeta.subtitle}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isOnboardingRequired && (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800">
                      First-run setup
                    </span>
                  )}
                  {isLimitedMode && (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800">
                      Limited mode
                    </span>
                  )}
                  <span className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-300 bg-white">
                    {selectedAI?.displayName || 'No provider'}
                  </span>
                  <span className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-300 bg-white">
                    {currentCICDPlatform.displayName}
                  </span>
                  <button
                    onClick={() => setActivePanel('settings')}
                    className="ff-btn-secondary rounded-full px-3 py-1.5 text-xs font-medium"
                  >
                    Settings
                  </button>
                </div>
              </div>

              <nav className="mt-4 lg:hidden flex gap-2 overflow-x-auto pb-1">
                {NAV_ITEMS.map((item) => renderNavigationButton(item, true))}
              </nav>
            </header>

            <main className="flex-1 min-h-0 p-3 md:p-4">
              {!providersLoaded && loadingView}

              {providersLoaded && activePanel === 'builder' && (
                <div
                  className={`h-full grid gap-3 ${
                    showYamlPanel
                      ? 'xl:grid-cols-[250px_minmax(0,1fr)_minmax(320px,380px)]'
                      : 'xl:grid-cols-[250px_minmax(0,1fr)]'
                  } grid-cols-1`}
                >
                  {showSidebar && <Sidebar featureFlags={featureFlags} />}

                  <section className="ff-surface h-full overflow-hidden ff-enter">{panelContent}</section>

                  {showYamlPanel && (
                    <YamlPreview
                      yaml={yamlOutput}
                      onClose={() => setYamlOutput('')}
                      platform={currentCICDPlatform}
                    />
                  )}
                </div>
              )}

              {providersLoaded && activePanel !== 'builder' && (
                <div
                  className={`h-full grid gap-3 ${
                    showYamlPanel
                      ? 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]'
                      : 'grid-cols-1'
                  }`}
                >
                  <section className="ff-surface h-full overflow-hidden ff-enter">{panelContent}</section>

                  {showYamlPanel && (
                    <YamlPreview
                      yaml={yamlOutput}
                      onClose={() => setYamlOutput('')}
                      platform={currentCICDPlatform}
                    />
                  )}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
