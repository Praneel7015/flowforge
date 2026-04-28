import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import FileTreePicker from './FileTreePicker';
import RepoBrowser from './RepoBrowser';

const CREDS_KEY = 'flowforge.platformCredentials.v1';
const SUPPORTED_PLATFORMS = ['github', 'gitlab', 'bitbucket'];
const PLATFORM_LABELS = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };

function readStoredCredentials() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function hasCredentials(creds, platform) {
  if (!creds[platform]) return false;
  if (platform === 'bitbucket') return !!(creds[platform].username && creds[platform].appPassword);
  return !!(creds[platform].token);
}

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

export default function PromptPanel({ onGenerated, aiProvider, cicdPlatform, aiOptions }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  // Repo context state
  const [repoContextOpen, setRepoContextOpen] = useState(false);
  const allCreds = readStoredCredentials();
  const connectedPlatforms = SUPPORTED_PLATFORMS.filter((p) => hasCredentials(allCreds, p));
  const [repoPlatform, setRepoPlatform] = useState(connectedPlatforms[0] || 'github');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [tree, setTree] = useState([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState('');
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [repoContext, setRepoContext] = useState([]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const loadTree = useCallback(async () => {
    if (!selectedRepo || !selectedBranch) return;
    const creds = allCreds[repoPlatform] || {};
    setLoadingTree(true);
    setTreeError('');
    try {
      const { data } = await axios.post('/api/repo/tree', {
        platform: repoPlatform,
        credentials: creds,
        owner: creds.username || '',
        repo: selectedRepo,
        branch: selectedBranch,
      });
      setTree((data.tree || []).filter((i) => i.type === 'file'));
    } catch (err) {
      setTreeError(err.response?.data?.error || 'Failed to load file tree');
    } finally {
      setLoadingTree(false);
    }
  }, [selectedRepo, selectedBranch, repoPlatform, allCreds]);

  useEffect(() => {
    if (repoContextOpen && selectedRepo && selectedBranch) loadTree();
  }, [selectedRepo, selectedBranch, repoContextOpen, loadTree]);

  const fetchAndAttachContext = useCallback(async () => {
    if (selectedPaths.length === 0) { setRepoContext([]); return; }
    const creds = allCreds[repoPlatform] || {};
    try {
      const { data } = await axios.post('/api/repo/file-contents', {
        platform: repoPlatform,
        credentials: creds,
        owner: creds.username || '',
        repo: selectedRepo,
        paths: selectedPaths,
        branch: selectedBranch,
      });
      setRepoContext(data.files || []);
    } catch {
      setRepoContext([]);
    }
  }, [selectedPaths, repoPlatform, allCreds, selectedRepo, selectedBranch]);

  const platformNames = {
    gitlab: 'GitLab CI',
    github: 'GitHub Actions',
    jenkins: 'Jenkins',
    circleci: 'CircleCI',
  };

  const targetPlatformLabel = platformNames[cicdPlatform] || 'CI/CD';

  const examplePrompts = [
    `Create a production-ready ${targetPlatformLabel} pipeline for a Node.js service that uses cache restore/save, matrix builds, lint, unit/integration/smoke tests, security scanning, packaging, release, approval gate, canary deployment, blue/green cutover, rollback, and notifications.`,
    `Design a ${targetPlatformLabel} monorepo pipeline (frontend + backend) with branch-aware conditional deployment, artifact packaging, parallel test strategy, and environment-specific deployment controls with rollback.`,
    `Generate a ${targetPlatformLabel} pipeline for a Python API with security-first defaults: pinned images, dependency scan, secret-safe practices, approval before production, staged canary rollout, and incident notifications.`,
    `Create a highly reliable ${targetPlatformLabel} pipeline for a React app: restore cache, build, lint, test, integration checks, smoke tests, package artifacts, release tag, and deploy only from main via conditional gate.`,
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Fetch repo file contents if any files are selected
      let attachedContext = repoContext;
      if (repoContextOpen && selectedPaths.length > 0 && repoContext.length === 0) {
        await fetchAndAttachContext();
        attachedContext = repoContext;
      }

      const { data } = await axios.post('/api/pipelines/generate', {
        prompt,
        aiProvider,
        cicdPlatform,
        aiOptions,
        repoContext: attachedContext.length > 0 ? attachedContext : undefined,
      }, { signal: controller.signal });
      onGenerated(data);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError(err.response?.data?.error || 'Failed to generate pipeline. Check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ff-muted)]">Generator</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--ff-text)]">
            Build a pipeline from plain language
          </h2>
          <p className="text-[var(--ff-text-secondary)] text-sm leading-relaxed">
            Describe your project goals and constraints. FlowForge will generate a
            {' '}
            <span className="font-semibold text-[var(--ff-text)]">{platformNames[cicdPlatform] || 'CI/CD'}</span>
            {' '}
            config and visual workflow.
          </p>
        </div>

        <section className="ff-surface-soft p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--ff-text-secondary)] uppercase tracking-[0.14em]">
            Prompt Boosters
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

          <p className="text-xs text-[var(--ff-text-secondary)] leading-relaxed">
            High-quality prompts should include triggers, quality gates, security checks, deploy strategy,
            rollback behavior, notifications, and branch/environment conditions.
          </p>
        </section>

        {/* Repo context section */}
        <div className="rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] overflow-hidden">
          <button
            onClick={() => setRepoContextOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--ff-text-secondary)] hover:bg-[var(--ff-card-bg-hover)] transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
              </svg>
              Attach Repo Context
              {selectedPaths.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--ff-accent-soft)] text-[var(--ff-accent)] border border-[var(--ff-border)]">
                  {selectedPaths.length} file{selectedPaths.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
            <span className="text-[var(--ff-muted)] text-xs">{repoContextOpen ? '▾' : '▸'}</span>
          </button>

          {repoContextOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-[var(--ff-card-border)]">
              {connectedPlatforms.length === 0 ? (
                <p className="text-xs text-[var(--ff-muted)] pt-3">
                  No platforms connected. Go to Settings → Platform Integrations to add credentials.
                </p>
              ) : (
                <>
                  {/* Platform picker */}
                  <div className="flex gap-2 pt-3 flex-wrap">
                    {connectedPlatforms.map((p) => (
                      <button
                        key={p}
                        onClick={() => { setRepoPlatform(p); setSelectedRepo(''); setSelectedBranch(''); setTree([]); setSelectedPaths([]); }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          repoPlatform === p
                            ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] text-[var(--ff-text)]'
                            : 'border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)] hover:border-[var(--ff-border-strong)]'
                        }`}
                      >
                        {PLATFORM_LABELS[p]}
                      </button>
                    ))}
                  </div>

                  <RepoBrowser
                    platform={repoPlatform}
                    selectedRepo={selectedRepo}
                    selectedBranch={selectedBranch}
                    onRepoSelect={(r) => { setSelectedRepo(r); setTree([]); setSelectedPaths([]); setRepoContext([]); }}
                    onBranchSelect={(b) => { setSelectedBranch(b); setTree([]); setSelectedPaths([]); setRepoContext([]); }}
                  />

                  {treeError && <p className="text-xs text-[var(--ff-danger)]">{treeError}</p>}

                  {selectedRepo && selectedBranch && (
                    <div className="space-y-3">
                      <FileTreePicker
                        tree={tree}
                        selectedPaths={selectedPaths}
                        onChange={(paths) => { setSelectedPaths(paths); setRepoContext([]); }}
                        loading={loadingTree}
                      />
                      {selectedPaths.length > 0 && (
                        <button
                          onClick={fetchAndAttachContext}
                          className="ff-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                          Attach {selectedPaths.length} file{selectedPaths.length !== 1 ? 's' : ''} as context
                        </button>
                      )}
                      {repoContext.length > 0 && (
                        <p className="text-xs text-[var(--ff-success)]">
                          ✓ {repoContext.length} file{repoContext.length !== 1 ? 's' : ''} attached — will be sent with generation request
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe stack, triggers, environments, quality gates, security requirements, deploy strategy, rollback, and notifications."
          rows={10}
          className="ff-input p-4 text-sm resize-none leading-relaxed"
        />

        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-opacity ff-btn-primary"
        >
          {loading ? 'Generating...' : `Generate ${platformNames[cicdPlatform] || 'Pipeline'}`}
        </button>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="flex-1">{error}</p>
            <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-400 hover:text-red-300 flex-shrink-0">Dismiss</button>
          </div>
        )}

        <div className="pt-2">
          <h3 className="text-xs font-semibold text-[var(--ff-muted)] uppercase tracking-[0.14em] mb-3">
            Example prompts
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
    </div>
  );
}
