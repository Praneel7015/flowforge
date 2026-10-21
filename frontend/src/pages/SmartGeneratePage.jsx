import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import RepoBrowser from '../components/RepoBrowser';
import FileTreePicker from '../components/FileTreePicker';
import PushToRepoModal from '../components/PushToRepoModal';

const CREDS_KEY = 'flowforge.platformCredentials.v1';
const SUPPORTED_PLATFORMS = ['github', 'gitlab', 'bitbucket'];
const PLATFORM_LABELS = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };
const PLATFORM_NAMES = {
  gitlab: 'GitLab CI',
  github: 'GitHub Actions',
  jenkins: 'Jenkins',
  circleci: 'CircleCI',
  bitbucket: 'Bitbucket Pipelines',
};

const PLATFORM_ICONS = {
  github: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="6" r="1.5"/><path d="M5 5.5v5M11 7.5c0 2.5-6 1.5-6 3"/>
    </svg>
  ),
  gitlab: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13.5L2 9l1.8-6L6 7.5h4L12.2 3 14 9 8 13.5z"/>
    </svg>
  ),
  bitbucket: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3h11l-1.6 10H4.1L2.5 3z"/><path d="M6.2 6.5h3.6l-.5 3.2H6.7l-.5-3.2z"/>
    </svg>
  ),
};

const FULL_NODE_COVERAGE = [
  'trigger_push',
  'trigger_mr',
  'cache_restore',
  'build',
  'matrix_build',
  'lint',
  'test',
  'integration_test',
  'smoke_test',
  'security_scan',
  'cache_save',
  'package',
  'release',
  'conditional',
  'approval_gate',
  'deploy',
  'canary_deploy',
  'blue_green_deploy',
  'rollback',
  'notify',
];

function buildProductionTemplate(platformLabel) {
  return `Create a production-grade ${platformLabel} pipeline.

Project details:
- Stack: Node.js API + React frontend
- Package manager: npm
- Environments: staging and production
- Deployment branch: main

Pipeline requirements:
- Triggers: push and merge request
- Performance: restore/save dependency cache and use matrix build for Node 18 and 20
- Quality gates: lint, unit tests, integration tests, smoke tests, security scan
- Packaging and release: create artifact/package and release stage
- Deployment safety: approval gate before production
- Deploy strategy: canary deploy, then blue/green cutover
- Reliability: rollback plan if health checks fail
- Communication: notify team on success/failure
- Branch policy: use conditional logic so production deploy only happens on main

Node expectations:
- Use these node types when relevant: ${FULL_NODE_COVERAGE.join(', ')}
- Fill useful config values (matrix, cacheKey/cachePaths, artifactPath, tag, approver, trafficPercent, activeColor, channel, condition)

Output quality:
- YAML must be valid and runnable
- Node graph should be fully connected and easy to read`;
}

function buildFullCoverageExample(platformLabel) {
  return `Generate a comprehensive ${platformLabel} pipeline that demonstrates all available builder node types in a realistic flow.

Use this end-to-end sequence:
trigger_push + trigger_mr -> cache_restore -> build -> matrix_build -> lint -> test -> integration_test -> smoke_test -> security_scan -> cache_save -> package -> release -> conditional -> approval_gate -> deploy -> canary_deploy -> blue_green_deploy -> rollback -> notify

Constraints:
- Production deploy only on main branch
- Canary rollout starts at 10% traffic
- Blue/green switch uses activeColor=green
- Include rollback behavior and team notification
- Use meaningful scripts and config values for each advanced node
- Return robust, clean YAML and matching React Flow nodes/edges`;
}

function readStoredCredentials() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function hasCredentials(creds, platform) {
  if (!creds[platform]) return false;
  if (platform === 'bitbucket') return !!(creds[platform].username && creds[platform].appPassword);
  return !!(creds[platform].token);
}

