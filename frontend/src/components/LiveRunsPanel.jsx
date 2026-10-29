import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { BUILT_IN_TEMPLATES } from './NodeTemplates';
import { simulatePipeline, reviewFix } from '../utils/pipelineChecks';

const CREDS_KEY = 'flowforge.platformCredentials.v1';
const RUN_PLATFORMS = [
  { id: 'github', label: 'GitHub Actions' },
  { id: 'gitlab', label: 'GitLab CI' },
  { id: 'bitbucket', label: 'Bitbucket' },
  { id: 'circleci', label: 'CircleCI' },
];

function readStoredCredentials() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// The diagnose API nests text inside objects (e.g. explanation is
// { summary, explanation, rootCause, ... }); React can't render objects, so
// always reduce a field to a string before it reaches JSX.
function toText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return toText(value.explanation ?? value.summary ?? value.rootCause ?? '');
  }
  return String(value);
}

function normalizeStatus(rawStatus, conclusion) {
  const combined = `${rawStatus || ''} ${conclusion || ''}`.toLowerCase();
  if (combined.includes('fail') || combined.includes('error') || combined.includes('timed_out')) {
    return 'failed';
  }
  if (combined.includes('success') || combined.includes('pass') || combined.includes('completed')) {
    return 'passed';
  }
  if (combined.includes('run') || combined.includes('in_progress') || combined.includes('processing')) {
    return 'running';
  }
  if (combined.includes('skip') || combined.includes('cancel')) {
    return 'skipped';
  }
  return 'pending';
}

function buildOverlayMapFromJobs(jobs = [], canvasNodes = []) {
  const statusMap = {};
  const stageNodes = canvasNodes.filter(
    (n) => !n.type?.startsWith('trigger_') && n.type !== 'conditional'
  );

  jobs.forEach((job, idx) => {
    const status = normalizeStatus(job.status, job.conclusion);
    const duration = job.duration || (job.durationSeconds ? `${job.durationSeconds}s` : undefined);
    const key = job.nodeId || job.id || job.name || `job_${idx}`;
    statusMap[key] = { runStatus: status, runDuration: duration };
    if (job.name) {
      statusMap[job.name] = { runStatus: status, runDuration: duration };
    }
    if (job.stage) {
      statusMap[job.stage] = { runStatus: status, runDuration: duration };
    }
    // Also map positional fallback if canvas has matching index
    if (stageNodes[idx] && !statusMap[stageNodes[idx].id]) {
      statusMap[stageNodes[idx].id] = { runStatus: status, runDuration: duration };
    }
  });

  return statusMap;
}

