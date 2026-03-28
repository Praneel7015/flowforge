import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import YamlPreview from './components/YamlPreview';
import ErrorBoundary from './components/ErrorBoundary';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import OfflineBanner from './components/OfflineBanner';
import { getClientFeatureFlags, mergeFeatureFlags } from './utils/featureFlags';
import { useTheme } from './utils/theme';

const WorkflowEditor = lazy(() => import('./workflow/WorkflowEditor'));
const PromptPanel = lazy(() => import('./components/PromptPanel'));
const JenkinsConverter = lazy(() => import('./components/JenkinsConverter'));
const HealthAdvisor = lazy(() => import('./components/HealthAdvisor'));
const PipelineChat = lazy(() => import('./components/PipelineChat'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const clientFeatureFlags = getClientFeatureFlags();
const SETTINGS_STORAGE_KEY = 'flowforge.preferences.v1';
const ONBOARDING_STORAGE_KEY = 'flowforge.onboarding.v1';
const ONBOARDING_STATUS = {
  required: 'required',
  limited: 'limited',
  completed: 'completed',
};

const NAV_ICONS = {
  builder: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><path d="M11.5 9v5M9 11.5h5"/></svg>,
  prompt: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M4.5 4l2 2M11.5 4l-2 2"/><rect x="3" y="8" width="10" height="6" rx="1.5"/></svg>,
  jenkins: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h3M9 4h3M4 8h8M6 12h4"/><path d="M5.5 4v4M10.5 4v4M8 8v4"/></svg>,
  health: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M5 8h2l1-2 2 4 1-2h2"/></svg>,
  chat: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2v-2a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M5.5 7h5M5.5 5h3"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/></svg>,
};

const NAV_ITEMS = [
  { id: 'builder', label: 'Builder' },
  { id: 'prompt', label: 'Generate' },
  { id: 'jenkins', label: 'Migrate' },
  { id: 'health', label: 'Health' },
  { id: 'chat', label: 'Chat' },
  { id: 'settings', label: 'Settings' },
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Global ? key listener for shortcuts overlay
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

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

  const lazyFallback = (
    <div className="h-full flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[var(--ff-border)] border-t-[var(--ff-accent)] rounded-full animate-spin" />
    </div>
  );

  const panelContent = (() => {
    if (activePanel === 'builder') {
      return (
        <ErrorBoundary name="Workflow Builder" key="builder">
          <Suspense fallback={lazyFallback}>
            <WorkflowEditor
              onYamlExport={setYamlOutput}
              importedWorkflow={importedWorkflow}
              onImportedWorkflowApplied={handleImportedWorkflowApplied}
              cicdPlatform={selectedProviders.cicd}
              onRegisterAddNode={(fn) => setAddNodeToCanvas(() => fn)}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    if (activePanel === 'prompt') {
      return (
        <ErrorBoundary name="Generate" key="prompt">
          <Suspense fallback={lazyFallback}>
            <PromptPanel
              onGenerated={handleGenerated}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    if (activePanel === 'jenkins') {
      return (
        <ErrorBoundary name="Migrate" key="jenkins">
          <Suspense fallback={lazyFallback}>
            <JenkinsConverter
              onConverted={handleGenerated}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
              availablePlatforms={providers.cicd}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    if (activePanel === 'health') {
      return (
        <ErrorBoundary name="Health Advisor" key="health">
          <Suspense fallback={lazyFallback}>
            <HealthAdvisor
              currentYaml={yamlOutput}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    if (activePanel === 'chat') {
      return (
        <ErrorBoundary name="Pipeline Chat" key="chat">
          <Suspense fallback={lazyFallback}>
            <PipelineChat
              currentYaml={yamlOutput}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    return (
      <ErrorBoundary name="Settings" key="settings">
        <Suspense fallback={lazyFallback}>
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
        </Suspense>
      </ErrorBoundary>
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
          if (!compact && window.innerWidth < 1024) setSidebarOpen(false);
        }}
        className={`ff-nav-btn ${isActive ? 'ff-nav-btn-active' : ''} ${
          compact ? 'ff-nav-btn-compact' : ''
        } ${isLocked ? 'opacity-60' : ''}`}
        title={isLocked ? lockedMessage : undefined}
      >
        {!compact && NAV_ICONS[item.id] && (
          <span className="flex-shrink-0 opacity-70">{NAV_ICONS[item.id]}</span>
        )}
        <span>{item.label}</span>
        {isLocked && <span className="ml-auto text-xs font-semibold opacity-80">LOCKED</span>}
      </button>
    );
  };

  const loadingView = (
    <div className="h-full ff-surface p-6 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[var(--ff-border)] border-t-[var(--ff-accent)] rounded-full animate-spin mx-auto" />
        <p className="text-sm text-[var(--ff-text-secondary)] mt-4">Loading workspace...</p>
      </div>
    </div>
  );

  const handleBackendStatus = useCallback((isOnline) => {
    if (!isOnline) {
      const hasOllama = providers.ai.some((p) => p.name === 'ollama');
      if (hasOllama && selectedProviders.ai !== 'ollama') {
        setSelectedProviders((prev) => ({ ...prev, ai: 'ollama' }));
        setLlmType('local');
      }
    }
  }, [providers.ai, selectedProviders.ai]);

  return (
    <div className="ff-app-shell">
      <OfflineBanner onBackendStatusChange={handleBackendStatus} />
      <div className="h-screen flex">
        {/* ── Sidebar overlay (mobile only) ──── */}
        <div
          className={`fixed inset-0 z-30 bg-[var(--ff-overlay)] lg:hidden transition-opacity duration-300 ${
            sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── Sidebar ────────────────────────── */}
        <aside
          className={`fixed z-40 top-0 left-0 h-full w-60 flex flex-col border-r border-[var(--ff-card-border)] bg-[var(--ff-sidebar-bg)] backdrop-blur-xl transition-transform duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--ff-accent)]">FlowForge</p>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors"
                aria-label="Close sidebar"
                title="Close sidebar"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>
              </button>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--ff-text)] mt-0.5">Pipeline Studio</h1>
            <p className="text-[11px] text-[var(--ff-muted)] mt-1 leading-relaxed">A cleaner workspace for generating, editing, and shipping CI/CD pipelines.</p>
          </div>

          <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => renderNavigationButton(item))}
          </nav>

          <div className="p-3 space-y-2 border-t border-[var(--ff-card-border)]">
            <div className="rounded-xl bg-[var(--ff-card-bg)] border border-[var(--ff-card-border)] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ff-muted)] font-semibold">Current Stack</p>
              <p className="mt-1.5 text-sm font-semibold text-[var(--ff-text)]">{selectedAI?.displayName || 'No AI selected'}</p>
              <p className="text-xs text-[var(--ff-muted)]">{currentCICDPlatform.displayName}</p>
              {byomConfig.enabled && (
                <span className="inline-flex items-center gap-1 mt-2 text-xs text-[var(--ff-accent)]">
                  Custom key enabled
                </span>
              )}
              {isOnboardingRequired && (
                <p className="text-xs text-amber-400 mt-2 font-medium">Setup required</p>
              )}
              {isLimitedMode && (
                <p className="text-xs text-amber-400 mt-2 font-medium">Limited mode</p>
              )}
            </div>
            <button
              onClick={() => { setActivePanel('settings'); if (window.innerWidth < 1024) setSidebarOpen(false); }}
              className="w-full ff-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium text-center"
            >
              Open Settings
            </button>
          </div>
        </aside>

        {/* ── Main Area ──────────────────────── */}
        <div
          className={`flex-1 min-w-0 flex flex-col transition-[margin] duration-300 ease-in-out ${
            sidebarOpen ? 'lg:ml-60' : 'ml-0'
          }`}
        >
          {/* ── Top Bar ──────────────────────── */}
          <header className="border-b border-[var(--ff-card-border)] bg-[var(--ff-header-bg)] backdrop-blur-xl px-4 md:px-6 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors"
                    aria-label="Open sidebar"
                    title="Open sidebar"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h12M3 9h12M3 13h12"/></svg>
                  </button>
                )}
                <div>
                  <h2 className="text-lg md:text-xl font-semibold tracking-tight text-[var(--ff-text)]">
                    {currentPanelMeta.title}
                  </h2>
                  <p className="text-sm text-[var(--ff-muted)] mt-0.5">{currentPanelMeta.subtitle}</p>
                </div>
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
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="ff-theme-toggle"
                />
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
                {showSidebar && (
                  <Sidebar
                    featureFlags={featureFlags}
                    onAddNode={addNodeToCanvas}
                    onLoadTemplate={(template) => {
                      setImportedWorkflow({ nodes: template.nodes, edges: template.edges });
                      setYamlOutput('');
                    }}
                  />
                )}
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
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