export default function SmartGeneratePage({ onGenerated, aiProvider, cicdPlatform, aiOptions }) {
  const allCreds = readStoredCredentials();
  const connectedPlatforms = SUPPORTED_PLATFORMS.filter((p) => hasCredentials(allCreds, p));
  const targetPlatformLabel = PLATFORM_NAMES[cicdPlatform] || 'CI/CD';

  const [repoContextOpen, setRepoContextOpen] = useState(connectedPlatforms.length > 0);
  const [platform, setPlatform] = useState(connectedPlatforms[0] || 'github');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [repoOwner, setRepoOwner] = useState('');

  const [tree, setTree] = useState([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState('');
  const [selectedPaths, setSelectedPaths] = useState([]);

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [generatedResult, setGeneratedResult] = useState(null);
  const [genError, setGenError] = useState('');

  const [showPushModal, setShowPushModal] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const creds = allCreds[platform] || {};

  const examplePrompts = [
    `Create a production-ready ${targetPlatformLabel} pipeline for a Node.js service that uses cache restore/save, matrix builds, lint, unit/integration/smoke tests, security scanning, packaging, release, approval gate, canary deployment, blue/green cutover, rollback, and notifications.`,
    `Design a ${targetPlatformLabel} monorepo pipeline (frontend + backend) with branch-aware conditional deployment, artifact packaging, parallel test strategy, and environment-specific deployment controls with rollback.`,
    `Generate a ${targetPlatformLabel} pipeline for a Python API with security-first defaults: pinned images, dependency scan, secret-safe practices, approval before production, staged canary rollout, and incident notifications.`,
    `Create a highly reliable ${targetPlatformLabel} pipeline for a React app: restore cache, build, lint, test, integration checks, smoke tests, package artifacts, release tag, and deploy only from main via conditional gate.`,
  ];

  const handleRepoSelect = useCallback(
    (repoName, ownerFromRepo) => {
      setSelectedRepo(repoName);
      setSelectedBranch('');
      setTree([]);
      setSelectedPaths([]);
      setGeneratedYaml('');
      setPushResult(null);

      const resolvedOwner =
        typeof ownerFromRepo === 'string' ? ownerFromRepo : ownerFromRepo?.owner;
      const platformCreds = allCreds[platform] || {};
      setRepoOwner(resolvedOwner || platformCreds.username || platformCreds.workspace || '');
    },
    [platform, allCreds]
  );

  const handleBranchSelect = useCallback((branch) => {
    setSelectedBranch(branch);
    setTree([]);
    setSelectedPaths([]);
  }, []);

  const canProceedToFiles = Boolean(selectedRepo && selectedBranch);

  const loadTree = useCallback(async () => {
    if (!canProceedToFiles) return;
    setLoadingTree(true);
    setTreeError('');
    setTree([]);
    try {
      const { data } = await axios.post('/api/repo/tree', {
        platform,
        credentials: creds,
        owner: repoOwner,
        repo: selectedRepo,
        branch: selectedBranch,
      });
      const files = (data.tree || []).filter((i) => i.type === 'file');
      setTree(files);

      const autoSelect = files
        .filter((f) => {
          const name = f.path.split('/').pop().toLowerCase();
          return (
            name === 'package.json' ||
            name === 'requirements.txt' ||
            name === 'pom.xml' ||
            name === 'go.mod' ||
            name === 'cargo.toml' ||
            name === 'dockerfile' ||
            name === 'docker-compose.yml' ||
            name === '.env.example' ||
            name === 'readme.md'
          );
        })
        .map((f) => f.path)
        .slice(0, 10);

      setSelectedPaths(autoSelect);
    } catch (err) {
      setTreeError(err.response?.data?.error || 'Failed to load file tree');
    } finally {
      setLoadingTree(false);
    }
  }, [canProceedToFiles, platform, creds, repoOwner, selectedRepo, selectedBranch]);

  useEffect(() => {
    if (repoContextOpen && canProceedToFiles) {
      loadTree();
    }
  }, [repoContextOpen, canProceedToFiles, loadTree]);

  const handleGenerate = useCallback(
    async ({ openDirectlyInBuilder = true } = {}) => {
      if (!prompt.trim() && selectedPaths.length === 0) {
        setGenError('Enter a prompt description or select repository context files.');
        return;
      }

      setGenerating(true);
      setGenError('');
      setGeneratedYaml('');

      try {
        let repoContext = [];
        if (repoContextOpen && selectedRepo && selectedBranch && selectedPaths.length > 0) {
          try {
            const { data: filesData } = await axios.post('/api/repo/file-contents', {
              platform,
              credentials: creds,
              owner: repoOwner,
              repo: selectedRepo,
              paths: selectedPaths,
              branch: selectedBranch,
            });
            repoContext = filesData.files || [];
          } catch {
            repoContext = [];
          }
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const basePrompt =
          prompt.trim() ||
          `Analyze the repository files provided and generate a production-grade ${targetPlatformLabel} CI/CD pipeline tailored to this project's actual stack, dependencies, and structure.`;

        const { data } = await axios.post(
          '/api/pipelines/generate',
          {
            prompt: basePrompt,
            aiProvider,
            cicdPlatform,
            aiOptions,
            ...(repoContext.length > 0 ? { repoContext } : {}),
          },
          { signal: controller.signal }
        );

        setGeneratedYaml(data.yaml || '');
        setGeneratedResult(data);
        if (openDirectlyInBuilder) {
          onGenerated(data);
        }
      } catch (err) {
        if (axios.isCancel(err)) return;
        setGenError(err.response?.data?.error || 'Generation failed. Check backend connection.');
      } finally {
        setGenerating(false);
      }
    },
    [
      prompt,
      selectedPaths,
      repoContextOpen,
      selectedRepo,
      selectedBranch,
      platform,
      creds,
      repoOwner,
      targetPlatformLabel,
      aiProvider,
      cicdPlatform,
      aiOptions,
      onGenerated,
    ]
  );

  const handlePushSuccess = (result) => {
    setPushResult(result);
    setShowPushModal(false);
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        {/* Header */}
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ff-muted)]">AI Generator</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--ff-text)]">
            Generate a {targetPlatformLabel} pipeline
          </h2>
          <p className="text-sm text-[var(--ff-text-secondary)] leading-relaxed">
            Describe your workflow in plain language, launch a starter prompt template, or attach files directly from a connected GitHub, GitLab, or Bitbucket repository.
          </p>
        </div>

        {/* Prompt Boosters */}
        <section className="ff-surface-soft p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-semibold text-[var(--ff-text-secondary)] uppercase tracking-[0.14em]">
              Quick Prompt Boosters
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPrompt(buildProductionTemplate(targetPlatformLabel))}
                className="px-3 py-1.5 rounded-lg text-xs ff-btn-secondary"
              >
                Load Production Template
              </button>
              <button
                onClick={() => setPrompt(buildFullCoverageExample(targetPlatformLabel))}
                className="px-3 py-1.5 rounded-lg text-xs ff-btn-secondary"
              >
                Load Full Node Coverage Example
              </button>
            </div>
          </div>
          <p className="text-xs text-[var(--ff-text-secondary)] leading-relaxed">
            Include triggers, quality gates, security checks, deploy strategy, rollback behavior, and branch conditions.
          </p>
        </section>

        {/* Optional Repository File-Tree Context Attachment */}
        <section className="rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] overflow-hidden">
          <button
            type="button"
            onClick={() => setRepoContextOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--ff-text)] hover:bg-[var(--ff-card-bg-hover)] transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="6" r="1.5"/><path d="M5 5.5v5M11 7.5c0 2.5-6 1.5-6 3"/>
              </svg>
              <span>Attach Repository File-Tree Context</span>
              <span className="text-xs text-[var(--ff-muted)] font-normal">(optional)</span>
              {selectedPaths.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--ff-accent-soft)] text-[var(--ff-accent)] border border-[var(--ff-border)]">
                  {selectedPaths.length} file{selectedPaths.length !== 1 ? 's' : ''} selected
                </span>
              )}
            </span>
            <span className="text-[var(--ff-muted)] text-xs">{repoContextOpen ? '▾' : '▸'}</span>
          </button>

          {repoContextOpen && (
            <div className="p-4 space-y-4 border-t border-[var(--ff-card-border)]">
              {connectedPlatforms.length === 0 ? (
                <p className="text-xs text-[var(--ff-muted)]">
                  No repository platforms connected yet. You can still generate from a prompt below, or add a GitHub, GitLab, or Bitbucket token in Settings → Platform Integrations to attach live repo files.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_PLATFORMS.map((p) => {
                      const connected = hasCredentials(allCreds, p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setPlatform(p);
                            setSelectedRepo('');
                            setSelectedBranch('');
                            setTree([]);
                            setSelectedPaths([]);
                          }}
                          disabled={!connected}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                            platform === p && connected
                              ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] text-[var(--ff-text)]'
                              : connected
                                ? 'border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)] hover:border-[var(--ff-border-strong)]'
                                : 'border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-muted)] opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {PLATFORM_ICONS[p]}
                          {PLATFORM_LABELS[p]}
                          {!connected && <span className="text-[10px] text-[var(--ff-muted)]">Not connected</span>}
                        </button>
                      );
                    })}
                  </div>

                  <RepoBrowser
                    platform={platform}
                    selectedRepo={selectedRepo}
                    selectedBranch={selectedBranch}
                    onRepoSelect={handleRepoSelect}
                    onBranchSelect={handleBranchSelect}
                  />

                  {treeError && <p className="text-xs text-[var(--ff-danger)]">{treeError}</p>}

                  {canProceedToFiles && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-[var(--ff-text)]">
                          Context Files ({selectedRepo} · {selectedBranch})
                        </p>
                        <button
                          type="button"
                          onClick={loadTree}
                          disabled={loadingTree}
                          className="text-xs text-[var(--ff-accent)] hover:underline"
                        >
                          {loadingTree ? 'Loading...' : 'Refresh tree'}
                        </button>
                      </div>
                      <FileTreePicker
                        tree={tree}
                        selectedPaths={selectedPaths}
                        onChange={setSelectedPaths}
                        loading={loadingTree}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* Prompt Textarea */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your stack, triggers, environments, quality gates, security requirements, deploy strategy, rollback, and notifications (or leave blank if generating purely from selected repo files)..."
          rows={9}
          className="ff-input p-4 text-sm resize-none leading-relaxed"
        />

        {/* Primary Generate CTAs */}
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => handleGenerate({ openDirectlyInBuilder: true })}
            disabled={generating || (!prompt.trim() && selectedPaths.length === 0)}
            className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm disabled:opacity-50 transition-opacity ff-btn-primary"
          >
            {generating
              ? 'Generating Pipeline & DAG...'
              : `Generate ${targetPlatformLabel} Pipeline → Visual Builder`}
          </button>
          {selectedRepo && (
            <button
              onClick={() => handleGenerate({ openDirectlyInBuilder: false })}
              disabled={generating || (!prompt.trim() && selectedPaths.length === 0)}
              className="py-3 px-4 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors ff-btn-secondary"
            >
              Generate & Preview for Repo Push
            </button>
          )}
        </div>

        {genError && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="flex-1">{genError}</p>
            <button onClick={() => setGenError('')} aria-label="Dismiss error" className="text-red-400 hover:text-red-300 flex-shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Inline Preview + Push to Repo when previewing */}
        {generatedYaml && (
          <section className="ff-surface-soft p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-base font-semibold text-[var(--ff-text)]">Generated Pipeline</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => generatedResult && onGenerated(generatedResult)}
                  className="ff-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Open in Visual Builder
                </button>
                <button
                  onClick={() => setShowPushModal(true)}
                  className="ff-btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold"
                >
                  Push to Repo →
                </button>
              </div>
            </div>
            <pre className="rounded-xl bg-[var(--ff-card-bg)] border border-[var(--ff-card-border)] p-4 text-xs text-[var(--ff-text-secondary)] overflow-x-auto max-h-80 font-mono leading-relaxed whitespace-pre-wrap">
              {generatedYaml}
            </pre>
          </section>
        )}

        {pushResult && (
          <section className="ff-surface-soft p-4">
            <p className="text-xs font-semibold text-[var(--ff-success)]">
              {pushResult.mode === 'pr' || pushResult.mode === 'mr'
                ? 'Pull Request opened!'
                : 'Committed to repository!'}
              {pushResult.url && (
                <>
                  {' · '}
                  <a href={pushResult.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {pushResult.url}
                  </a>
                </>
              )}
            </p>
          </section>
        )}

        {/* Example Prompts */}
        <div className="pt-1">
          <h3 className="text-xs font-semibold text-[var(--ff-muted)] uppercase tracking-[0.14em] mb-3">
            Example Prompts
          </h3>
          <div className="space-y-2">
            {examplePrompts.map((example, i) => (
              <button
                key={i}
                onClick={() => setPrompt(example)}
                className="w-full text-left px-4 py-3 rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)]
                  text-sm text-[var(--ff-text-secondary)] hover:border-[var(--ff-border-strong)] hover:bg-[var(--ff-card-bg-hover)] transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showPushModal && (
        <PushToRepoModal
          platform={platform}
          owner={repoOwner}
          repo={selectedRepo}
          branch={selectedBranch}
          yamlContent={generatedYaml}
          cicdPlatform={cicdPlatform}
          onClose={() => setShowPushModal(false)}
          onSuccess={handlePushSuccess}
        />
      )}
    </div>
  );
}