export default function LiveRunsPanel({
  currentYaml,
  cicdPlatform,
  aiProvider,
  aiOptions,
  canvasGraph,
  onUpdateNodeStatuses,
  onApplyFixedPipeline,
}) {
  const creds = readStoredCredentials();
  const [platform, setPlatform] = useState(
    RUN_PLATFORMS.some((p) => p.id === cicdPlatform) ? cicdPlatform : 'github'
  );
  const [repoSlug, setRepoSlug] = useState('');
  const [branch, setBranch] = useState('main');
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [applying, setApplying] = useState(false);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);
  const simTimersRef = useRef([]);

  useEffect(() => {
    if (RUN_PLATFORMS.some((p) => p.id === cicdPlatform)) {
      setPlatform(cicdPlatform);
    }
  }, [cicdPlatform]);

  const clearSimTimers = useCallback(() => {
    simTimersRef.current.forEach((t) => clearTimeout(t));
    simTimersRef.current = [];
  }, []);

  useEffect(() => () => clearSimTimers(), [clearSimTimers]);

  const getPlatformCredentials = useCallback(() => {
    const c = creds[platform] || {};
    return c;
  }, [creds, platform]);

  const fetchRunsList = useCallback(async () => {
    if (!repoSlug.trim()) {
      setError('Enter owner/repo (e.g. acme/flowforge) or click "Simulate Live Run" to preview.');
      return;
    }
    setLoadingRuns(true);
    setError('');
    try {
      const [owner, repo] = repoSlug.trim().split('/');
      const { data } = await axios.post('/api/runs/list', {
        platform,
        credentials: getPlatformCredentials(),
        owner: owner || '',
        repo: repo || repoSlug.trim(),
        projectSlug: repoSlug.trim(),
        branch,
      });
      const fetchedRuns = Array.isArray(data?.runs) ? data.runs : [];
      setRuns(fetchedRuns);
      if (fetchedRuns.length > 0 && !selectedRun) {
        setSelectedRun(fetchedRuns[0]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not fetch live runs. Verify repository & token in Settings.');
    } finally {
      setLoadingRuns(false);
    }
  }, [repoSlug, platform, getPlatformCredentials, branch, selectedRun]);

  const fetchRunStatus = useCallback(
    async (runToInspect) => {
      const target = runToInspect || selectedRun;
      if (!target || String(target.id).startsWith('sim_')) return;

      try {
        const [owner, repo] = repoSlug.trim().split('/');
        const { data } = await axios.post('/api/runs/status', {
          platform,
          credentials: getPlatformCredentials(),
          owner: owner || '',
          repo: repo || repoSlug.trim(),
          projectSlug: repoSlug.trim(),
          runId: target.id,
        });
        const runJobs = Array.isArray(data?.jobs) ? data.jobs : [];
        setJobs(runJobs);
        const overlay = buildOverlayMapFromJobs(runJobs, canvasGraph?.nodes || []);
        onUpdateNodeStatuses?.(overlay);
      } catch (err) {
        setError(err.response?.data?.error || 'Could not fetch run job details.');
      }
    },
    [selectedRun, repoSlug, platform, getPlatformCredentials, canvasGraph?.nodes, onUpdateNodeStatuses]
  );

  useEffect(() => {
    if (!autoPoll || !selectedRun || String(selectedRun.id).startsWith('sim_')) return undefined;
    const interval = setInterval(() => {
      fetchRunStatus(selectedRun);
    }, 6000);
    return () => clearInterval(interval);
  }, [autoPoll, selectedRun, fetchRunStatus]);

  const handleTriggerRun = async () => {
    if (!repoSlug.trim()) {
      setError('Enter owner/repo before triggering a pipeline run.');
      return;
    }
    setTriggering(true);
    setError('');
    try {
      const [owner, repo] = repoSlug.trim().split('/');
      const { data } = await axios.post('/api/runs/trigger', {
        platform,
        credentials: getPlatformCredentials(),
        owner: owner || '',
        repo: repo || repoSlug.trim(),
        projectSlug: repoSlug.trim(),
        branch: branch || 'main',
      });
      if (data?.run) {
        setRuns((prev) => [data.run, ...prev]);
        setSelectedRun(data.run);
      } else {
        await fetchRunsList();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to trigger pipeline run.');
    } finally {
      setTriggering(false);
    }
  };

  // Animates a simulated run whose outcome comes from checking the actual
  // pipeline (see utils/pipelineChecks), so applying a correct fix and
  // re-running really turns the canvas green.
  const runSimulation = useCallback((graph) => {
    clearSimTimers();
    setError('');
    setNotice('');
    setDiagnosis(null);
    setSimulating(true);

    let activeNodes = graph?.nodes || [];
    let activeEdges = graph?.edges || [];
    if (activeNodes.length === 0 && BUILT_IN_TEMPLATES.length > 0) {
      const starter = BUILT_IN_TEMPLATES[0];
      onApplyFixedPipeline?.({
        nodes: starter.nodes,
        edges: starter.edges,
        yaml: currentYaml,
      });
      activeNodes = starter.nodes;
      activeEdges = starter.edges;
    }

    const results = simulatePipeline(activeNodes, activeEdges);
    const simNodes = results.map((r) => r.node);
    const runFailed = results.some((r) => r.status === 'failed');

    const simRunId = `sim_${Date.now().toString(36)}`;
    const initialRun = {
      id: simRunId,
      number: 142,
      status: 'running',
      branch: branch || 'main',
      commitSha: 'a8f4d2c',
      commitMessage: 'Simulated run of the current canvas',
      startedAt: new Date().toISOString(),
    };
    setRuns((prev) => [initialRun, ...prev.filter((r) => !String(r.id).startsWith('sim_'))]);
    setSelectedRun(initialRun);

    const initialJobs = simNodes.map((node) => ({
      id: node.id,
      nodeId: node.id,
      name: node.data?.label || node.type,
      stage: node.data?.config?.stage || 'build',
      status: 'pending',
      duration: '—',
      logs: '',
    }));
    setJobs(initialJobs);
    onUpdateNodeStatuses?.(buildOverlayMapFromJobs(initialJobs, simNodes));

    if (results.length === 0) {
      setSimulating(false);
      return;
    }

    results.forEach((result, idx) => {
      const startTimer = setTimeout(() => {
        setJobs((prev) => {
          const next = prev.map((j, jIdx) =>
            jIdx === idx && result.status !== 'skipped'
              ? { ...j, status: 'running', duration: 'running...' }
              : j
          );
          onUpdateNodeStatuses?.(buildOverlayMapFromJobs(next, simNodes));
          return next;
        });
      }, idx * 950 + 150);
      simTimersRef.current.push(startTimer);

      const finishTimer = setTimeout(() => {
        const durationStr =
          result.status === 'skipped' ? '0s' : result.status === 'failed' ? `${4 + idx}s` : `${12 + idx * 9}s`;
        setJobs((prev) => {
          const next = prev.map((j, jIdx) =>
            jIdx === idx ? { ...j, status: result.status, duration: durationStr, logs: result.log } : j
          );
          onUpdateNodeStatuses?.(buildOverlayMapFromJobs(next, simNodes));
          return next;
        });

        if (idx === results.length - 1) {
          const finalStatus = runFailed ? 'failed' : 'passed';
          setSelectedRun((prev) => (prev ? { ...prev, status: finalStatus } : prev));
          setRuns((prev) => prev.map((r) => (r.id === simRunId ? { ...r, status: finalStatus } : r)));
          setSimulating(false);
        }
      }, idx * 950 + 900);
      simTimersRef.current.push(finishTimer);
    });
  }, [clearSimTimers, onApplyFixedPipeline, currentYaml, branch, onUpdateNodeStatuses]);

  const handleSimulateLiveRun = useCallback(() => {
    runSimulation(canvasGraph);
  }, [runSimulation, canvasGraph]);

  const handleDiagnoseAndFix = async () => {
    const failedJobs = jobs.filter((j) => normalizeStatus(j.status, j.conclusion) === 'failed');
    const targets = failedJobs.length > 0 ? failedJobs : jobs.slice(0, 1);
    setDiagnosing(true);
    setError('');
    setNotice('');
    setWarningsAcknowledged(false);
    try {
      const { data } = await axios.post('/api/runs/diagnose-and-fix', {
        platform,
        yaml: currentYaml,
        // Send every failed job so one fix covers all of them, not just the first.
        failedLogs: targets.map((j) => ({
          jobName: j.name,
          stage: j.stage,
          log: j.logs || `Job "${j.name}" failed with exit code 1 during CI execution.`,
        })),
        aiProvider,
        cicdPlatform,
        aiOptions,
      });

      const patchedYaml =
        data?.patchedYaml || data?.remediation?.patchedYaml || data?.fixedYaml || currentYaml;
      const changeLog = data?.changeLog ?? data?.remediation?.changeLog;
      setDiagnosis({
        rootCause:
          toText(data?.rootCause) || toText(data?.diagnosis?.rootCause) || toText(data?.summary),
        explanation: toText(data?.explanation) || toText(data?.diagnosis?.explanation),
        patchedYaml,
        changeLog: Array.isArray(changeLog) ? changeLog : [],
        review: reviewFix(currentYaml, patchedYaml),
      });
    } catch (err) {
      setError(err.response?.data?.error || 'AI diagnosis failed. Check the AI provider in Settings and retry.');
    } finally {
      setDiagnosing(false);
    }
  };

  const isSimulatedRun = String(selectedRun?.id || '').startsWith('sim_');

  // Applies the patched YAML to the canvas, then verifies it for real: a
  // simulated run is re-run against the new graph; a real CI run is left
  // pending until the fix is pushed and a new run is triggered.
  const handleApplyFixToCanvas = async () => {
    if (!diagnosis) return;
    if (!diagnosis.review?.changed) {
      setNotice('The AI did not change the pipeline, so there is nothing to apply. Try diagnosing again.');
      return;
    }

    setApplying(true);
    setError('');
    try {
      const { data } = await axios.post('/api/pipelines/import', {
        configText: diagnosis.patchedYaml,
        cicdPlatform,
      });
      const nodes = data?.nodes || [];
      const edges = data?.edges || [];
      onApplyFixedPipeline?.({
        yaml: diagnosis.patchedYaml,
        nodes,
        edges,
        detectedPlatform: data?.detectedPlatform || cicdPlatform,
      });

      if (isSimulatedRun) {
        runSimulation({ nodes, edges });
        setNotice('Fix applied. Re-running the pipeline to verify it.');
      } else {
        const pendingJobs = jobs.map((j) => ({ ...j, status: 'pending', duration: '—' }));
        setJobs(pendingJobs);
        onUpdateNodeStatuses?.(buildOverlayMapFromJobs(pendingJobs, nodes));
        setDiagnosis(null);
        setNotice('Fix applied to the canvas. Push it to the repo, then use Trigger Run to verify it on CI.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not apply the fix: the patched config failed to parse.');
    } finally {
      setApplying(false);
    }
  };

  const handleClearOverlay = () => {
    clearSimTimers();
    setSimulating(false);
    setJobs([]);
    setDiagnosis(null);
    setNotice('');
    onUpdateNodeStatuses?.({});
  };

  const hasFailedJob = jobs.some((j) => normalizeStatus(j.status, j.conclusion) === 'failed');

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3.5 space-y-3.5 ff-enter">
      {/* Header + Demo Simulator CTA */}
      <div className="rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[var(--ff-text)] flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M6.5 5.5l4 2.5-4 2.5v-5z" />
              </svg>
              Live Execution Telemetry
            </h3>
            <p className="text-[11px] text-[var(--ff-muted)] mt-0.5">
              Stream job statuses directly onto canvas nodes & auto-fix failures.
            </p>
          </div>
          {jobs.length > 0 && (
            <button
              onClick={handleClearOverlay}
              className="px-2 py-1 rounded-lg text-[11px] ff-btn-secondary whitespace-nowrap"
              title="Clear status badges from canvas nodes"
            >
              Clear Overlay
            </button>
          )}
        </div>

        <button
          onClick={handleSimulateLiveRun}
          disabled={simulating}
          className="w-full py-2 px-3 rounded-lg text-xs font-semibold ff-btn-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3.5l7 4.5-7 4.5v-9z" />
          </svg>
          <span>{simulating ? 'Simulating Live DAG Run...' : 'Simulate Live Run on Canvas'}</span>
        </button>
      </div>

      {/* Live Repository Run Connector */}
      <div className="rounded-xl border border-[var(--ff-card-border)] bg-[var(--ff-surface-2)] p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--ff-muted)] font-semibold">
            Connected CI Provider
          </span>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ff-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={(e) => setAutoPoll(e.target.checked)}
              className="rounded border-[var(--ff-border)]"
            />
            Auto-poll (6s)
          </label>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {RUN_PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left truncate transition-colors ${
                platform === p.id
                  ? 'border-[var(--ff-border-strong)] bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]'
                  : 'border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          <input
            type="text"
            value={repoSlug}
            onChange={(e) => setRepoSlug(e.target.value)}
            placeholder="owner/repo (e.g. vercel/next.js)"
            className="ff-input px-2.5 py-1.5 text-xs flex-1"
          />
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="ff-input px-2 py-1.5 text-xs w-20 ff-code"
          />
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={fetchRunsList}
            disabled={loadingRuns}
            className="flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium ff-btn-secondary disabled:opacity-50"
          >
            {loadingRuns ? 'Fetching...' : 'Fetch Runs'}
          </button>
          <button
            onClick={handleTriggerRun}
            disabled={triggering}
            className="flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium ff-btn-secondary disabled:opacity-50"
          >
            {triggering ? 'Triggering...' : 'Trigger Run'}
          </button>
        </div>

        {error && (
          <div className="px-2.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-400">
            {error}
          </div>
        )}
        {notice && (
          <div className="px-2.5 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-300">
            {notice}
          </div>
        )}
      </div>

      {/* Active Run & Stage Status Overlay List */}
      {selectedRun && (
        <div className="rounded-xl border border-[var(--ff-card-border-strong)] bg-[var(--ff-card-bg)] p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--ff-text)] truncate">
                  Run #{selectedRun.number || String(selectedRun.id).slice(-4)}
                </span>
                <span className="text-[11px] text-[var(--ff-muted)] ff-code">
                  {selectedRun.branch || branch}
                </span>
              </div>
              {selectedRun.commitMessage && (
                <p className="text-[11px] text-[var(--ff-text-secondary)] truncate mt-0.5">
                  {selectedRun.commitMessage}
                </p>
              )}
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                normalizeStatus(selectedRun.status, selectedRun.conclusion) === 'passed'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : normalizeStatus(selectedRun.status, selectedRun.conclusion) === 'failed'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              {normalizeStatus(selectedRun.status, selectedRun.conclusion)}
            </span>
          </div>

          <div className="space-y-1.5">
            {jobs.map((job) => {
              const st = normalizeStatus(job.status, job.conclusion);
              return (
                <div key={job.id || job.name}>
                <div
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--ff-card-border)] bg-[var(--ff-surface-inset)] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        st === 'passed'
                          ? 'bg-emerald-400'
                          : st === 'running'
                            ? 'bg-amber-400 animate-pulse'
                            : st === 'failed'
                              ? 'bg-rose-500'
                              : 'bg-[var(--ff-muted)]'
                      }`}
                    />
                    <span className="font-medium text-[var(--ff-text)] truncate">{job.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {job.duration && (
                      <span className="text-[11px] text-[var(--ff-muted)] ff-code">{job.duration}</span>
                    )}
                    <span
                      className={`text-[10px] font-semibold uppercase ${
                        st === 'passed'
                          ? 'text-emerald-400'
                          : st === 'running'
                            ? 'text-amber-400'
                            : st === 'failed'
                              ? 'text-rose-400'
                              : 'text-[var(--ff-muted)]'
                      }`}
                    >
                      {st}
                    </span>
                  </div>
                </div>
                {st === 'failed' && job.logs && (
                  <details className="mt-1 ml-1">
                    <summary className="text-[11px] text-rose-300 cursor-pointer">View failure log</summary>
                    <pre className="mt-1 p-2 rounded-lg bg-[var(--ff-surface-inset)] text-[10px] text-[var(--ff-text-secondary)] whitespace-pre-wrap ff-code">
                      {job.logs}
                    </pre>
                  </details>
                )}
                </div>
              );
            })}
          </div>

          {/* Diagnose & Fix CTA when a stage fails */}
          {hasFailedJob && (
            <div className="pt-1 space-y-2">
              <button
                onClick={handleDiagnoseAndFix}
                disabled={diagnosing}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4M8 10v4M2 8h4M10 8h4" />
                  <circle cx="8" cy="8" r="2.5" />
                </svg>
                <span>{diagnosing ? 'Diagnosing Root Cause...' : 'AI Root-Cause Diagnose & Fix'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Diagnosis & 1-Click Fix Result */}
      {diagnosis && (
        <div className="rounded-xl border border-emerald-500/30 bg-[var(--ff-card-bg)] p-3 space-y-2.5 ff-enter">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-400">AI Root-Cause Diagnosis</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono">
              {diagnosis.review?.changed ? 'Ready to patch' : 'No changes'}
            </span>
          </div>
          {diagnosis.rootCause && (
            <p className="text-xs text-[var(--ff-text)] font-medium leading-relaxed">
              {diagnosis.rootCause}
            </p>
          )}
          {diagnosis.explanation && (
            <p className="text-[11px] text-[var(--ff-text-secondary)] leading-relaxed">
              {diagnosis.explanation}
            </p>
          )}
          {diagnosis.changeLog?.length > 0 && (
            <ul className="space-y-1 pt-1">
              {diagnosis.changeLog.map((item, i) => (
                <li key={i} className="text-[11px] text-[var(--ff-text-secondary)] flex gap-1.5">
                  <span className="text-emerald-400 font-mono">[{toText(item?.job) || 'fix'}]</span>
                  <span>{toText(item?.change) || toText(item)}</span>
                </li>
              ))}
            </ul>
          )}
          {diagnosis.review?.changed && (
            <details className="pt-1">
              <summary className="text-[11px] text-[var(--ff-text-secondary)] cursor-pointer">
                Review YAML changes (
                {diagnosis.review.diff.filter((d) => d.type === 'add').length} added,{' '}
                {diagnosis.review.diff.filter((d) => d.type === 'del').length} removed)
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto p-2 rounded-lg bg-[var(--ff-surface-inset)] text-[10px] leading-relaxed ff-code">
                {diagnosis.review.diff
                  .filter((d) => d.type !== 'same')
                  .map((d, i) => (
                    <div
                      key={i}
                      className={d.type === 'add' ? 'text-emerald-400' : 'text-rose-400'}
                    >
                      {d.type === 'add' ? '+ ' : '- '}
                      {d.text}
                    </div>
                  ))}
              </pre>
            </details>
          )}
          {diagnosis.review?.warnings?.length > 0 && (
            <div className="px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 space-y-1">
              <p className="text-[11px] font-semibold text-amber-300">Check before applying</p>
              <ul className="space-y-0.5">
                {diagnosis.review.warnings.map((w) => (
                  <li key={w} className="text-[11px] text-amber-200">• {w}</li>
                ))}
              </ul>
              <label className="flex items-center gap-1.5 pt-1 text-[11px] text-[var(--ff-text-secondary)]">
                <input
                  type="checkbox"
                  checked={warningsAcknowledged}
                  onChange={(e) => setWarningsAcknowledged(e.target.checked)}
                />
                I reviewed these changes and still want to apply them
              </label>
            </div>
          )}
          <button
            onClick={handleApplyFixToCanvas}
            disabled={
              applying ||
              !diagnosis.review?.changed ||
              (diagnosis.review.warnings.length > 0 && !warningsAcknowledged)
            }
            className="w-full py-2 px-3 rounded-lg text-xs font-semibold ff-btn-primary disabled:opacity-50"
          >
            {applying
              ? 'Applying fix...'
              : isSimulatedRun
                ? 'Apply Fix & Re-run Pipeline'
                : 'Apply Fix to Canvas'}
          </button>
        </div>
      )}
    </div>
  );
}
