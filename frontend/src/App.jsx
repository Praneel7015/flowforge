import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import YamlPreview from './components/YamlPreview';
import ProviderSelector from './components/ProviderSelector';
import ErrorBoundary from './components/ErrorBoundary';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import OfflineBanner from './components/OfflineBanner';
import ThemeToggleButton from './components/ThemeToggleButton';
import ImportPipelineModal from './components/ImportPipelineModal';
import { getClientFeatureFlags, mergeFeatureFlags } from './utils/featureFlags';
import { buildAiOptions, EXTRA_FIELD_NAMES, SECRET_FIELD_NAMES } from './utils/providerFields';
const WorkflowEditor = lazy(() => import('./workflow/WorkflowEditor'));
const JenkinsConverter = lazy(() => import('./components/JenkinsConverter'));
const HealthAdvisor = lazy(() => import('./components/HealthAdvisor'));
const PipelineChat = lazy(() => import('./components/PipelineChat'));
const LiveRunsPanel = lazy(() => import('./components/LiveRunsPanel'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SmartGeneratePage = lazy(() => import('./pages/SmartGeneratePage'));

const clientFeatureFlags = getClientFeatureFlags();
const SETTINGS_STORAGE_KEY = 'flowforge.preferences.v1';
const ONBOARDING_STORAGE_KEY = 'flowforge.onboarding.v1';
const YAML_WIDTH_KEY = 'flowforge.yaml.width.v1';
const YAML_COLLAPSED_KEY = 'flowforge.yaml.collapsed.v1';
const YAML_MIN_WIDTH = 320;
const YAML_MAX_WIDTH = 760;
const YAML_DEFAULT_WIDTH = 380;
const clampYamlWidth = (value) => Math.max(YAML_MIN_WIDTH, Math.min(YAML_MAX_WIDTH, value));

function readLocalStorage(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
const ONBOARDING_STATUS = {
  required: 'required',
  limited: 'limited',
  completed: 'completed',
};

const NAV_ICONS = {
  builder: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><path d="M11.5 9v5M9 11.5h5"/></svg>,
  prompt: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M4.5 4l2 2M11.5 4l-2 2"/><rect x="3" y="8" width="10" height="6" rx="1.5"/></svg>,
  repo: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M4.5 4l2 2M11.5 4l-2 2"/><rect x="3" y="8" width="10" height="6" rx="1.5"/></svg>,
  jenkins: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h3M9 4h3M4 8h8M6 12h4"/><path d="M5.5 4v4M10.5 4v4M8 8v4"/></svg>,
  health: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M5 8h2l1-2 2 4 1-2h2"/></svg>,
  chat: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2v-2a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M5.5 7h5M5.5 5h3"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/></svg>,
};

const NAV_ITEMS = [
  { id: 'builder', label: 'Builder' },
  { id: 'repo', label: 'AI Generator' },
  { id: 'jenkins', label: 'Migrate' },
  { id: 'health', label: 'Health' },
  { id: 'chat', label: 'Assistant' },
  { id: 'settings', label: 'Settings' },
];

const INSPECTOR_TABS = [
  { id: 'code', label: 'YAML' },
  { id: 'health', label: 'Health' },
  { id: 'copilot', label: 'Assistant' },
  { id: 'runs', label: 'Runs' },
];

const PANEL_META = {
  builder: {
    title: 'Workflow Builder',
    subtitle: 'Build pipelines visually, connect stages, and export clean CI/CD YAML.',
  },
  prompt: {
    title: 'AI Generator',
    subtitle: 'Describe the workflow or attach repository files to generate a production-ready pipeline.',
  },
  repo: {
    title: 'AI Generator',
    subtitle: 'Prompt templates + repository context to generate and push tailored CI/CD pipelines.',
  },
  jenkins: {
    title: 'Migrate Existing Pipeline',
    subtitle: 'Convert Jenkinsfiles and CI configs into modern pipeline configs and editable nodes.',
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
  ...Object.fromEntries(EXTRA_FIELD_NAMES.map((name) => [name, ''])),
};

// Non-secret BYOM fields saved with workspace settings. API keys and cloud
// credentials are kept in memory only and never written to browser storage.
const PERSISTED_BYOM_FIELDS = ['model', 'baseUrl', ...EXTRA_FIELD_NAMES.filter((n) => !SECRET_FIELD_NAMES.includes(n))];

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
    // Ignore malformed local data and fall back to completed so builder is unlocked by default.
  }

  return { status: ONBOARDING_STATUS.completed };
}

function canUseProvider(providerList, name) {
  return providerList.some((provider) => provider.name === name);
}

function getFallbackProviders() {
  return {
    ai: [
      { name: 'groq', displayName: 'Groq (openai/gpt-oss-120b)', enabled: true },
      { name: 'anthropic', displayName: 'Claude (claude-sonnet-5-5)', enabled: false },
      { name: 'gemini', displayName: 'Gemini (gemini-3.8-flash)', enabled: false },
      { name: 'openai', displayName: 'OpenAI (gpt-6-luna)', enabled: false },
      { name: 'vertex', displayName: 'Vertex AI (gemini-3.8-flash)', enabled: false },
      { name: 'bedrock', displayName: 'AWS Bedrock (us.anthropic.claude-sonnet-4-6)', enabled: false },
      { name: 'openai_compatible', displayName: 'OpenAI-compatible endpoint', enabled: false },
      { name: 'ollama', displayName: 'Ollama (Local)', enabled: true },
    ],
    cicd: [
      { name: 'gitlab', displayName: 'GitLab CI', fileName: '.gitlab-ci.yml', enabled: true },
      { name: 'github', displayName: 'GitHub Actions', fileName: '.github/workflows/ci.yml', enabled: true },
      { name: 'jenkins', displayName: 'Jenkins Pipeline', fileName: 'Jenkinsfile', enabled: true },
      { name: 'circleci', displayName: 'CircleCI', fileName: '.circleci/config.yml', enabled: true },
      { name: 'bitbucket', displayName: 'Bitbucket Pipelines', fileName: 'bitbucket-pipelines.yml', enabled: true },
    ],
    defaults: { aiProvider: 'groq', cicdPlatform: 'gitlab' },
    features: { advancedNodes: true, providerSelfTest: true },
  };
}

function pickInitialSelection(providerData, storedPreferences) {
  const enabledCloud = providerData.ai.find(
    (provider) => provider.enabled && provider.name !== 'ollama'
  );
  const defaultAI =
    enabledCloud?.name ||
    providerData.defaults?.aiProvider ||
    providerData.ai.find((provider) => provider.enabled)?.name ||
    providerData.ai[0]?.name ||
    'groq';

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
      ...Object.fromEntries(
        PERSISTED_BYOM_FIELDS.map((name) => [
          name,
          typeof storedPreferences?.byomConfig?.[name] === 'string' ? storedPreferences.byomConfig[name] : '',
        ])
      ),
    },
  };
}

