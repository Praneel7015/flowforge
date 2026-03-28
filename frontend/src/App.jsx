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
import { useTheme } from './utils/theme';

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
  const { theme, toggleTheme } = useTheme();
  const [yamlOutput, setYamlOutput] = useState('');
  const [activePanel, setActivePanel] = useState('builder');
  const [importedWorkflow, setImportedWorkflow] = useState(null);
  const [addNodeToCanvas, setAddNodeToCanvas] = useState(null);

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
          onRegisterAddNode={(fn) => setAddNodeToCanvas(() => fn)}
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
        } ${isLocked ? 'opacity-60' : ''}`}
        title={isLocked ? lockedMessage : undefined}
      >
        <span className="text-xs opacity-70">{item.icon}</span>
        <span>{item.label}</span>
        {isLocked && <span className="ml-auto text-xs font-semibold opacity-80">LOCKED</span>}
      </button>
    );
  };

  const loadingView = (
    <div className="h-full ff-surface p-6 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-[var(--ff-text-secondary)] mt-4">Loading workspace...</p>
      </div>
    </div>
  );

  return (
    <div className="ff-app-shell">
      <div className="h-screen flex">
        {/* ── Sidebar ────────────────────────── */}
        <aside className="hidden lg:flex w-60 flex-col border-r border-[var(--ff-card-border)] bg-[var(--ff-sidebar-bg)] backdrop-blur-xl">
          <div className="px-5 pt-6 pb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-[var(--ff-text)]">FlowForge</h1>
                <p className="text-[11px] text-[var(--ff-muted)] font-medium">Pipeline Studio</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {NAV_ITEMS.map((item) => renderNavigationButton(item))}
          </nav>

          <div className="p-3 space-y-3 border-t border-[var(--ff-card-border)]">
            <div className="rounded-xl bg-[var(--ff-card-bg)] border border-[var(--ff-card-border)] p-3">
              <p className="text-[11px] uppercase tracking-widest text-[var(--ff-muted)] font-medium">Stack</p>
              <p className="mt-1.5 text-sm font-semibold text-[var(--ff-text)]">{selectedAI?.displayName || 'No AI selected'}</p>
              <p className="text-xs text-[var(--ff-muted)]">{currentCICDPlatform.displayName}</p>
              {byomConfig.enabled && (
                <span className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Custom key
                </span>
              )}
              {isOnboardingRequired && (
                <p className="text-xs text-amber-400 mt-2 font-medium">Setup required</p>
              )}
              {isLimitedMode && (
                <p className="text-xs text-amber-400 mt-2 font-medium">Limited mode</p>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main Area ──────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* ── Top Bar ──────────────────────── */}
          <header className="border-b border-[var(--ff-card-border)] bg-[var(--ff-header-bg)] backdrop-blur-xl px-4 md:px-6 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg md:text-xl font-semibold tracking-tight text-[var(--ff-text)]">
                  {currentPanelMeta.title}
                </h2>
                <p className="text-sm text-[var(--ff-muted)] mt-0.5">{currentPanelMeta.subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isOnboardingRequired && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    Setup required
                  </span>
                )}
                {isLimitedMode && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    Limited
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)]">
                  {selectedAI?.displayName || 'No provider'}
                </span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)]">
                  {currentCICDPlatform.displayName}
                </span>
                <button
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="ff-btn-secondary rounded-lg p-1.5 text-xs"
                >
                  {theme === 'dark' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  )}
                </button>
                <button
                  onClick={() => setActivePanel('settings')}
                  className="ff-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Settings
                </button>
              </div>
            </div>

            <nav className="mt-3 lg:hidden flex gap-2 overflow-x-auto pb-1">
              {NAV_ITEMS.map((item) => renderNavigationButton(item, true))}
            </nav>
          </header>

          {/* ── Content ──────────────────────── */}
          <main className="flex-1 min-h-0 p-2.5 md:p-3">
            {!providersLoaded && loadingView}

            {providersLoaded && activePanel === 'builder' && (
              <div
                className={`h-full grid gap-2.5 ${
                  showYamlPanel
                    ? 'xl:grid-cols-[240px_minmax(0,1fr)_minmax(320px,380px)]'
                    : 'xl:grid-cols-[240px_minmax(0,1fr)]'
                } grid-cols-1`}
              >
                {showSidebar && <Sidebar featureFlags={featureFlags} onAddNode={addNodeToCanvas} />}
                <section className="ff-surface h-full overflow-hidden ff-enter">{panelContent}</section>
                {showYamlPanel && (
                  <YamlPreview yaml={yamlOutput} onClose={() => setYamlOutput('')} platform={currentCICDPlatform} />
                )}
              </div>
            )}

            {providersLoaded && activePanel !== 'builder' && (
              <div
                className={`h-full grid gap-2.5 ${
                  showYamlPanel
                    ? 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]'
                    : 'grid-cols-1'
                }`}
              >
                <section className="ff-surface h-full overflow-hidden ff-enter">{panelContent}</section>
                {showYamlPanel && (
                  <YamlPreview yaml={yamlOutput} onClose={() => setYamlOutput('')} platform={currentCICDPlatform} />
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
