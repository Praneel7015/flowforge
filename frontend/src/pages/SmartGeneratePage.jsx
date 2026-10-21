import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import RepoBrowser from '../components/RepoBrowser';
import FileTreePicker from '../components/FileTreePicker';
import PushToRepoModal from '../components/PushToRepoModal';

const CREDS_KEY = 'flowforge.platformCredentials.v1';
const SUPPORTED_PLATFORMS = ['github', 'gitlab', 'bitbucket'];
const PLATFORM_LABELS = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };
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

const STEPS = ['Connect', 'Select Files', 'Generate', 'Push'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, i) => (
        <React.Fragment key={step}>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-colors ${
              i < current
                ? 'bg-[var(--ff-accent)] border-[var(--ff-accent)] text-white'
                : i === current
                  ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] text-[var(--ff-text)]'
                  : 'border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-muted)]'
            }`}>
              {i < current ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-6.5"/>
                </svg>
              ) : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === current ? 'text-[var(--ff-text)]' : 'text-[var(--ff-muted)]'}`}>
              {step}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 min-w-4 transition-colors ${i < current ? 'bg-[var(--ff-accent)]' : 'bg-[var(--ff-card-border-strong)]'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function SmartGeneratePage({ onGenerated, aiProvider, cicdPlatform, aiOptions }) {
  const allCreds = readStoredCredentials();
  const connectedPlatforms = SUPPORTED_PLATFORMS.filter((p) => hasCredentials(allCreds, p));

  const [step, setStep] = useState(0);
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

  const creds = allCreds[platform] || {};

  // ── Step 0: Platform + Repo selection ────────────────────────────────────────

  const handleRepoSelect = useCallback((repoName, ownerFromRepo) => {
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
  }, [platform, allCreds]);

  const handleBranchSelect = useCallback((branch) => {
    setSelectedBranch(branch);
    setTree([]);
    setSelectedPaths([]);
  }, []);

  const canProceedToFiles = selectedRepo && selectedBranch;

  // ── Step 1: Load tree ─────────────────────────────────────────────────────────

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

      // Auto-select high-value config files
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
      setStep(1);
    } catch (err) {
      setTreeError(err.response?.data?.error || 'Failed to load file tree');
    } finally {
      setLoadingTree(false);
    }
  }, [canProceedToFiles, platform, creds, repoOwner, selectedRepo, selectedBranch]);

  // ── Step 2: Generate ──────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (selectedPaths.length === 0) return;
    setGenerating(true);
    setGenError('');
    setGeneratedYaml('');

    try {
      // Fetch selected file contents
      const { data: filesData } = await axios.post('/api/repo/file-contents', {
        platform,
        credentials: creds,
        owner: repoOwner,
        repo: selectedRepo,
        paths: selectedPaths,
        branch: selectedBranch,
      });

      const repoContext = filesData.files || [];

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const basePrompt = prompt.trim() || `Analyze the repository files provided and generate a production-grade ${cicdPlatform} CI/CD pipeline tailored to this project's actual stack, dependencies, and structure.`;

      const { data } = await axios.post('/api/pipelines/generate', {
        prompt: basePrompt,
        aiProvider,
        cicdPlatform,
        aiOptions,
        repoContext,
      }, { signal: controller.signal });

      setGeneratedYaml(data.yaml || '');
      setGeneratedResult(data);
      setStep(2);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setGenError(err.response?.data?.error || 'Generation failed. Check backend connection.');
    } finally {
      setGenerating(false);
    }
  }, [selectedPaths, platform, creds, repoOwner, selectedRepo, selectedBranch, prompt, aiProvider, cicdPlatform, aiOptions]);

  const handleLoadIntoBuilder = () => {
    if (generatedResult) {
      onGenerated(generatedResult);
    }
  };

  const handlePushSuccess = (result) => {
    setPushResult(result);
    setShowPushModal(false);
    setStep(3);
  };

  // ── No connected platforms ────────────────────────────────────────────────────

  if (connectedPlatforms.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto pt-8 text-center space-y-4 ff-enter">
          <div className="w-12 h-12 rounded-2xl bg-[var(--ff-accent-soft)] border border-[var(--ff-border)] flex items-center justify-center mx-auto text-[var(--ff-accent)]">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="6" r="1.5"/><path d="M5 5.5v5M11 7.5c0 2.5-6 1.5-6 3"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--ff-text)]">No platforms connected</h2>
          <p className="text-sm text-[var(--ff-text-secondary)] leading-relaxed">
            Connect GitHub, GitLab, or Bitbucket in Settings → Platform Integrations to browse your repos and generate a tailored pipeline.
          </p>
          <p className="text-xs text-[var(--ff-muted)]">
            Credentials are stored in your browser only and sent directly to the platform API — never stored on our servers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5 ff-enter">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ff-muted)]">Smart Generate</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--ff-text)]">
            Generate from your repo
          </h2>
          <p className="text-sm text-[var(--ff-text-secondary)] leading-relaxed">
            Connect a repo, select files as context, and FlowForge generates a pipeline that fits your actual stack.
          </p>
        </div>

        <StepIndicator current={step} />

        {/* Step 0: Connect repo */}
        <section className="ff-surface-soft p-5 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] mb-3">Platform</p>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_PLATFORMS.map((p) => {
                const connected = hasCredentials(allCreds, p);
                return (
                  <button
                    key={p}
                    onClick={() => { setPlatform(p); setSelectedRepo(''); setSelectedBranch(''); setTree([]); }}
                    disabled={!connected}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      platform === p && connected
                        ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] text-[var(--ff-text)]'
                        : connected
                          ? 'border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)] hover:border-[var(--ff-border-strong)]'
                          : 'border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-muted)] opacity-50 cursor-not-allowed'
                    }`}
                    title={connected ? undefined : `Connect ${PLATFORM_LABELS[p]} in Settings first`}
                  >
                    {PLATFORM_ICONS[p]}
                    {PLATFORM_LABELS[p]}
                    {!connected && <span className="text-[10px] font-semibold text-[var(--ff-muted)]">Not connected</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <RepoBrowser
            platform={platform}
            selectedRepo={selectedRepo}
            selectedBranch={selectedBranch}
            onRepoSelect={handleRepoSelect}
            onBranchSelect={handleBranchSelect}
          />

          {canProceedToFiles && step === 0 && (
            <button
              onClick={loadTree}
              disabled={loadingTree}
              className="ff-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {loadingTree ? 'Loading files...' : 'Browse Repository Files →'}
            </button>
          )}
          {treeError && <p className="text-xs text-[var(--ff-danger)]">{treeError}</p>}
        </section>

        {/* Step 1: Select files */}
        {step >= 1 && (
          <section className="ff-surface-soft p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--ff-text)]">Select Context Files</h3>
              <span className="text-xs text-[var(--ff-muted)]">{selectedRepo} · {selectedBranch}</span>
            </div>
            <p className="text-xs text-[var(--ff-text-secondary)]">
              Pick files that describe your project — <span className="font-medium">package.json</span>, <span className="font-medium">Dockerfile</span>, existing CI configs, etc. The AI will use them to tailor the pipeline.
            </p>

            <FileTreePicker
              tree={tree}
              selectedPaths={selectedPaths}
              onChange={setSelectedPaths}
              loading={loadingTree}
            />

            {/* Optional prompt */}
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--ff-muted)] mb-1.5">
                Additional Instructions <span className="normal-case font-normal">(optional)</span>
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Include a canary deploy to Kubernetes, use Node 20, add Slack notifications on failure..."
                rows={3}
                className="ff-input p-3 text-sm resize-none"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || selectedPaths.length === 0}
              className="ff-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {generating ? 'Generating pipeline...' : `Generate ${cicdPlatform} Pipeline →`}
            </button>
            {genError && <p className="text-xs text-[var(--ff-danger)]">{genError}</p>}
          </section>
        )}

        {/* Step 2: Preview + actions */}
        {step >= 2 && generatedYaml && (
          <section className="ff-surface-soft p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-base font-semibold text-[var(--ff-text)]">Generated Pipeline</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleLoadIntoBuilder}
                  className="ff-btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Load into Builder
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

            <button
              onClick={() => { setStep(1); setGeneratedYaml(''); setGenError(''); }}
              className="text-xs text-[var(--ff-muted)] hover:text-[var(--ff-text)] underline"
            >
              ← Re-select files
            </button>
          </section>
        )}

        {/* Step 3: Push success */}
        {step >= 3 && pushResult && (
          <section className="ff-surface-soft p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--ff-success)]/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-[var(--ff-success)]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-4"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--ff-success)]">
                  {pushResult.mode === 'pr' || pushResult.mode === 'mr' ? 'Pull Request opened!' : 'Committed to repository!'}
                </p>
                {pushResult.url && (
                  <a
                    href={pushResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--ff-accent)] hover:underline mt-0.5 block truncate"
                  >
                    {pushResult.url}
                  </a>
                )}
                <p className="text-xs text-[var(--ff-muted)] mt-1">Branch: {pushResult.branch}</p>
              </div>
            </div>
          </section>
        )}
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