export default function App({ onBackToLanding }) {
  const [yamlOutput, setYamlOutput] = useState('');
  const [activePanel, setActivePanel] = useState('builder');
  const [inspectorTab, setInspectorTab] = useState('code'); // 'code' | 'health' | 'copilot' | 'runs'
  const [importedWorkflow, setImportedWorkflow] = useState(null);
  const [addNodeToCanvas, setAddNodeToCanvas] = useState(null);
  const [nodeRunStatuses, setNodeRunStatuses] = useState({});
  const [canvasGraph, setCanvasGraph] = useState({ nodes: [], edges: [] });

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Resizable / collapsible YAML preview panel.
  const [yamlWidth, setYamlWidth] = useState(() => {
    const stored = Number(readLocalStorage(YAML_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampYamlWidth(stored) : YAML_DEFAULT_WIDTH;
  });
  const [yamlCollapsed, setYamlCollapsed] = useState(() => readLocalStorage(YAML_COLLAPSED_KEY) === 'true');

  const handleYamlResize = useCallback((deltaX) => {
    setYamlWidth((current) => clampYamlWidth(current - deltaX));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(YAML_WIDTH_KEY, String(yamlWidth));
    } catch {
      /* ignore */
    }
  }, [yamlWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(YAML_COLLAPSED_KEY, String(yamlCollapsed));
    } catch {
      /* ignore */
    }
  }, [yamlCollapsed]);

  // Global ? key listener for shortcuts overlay
  const [mobileBuilderTab, setMobileBuilderTab] = useState('canvas'); // 'library' | 'canvas' | 'yaml'
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
            ...Object.fromEntries(PERSISTED_BYOM_FIELDS.map((name) => [name, byomConfig[name] || ''])),
          },
        })
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }, [
    byomConfig,
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
      !['builder', 'settings', 'repo'].includes(activePanel)
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

  const handlePipelineImported = (result) => {
    // Align the target platform with what was detected so labels/filenames match.
    if (
      typeof result?.detectedPlatform === 'string' &&
      providers.cicd.some((platform) => platform.name === result.detectedPlatform)
    ) {
      setSelectedProviders((prev) => ({ ...prev, cicd: result.detectedPlatform }));
    }
    handleGenerated(result);
    setShowImport(false);
  };

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

  // Every AI-provider change goes through here (provider dropdowns and the
  // Cloud/Local toggle). The key, model and base URL fields are shared across
  // providers, so they are cleared whenever the provider actually changes:
  // an OpenAI key or model must never be sent to Groq, Vertex or Bedrock.
  const selectAiProvider = useCallback(
    (nextAi) => {
      if (!nextAi || nextAi === selectedProviders.ai) return;
      setSelectedProviders((prev) => ({ ...prev, ai: nextAi }));
      setByomConfig((prev) => ({ ...prev, apiKey: '', model: '', baseUrl: '' }));
    },
    [selectedProviders.ai]
  );

  const handleProviderChange = useCallback(
    (type, value) => {
      if (type === 'ai') {
        setLlmType(inferLlmType(value));
        selectAiProvider(value);
        return;
      }
      setSelectedProviders((prev) => ({ ...prev, [type]: value }));
    },
    [selectAiProvider]
  );

  const handleLlmTypeChange = useCallback(
    (nextType) => {
      setLlmType(nextType);
      const current = selectedProviders.ai;

      if (nextType === 'local') {
        if (providers.ai.some((provider) => provider.name === 'ollama')) selectAiProvider('ollama');
        return;
      }

      if (current !== 'ollama') return;
      const cloudProvider =
        providers.ai.find((provider) => provider.name !== 'ollama' && provider.enabled) ||
        providers.ai.find((provider) => provider.name !== 'ollama');
      if (cloudProvider) selectAiProvider(cloudProvider.name);
    },
    [providers.ai, selectedProviders.ai, selectAiProvider]
  );

  const aiOptions = useMemo(
    () => buildAiOptions(selectedProviders.ai, byomConfig),
    [selectedProviders.ai, byomConfig]
  );

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
    activePanel === 'builder' ||
    (Boolean(yamlOutput) &&
      activePanel !== 'chat' &&
      activePanel !== 'health' &&
      activePanel !== 'settings');

  // Width of the right inspector grid column: a slim strip when collapsed, otherwise the
  // (persisted, resizable) width. Consumed via the `--yaml-col` CSS variable.
  const yamlColValue = yamlCollapsed ? '2.75rem' : `${yamlWidth}px`;

  const startInspectorResize = useCallback(
    (event) => {
      event.preventDefault();
      const onMove = (ev) => handleYamlResize(ev.movementX);
      const stop = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', stop);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', stop);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [handleYamlResize]
  );

  const lazyFallback = (
    <div className="h-full flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[var(--ff-border)] border-t-[var(--ff-accent)] rounded-full animate-spin" />
    </div>
  );

  const renderYamlRegion = () => {
    if (!showYamlPanel) return null;

    if (yamlCollapsed) {
      return (
        <button
          onClick={() => setYamlCollapsed(false)}
          title="Expand Studio Inspector (Code, Health, Assistant, Live Runs)"
          aria-label="Expand Studio Inspector"
          className="ff-surface h-full w-full flex xl:flex-col items-center justify-center gap-2 text-[var(--ff-muted)] hover:text-[var(--ff-text)] transition-colors ff-enter"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3L7 8l5 5M7 3L2 8l5 5" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] xl:[writing-mode:vertical-rl] xl:rotate-180">
            INSPECTOR
          </span>
        </button>
      );
    }

    if (activePanel !== 'builder') {
      return (
        <YamlPreview
          yaml={yamlOutput}
          onClose={() => setYamlCollapsed(true)}
          onResizeDelta={handleYamlResize}
          platform={currentCICDPlatform}
          onSyncToCanvas={handlePipelineImported}
        />
      );
    }

    return (
      <aside className="ff-surface relative flex flex-col h-full min-h-[280px] ff-enter overflow-hidden">
        {/* Resize handle (desktop only) */}
        <div
          onMouseDown={startInspectorResize}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize Studio Inspector"
          className="group hidden xl:block absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize z-20"
        >
          <div className="mx-auto h-full w-0.5 group-hover:bg-[var(--ff-accent)] transition-colors" />
        </div>

        {/* Segmented Docked Studio Inspector Header: YAML | Health | Assistant | Runs */}
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-[var(--ff-card-border)] bg-[var(--ff-surface-2)]">
          <div className="flex items-center gap-0.5 flex-1 min-w-0 p-0.5 rounded-lg bg-[var(--ff-card-bg)] border border-[var(--ff-card-border)]">
            {INSPECTOR_TABS.map((tab) => {
              const active = inspectorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setInspectorTab(tab.id)}
                  className={`flex-1 inline-flex items-center justify-center py-1 px-2 rounded-md text-xs font-medium transition-colors truncate ${
                    active
                      ? 'bg-[var(--ff-accent)] text-white font-semibold shadow-sm'
                      : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)]'
                  }`}
                  title={`Switch inspector to ${tab.label}`}
                >
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {(inspectorTab === 'health' || inspectorTab === 'copilot') && (
              <button
                type="button"
                onClick={() => setActivePanel(inspectorTab === 'health' ? 'health' : 'chat')}
                title="Open in full workspace view"
                aria-label="Open in full workspace view"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2h4v4M6 14H2v-4M14 2L9.5 6.5M2 14l4.5-4.5" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => setYamlCollapsed(true)}
              title="Collapse Studio Inspector"
              aria-label="Collapse Studio Inspector"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 3l5 5-5 5M9 3l5 5-5 5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Active Docked Tab Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {inspectorTab === 'code' && (
            <YamlPreview
              yaml={yamlOutput}
              platform={currentCICDPlatform}
              onSyncToCanvas={handlePipelineImported}
            />
          )}
          {inspectorTab === 'health' && (
            <ErrorBoundary name="Docked Health Advisor" key="docked-health">
              <Suspense fallback={lazyFallback}>
                <HealthAdvisor
                  currentYaml={yamlOutput}
                  aiProvider={selectedProviders.ai}
                  cicdPlatform={selectedProviders.cicd}
                  aiOptions={aiOptions}
                  onLoadToBuilder={handleGenerated}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {inspectorTab === 'copilot' && (
            <ErrorBoundary name="Docked Assistant" key="docked-copilot">
              <Suspense fallback={lazyFallback}>
                <PipelineChat
                  currentYaml={yamlOutput}
                  aiProvider={selectedProviders.ai}
                  cicdPlatform={selectedProviders.cicd}
                  aiOptions={aiOptions}
                  onApplyToCanvas={handleGenerated}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {inspectorTab === 'runs' && (
            <ErrorBoundary name="Live Runs Telemetry" key="docked-runs">
              <Suspense fallback={lazyFallback}>
                <LiveRunsPanel
                  currentYaml={yamlOutput}
                  cicdPlatform={selectedProviders.cicd}
                  aiProvider={selectedProviders.ai}
                  aiOptions={aiOptions}
                  canvasGraph={canvasGraph}
                  onUpdateNodeStatuses={setNodeRunStatuses}
                  onApplyFixedPipeline={handlePipelineImported}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      </aside>
    );
  };

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
              onOpenImport={() => setShowImport(true)}
              onPlatformDetected={(plat) => {
                if (plat && providers.cicd.some((p) => p.name === plat)) {
                  setSelectedProviders((prev) => ({ ...prev, cicd: plat }));
                }
              }}
              nodeRunStatuses={nodeRunStatuses}
              onGraphChange={setCanvasGraph}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    if (activePanel === 'prompt' || activePanel === 'repo') {
      return (
        <ErrorBoundary name="AI Generator" key="repo">
          <Suspense fallback={lazyFallback}>
            <SmartGeneratePage
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
              onLoadToBuilder={handleGenerated}
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
              onApplyToCanvas={handleGenerated}
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
    const isDockedHealthActive =
      activePanel === 'builder' && !yamlCollapsed && inspectorTab === 'health' && item.id === 'health';
    const isDockedCopilotActive =
      activePanel === 'builder' && !yamlCollapsed && inspectorTab === 'copilot' && item.id === 'chat';
    const isActive = activePanel === item.id || isDockedHealthActive || isDockedCopilotActive;
    const isLocked =
      (isOnboardingRequired && item.id !== 'settings') ||
      (isLimitedMode && !['builder', 'settings', 'repo'].includes(item.id));

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
          // Clicking Health or Assistant on desktop docks them right beside the visual DAG canvas!
          // Clicking a second time toggles full-screen view.
          if ((item.id === 'health' || item.id === 'chat') && typeof window !== 'undefined' && window.innerWidth >= 1280) {
            const targetTab = item.id === 'health' ? 'health' : 'copilot';
            if (activePanel === 'builder' && !yamlCollapsed && inspectorTab === targetTab) {
              setActivePanel(item.id);
            } else {
              setActivePanel('builder');
              setYamlCollapsed(false);
              setInspectorTab(targetTab);
            }
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
        {/* ── Sidebar overlay ────────────────── */}
        <div
          className={`fixed inset-0 z-30 bg-[var(--ff-overlay)] transition-opacity duration-300 ${
            sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── Slide-over Navigation Drawer ───── */}
        <aside
          className={`fixed z-40 top-0 left-0 h-full w-60 flex flex-col border-r border-[var(--ff-card-border)] bg-[var(--ff-sidebar-bg)] backdrop-blur-xl transition-transform duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-[var(--ff-card-border)]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--ff-accent)]">FlowForge</p>
              <h1 className="text-base font-bold tracking-tight text-[var(--ff-text)]">Pipeline Studio</h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--ff-muted)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5"/></svg>
            </button>
          </div>

          <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => renderNavigationButton(item))}
          </nav>

          <div className="p-3 border-t border-[var(--ff-card-border)]">
            <div className="rounded-xl bg-[var(--ff-card-bg)] border border-[var(--ff-card-border)] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ff-muted)] font-semibold">Current Stack</p>
              <p className="mt-1 text-xs font-semibold text-[var(--ff-text)]">{selectedAI?.displayName || 'No AI selected'}</p>
              <p className="text-xs text-[var(--ff-muted)]">{currentCICDPlatform.displayName}</p>
              {byomConfig.enabled && (
                <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-[var(--ff-accent)]">
                  Custom key enabled
                </span>
              )}
              {isOnboardingRequired && (
                <p className="text-xs text-amber-400 mt-1.5 font-medium">Setup required</p>
              )}
              {isLimitedMode && (
                <p className="text-xs text-amber-400 mt-1.5 font-medium">Limited mode</p>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main Area ──────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* ── Top Bar (48px single-line studio toolbar) ── */}
          <header className="border-b border-[var(--ff-card-border)] bg-[var(--ff-header-bg)] backdrop-blur-xl px-3 md:px-4">
            <div className="h-12 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setSidebarOpen((v) => !v)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)] transition-colors flex-shrink-0"
                  aria-label="Toggle navigation sidebar"
                  title="Toggle navigation sidebar"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
                    <path d="M6 2.5v11" />
                  </svg>
                </button>

                <div className="flex items-center gap-1.5 text-sm min-w-0">
                  {onBackToLanding ? (
                    <button
                      type="button"
                      onClick={onBackToLanding}
                      className="font-semibold tracking-tight text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] transition-colors truncate"
                      title="Back to FlowForge overview"
                    >
                      FlowForge
                    </button>
                  ) : (
                    <span className="font-semibold tracking-tight text-[var(--ff-text-secondary)]">
                      FlowForge
                    </span>
                  )}
                  <span className="lg:hidden text-[var(--ff-muted)] select-none">/</span>
                  <h2 className="lg:hidden font-semibold tracking-tight text-[var(--ff-text)] truncate">
                    {currentPanelMeta.title}
                  </h2>
                </div>
              </div>

              {/* Compact Top-Bar Navigation Pill Bar (desktop) */}
              <nav
                className="hidden lg:flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)]"
                aria-label="Workspace navigation"
              >
                {NAV_ITEMS.map((item) => {
                  const isDockedHealthActive =
                    activePanel === 'builder' && !yamlCollapsed && inspectorTab === 'health' && item.id === 'health';
                  const isDockedCopilotActive =
                    activePanel === 'builder' && !yamlCollapsed && inspectorTab === 'copilot' && item.id === 'chat';
                  const isActive = activePanel === item.id || isDockedHealthActive || isDockedCopilotActive;
                  const isLocked =
                    (isOnboardingRequired && item.id !== 'settings') ||
                    (isLimitedMode && !['builder', 'settings', 'repo'].includes(item.id));

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          setActivePanel('settings');
                          return;
                        }
                        if ((item.id === 'health' || item.id === 'chat') && typeof window !== 'undefined' && window.innerWidth >= 1280) {
                          const targetTab = item.id === 'health' ? 'health' : 'copilot';
                          if (activePanel === 'builder' && !yamlCollapsed && inspectorTab === targetTab) {
                            setActivePanel(item.id);
                          } else {
                            setActivePanel('builder');
                            setYamlCollapsed(false);
                            setInspectorTab(targetTab);
                          }
                          return;
                        }
                        setActivePanel(item.id);
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-[var(--ff-accent)] text-white font-semibold shadow-sm'
                          : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)] hover:bg-[var(--ff-nav-hover)]'
                      } ${isLocked ? 'opacity-60' : ''}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              <div className="flex items-center gap-2 flex-shrink-0">
                {(providers.ai?.length > 0 || providers.cicd?.length > 0) && (
                  <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] p-0.5">
                    {providers.ai?.length > 0 && (
                      <ProviderSelector
                        type="ai"
                        providers={providers.ai}
                        selected={selectedProviders.ai}
                        onChange={(val) => handleProviderChange('ai', val)}
                        compact
                        allowDisabled
                        className="!border-0 !bg-transparent hover:!bg-[var(--ff-nav-hover)] focus:!shadow-none"
                      />
                    )}
                    {providers.ai?.length > 0 && providers.cicd?.length > 0 && (
                      <span className="w-px h-4 bg-[var(--ff-card-border-strong)]" aria-hidden="true" />
                    )}
                    {providers.cicd?.length > 0 && (
                      <ProviderSelector
                        type="cicd"
                        providers={providers.cicd}
                        selected={selectedProviders.cicd}
                        onChange={(val) => handleProviderChange('cicd', val)}
                        compact
                        className="!border-0 !bg-transparent hover:!bg-[var(--ff-nav-hover)] focus:!shadow-none"
                      />
                    )}
                  </div>
                )}
                <ThemeToggleButton />
              </div>
            </div>

            <nav className="lg:hidden flex gap-1.5 overflow-x-auto pb-2 pt-0.5 border-t border-[var(--ff-card-border)]">
              {NAV_ITEMS.map((item) => renderNavigationButton(item, true))}
            </nav>
          </header>

          {/* ── Content ──────────────────────── */}
          <main className="flex-1 min-h-0 p-2.5 md:p-3">
            {!providersLoaded && loadingView}

            {providersLoaded && activePanel === 'builder' && (
              <div className="h-full flex flex-col gap-2">
                {/* Mobile / Tablet segmented view switcher (<1280px) */}
                <div className="xl:hidden flex items-center justify-between gap-1 p-1 rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-surface)]">
                  {[
                    { id: 'library', label: '+ Add Nodes & Templates' },
                    { id: 'canvas', label: 'Visual Canvas' },
                    { id: 'yaml', label: `YAML (${currentCICDPlatform.fileName.split('/').pop()})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setMobileBuilderTab(tab.id)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                        mobileBuilderTab === tab.id
                          ? 'bg-[var(--ff-accent)] text-white font-semibold'
                          : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Desktop 3-column layout + Mobile active tab view */}
                <div
                  className={`flex-1 min-h-0 grid gap-2.5 ${
                    showYamlPanel
                      ? 'xl:grid-cols-[220px_minmax(0,1fr)_var(--yaml-col)]'
                      : 'xl:grid-cols-[220px_minmax(0,1fr)]'
                  } grid-cols-1`}
                  style={showYamlPanel ? { '--yaml-col': yamlColValue } : undefined}
                >
                  {showSidebar && (
                    <div className={`${mobileBuilderTab === 'library' ? 'block' : 'hidden'} xl:block h-full overflow-hidden rounded-xl`}>
                      <Sidebar
                        featureFlags={featureFlags}
                        onAddNode={(type, label) => {
                          addNodeToCanvas?.(type, label);
                          setMobileBuilderTab('canvas');
                        }}
                        onImport={() => setShowImport(true)}
                        onLoadTemplate={(template) => {
                          setImportedWorkflow({ nodes: template.nodes, edges: template.edges });
                          setYamlOutput('');
                          setMobileBuilderTab('canvas');
                        }}
                      />
                    </div>
                  )}
                  <section
                    className={`ff-surface h-full overflow-hidden ff-enter ${
                      mobileBuilderTab === 'canvas' ? 'block' : 'hidden'
                    } xl:block`}
                  >
                    {panelContent}
                  </section>
                  <div
                    className={`${
                      mobileBuilderTab === 'yaml' ? 'block' : 'hidden'
                    } xl:block h-full overflow-hidden`}
                  >
                    {mobileBuilderTab === 'yaml' && !showYamlPanel ? (
                      <YamlPreview
                        yaml={yamlOutput}
                        onClose={() => setMobileBuilderTab('canvas')}
                        platform={currentCICDPlatform}
                        onSyncToCanvas={handlePipelineImported}
                      />
                    ) : (
                      renderYamlRegion()
                    )}
                  </div>
                </div>
              </div>
            )}

            {providersLoaded && activePanel !== 'builder' && (
              <div
                className={`h-full grid gap-2.5 ${
                  showYamlPanel
                    ? 'xl:grid-cols-[minmax(0,1fr)_var(--yaml-col)]'
                    : 'grid-cols-1'
                }`}
                style={showYamlPanel ? { '--yaml-col': yamlColValue } : undefined}
              >
                <section className="ff-surface h-full overflow-hidden ff-enter">{panelContent}</section>
                {renderYamlRegion()}
              </div>
            )}
          </main>
        </div>
      </div>
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <ImportPipelineModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={handlePipelineImported}
        cicdPlatform={selectedProviders.cicd}
        availablePlatforms={providers.cicd}
      />
    </div>
  );
}
