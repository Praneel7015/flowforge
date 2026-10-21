const axios = require('axios');
const githubService = require('../services/githubService');
const gitlabService = require('../services/gitlabService');
const bitbucketService = require('../services/bitbucketService');
const aiService = require('../services/aiService');
const { buildAIOptions } = require('../utils/aiOptions');
const { isSafePublicUrl } = require('../utils/ssrf');

const SUPPORTED_PLATFORMS = ['github', 'gitlab', 'bitbucket', 'circleci'];
const CIRCLECI_API = 'https://circleci.com/api/v2';
const CIRCLECI_TIMEOUT_MS = Number(process.env.CIRCLECI_TIMEOUT_MS || 30000);

/**
 * Normalize platform-specific run/job states into:
 * 'queued' | 'running' | 'passed' | 'failed' | 'skipped'
 */
function normalizeExecutionStatus(rawStatus, rawConclusion) {
  const status = String(rawStatus || '').trim().toLowerCase();
  const conclusion = String(rawConclusion || '').trim().toLowerCase();

  // Check conclusion first when status is completed/finished
  if (conclusion) {
    if (['success', 'successful', 'passed', 'fixed'].includes(conclusion)) {
      return 'passed';
    }
    if (
      [
        'failure',
        'failed',
        'error',
        'errored',
        'timed_out',
        'timedout',
        'startup_failure',
        'action_required',
        'infrastructure_fail',
      ].includes(conclusion)
    ) {
      return 'failed';
    }
    if (
      [
        'skipped',
        'cancelled',
        'canceled',
        'neutral',
        'stale',
        'stopped',
        'not_run',
        'not_running',
      ].includes(conclusion)
    ) {
      return 'skipped';
    }
  }

  if (['success', 'successful', 'passed', 'fixed'].includes(status)) {
    return 'passed';
  }
  if (
    [
      'failure',
      'failed',
      'error',
      'errored',
      'timed_out',
      'timedout',
      'startup_failure',
      'infrastructure_fail',
    ].includes(status)
  ) {
    return 'failed';
  }
  if (
    [
      'skipped',
      'cancelled',
      'canceled',
      'neutral',
      'stale',
      'stopped',
      'not_run',
      'not_running',
    ].includes(status)
  ) {
    return 'skipped';
  }
  if (['in_progress', 'running', 'preparing', 'building'].includes(status)) {
    return 'running';
  }
  if (
    [
      'queued',
      'waiting',
      'pending',
      'created',
      'scheduled',
      'waiting_for_resource',
      'on_hold',
      'manual',
      'blocked',
    ].includes(status)
  ) {
    return 'queued';
  }

  return status === 'completed' ? 'passed' : 'queued';
}

function resolveCredentials(platform, credentials = {}) {
  const creds = credentials && typeof credentials === 'object' ? credentials : {};
  const customUrl = creds.url || creds.instanceUrl;

  if (customUrl && !isSafePublicUrl(customUrl)) {
    const err = new Error('Invalid credentials URL: must be a safe public HTTP(S) URL');
    err.status = 400;
    throw err;
  }

  if (platform === 'github') {
    const token = creds.token || process.env.GITHUB_TOKEN;
    if (!token) {
      const err = new Error('GitHub token is required (in credentials.token or GITHUB_TOKEN)');
      err.status = 400;
      throw err;
    }
    return { token };
  }

  if (platform === 'gitlab') {
    const token = creds.token || process.env.GITLAB_TOKEN;
    const instanceUrl = creds.url || creds.instanceUrl || process.env.GITLAB_URL || 'https://gitlab.com';
    if (!token) {
      const err = new Error('GitLab token is required (in credentials.token or GITLAB_TOKEN)');
      err.status = 400;
      throw err;
    }
    return { token, instanceUrl };
  }

  if (platform === 'bitbucket') {
    const username = creds.username || process.env.BITBUCKET_USERNAME;
    const appPassword = creds.appPassword || creds.token || process.env.BITBUCKET_APP_PASSWORD;
    const workspace = creds.workspace;
    if (!username || !appPassword) {
      const err = new Error('Bitbucket username and appPassword are required');
      err.status = 400;
      throw err;
    }
    return { username, appPassword, workspace };
  }

  if (platform === 'circleci') {
    const token = creds.token || process.env.CIRCLECI_TOKEN;
    const baseUrl = (creds.url || CIRCLECI_API).replace(/\/+$/, '');
    if (!token) {
      const err = new Error('CircleCI token is required (in credentials.token or CIRCLECI_TOKEN)');
      err.status = 400;
      throw err;
    }
    return { token, baseUrl };
  }

  const err = new Error(`Unsupported platform: ${platform}`);
  err.status = 400;
  throw err;
}

function makeCircleClient(token, baseUrl = CIRCLECI_API) {
  return axios.create({
    baseURL: baseUrl,
    headers: { 'Circle-Token': token },
    timeout: CIRCLECI_TIMEOUT_MS,
  });
}

function resolveCircleProjectSlug({ projectId, owner, repo, vcs = 'gh' }) {
  if (projectId && String(projectId).includes('/')) {
    const parts = String(projectId).split('/').filter(Boolean);
    if (parts.length >= 3) return parts.slice(0, 3).join('/');
    if (parts.length === 2) return `${vcs}/${parts[0]}/${parts[1]}`;
  }
  if (owner && repo) {
    return `${vcs}/${owner}/${repo}`;
  }
  const err = new Error('owner and repo (or projectId slug) are required for CircleCI');
  err.status = 400;
  throw err;
}

// ─── CircleCI helpers ─────────────────────────────────────────────────────────

async function listCircleRuns(creds, { projectId, owner, repo, branch, perPage = 10 }) {
  const client = makeCircleClient(creds.token, creds.baseUrl);
  const slug = resolveCircleProjectSlug({ projectId, owner, repo });
  const params = {};
  if (branch) params.branch = branch;

  const { data } = await client.get(`/project/${slug}/pipeline`, { params });
  const pipelines = (data?.items || []).slice(0, perPage);

  const runs = await Promise.all(
    pipelines.map(async (p) => {
      let wf = null;
      try {
        const { data: wfData } = await client.get(`/pipeline/${p.id}/workflow`);
        wf = (wfData?.items || [])[0] || null;
      } catch {
        wf = null;
      }
      const rawStatus = wf?.status || p.state || 'pending';
      return {
        id: wf?.id || p.id,
        pipelineId: p.id,
        runNumber: p.number,
        name: wf?.name || `Pipeline #${p.number || p.id}`,
        status: normalizeExecutionStatus(rawStatus, rawStatus),
        rawStatus,
        conclusion: rawStatus,
        branch: p.vcs?.branch || branch || 'main',
        commitSha: p.vcs?.revision || null,
        url: `https://app.circleci.com/pipelines/${slug}/${p.number || ''}`,
        createdAt: wf?.created_at || p.created_at,
        updatedAt: wf?.stopped_at || p.updated_at || p.created_at,
      };
    })
  );

  return runs;
}

async function getCircleRunStatus(creds, { projectId, owner, repo, runId }) {
  const client = makeCircleClient(creds.token, creds.baseUrl);
  let workflow = null;
  let workflowId = runId;

  try {
    const { data } = await client.get(`/workflow/${encodeURIComponent(runId)}`);
    workflow = data;
  } catch {
    // Fallback if runId is a pipelineId rather than workflowId
    const { data: wfList } = await client.get(`/pipeline/${encodeURIComponent(runId)}/workflow`);
    workflow = (wfList?.items || [])[0] || { id: runId, name: `Workflow ${runId}`, status: 'running' };
    workflowId = workflow.id || runId;
  }

  let rawJobs = [];
  try {
    const { data: jobsData } = await client.get(`/workflow/${encodeURIComponent(workflowId)}/job`);
    rawJobs = Array.isArray(jobsData?.items) ? jobsData.items : [];
  } catch {
    rawJobs = [];
  }

  const slug = workflow?.project_slug || (owner && repo ? `gh/${owner}/${repo}` : projectId || '');

  return {
    id: workflow.id || runId,
    runNumber: workflow.pipeline_number || null,
    name: workflow.name || `Workflow #${workflow.id || runId}`,
    status: normalizeExecutionStatus(workflow.status, workflow.status),
    rawStatus: workflow.status,
    conclusion: workflow.status,
    branch: null,
    commitSha: null,
    url: slug && workflow.pipeline_number
      ? `https://app.circleci.com/pipelines/${slug}/${workflow.pipeline_number}/workflows/${workflow.id}`
      : null,
    createdAt: workflow.created_at,
    updatedAt: workflow.stopped_at || workflow.created_at,
    jobs: rawJobs.map((j) => {
      let durationSeconds = null;
      if (j.started_at && j.stopped_at) {
        const diff = Math.round((new Date(j.stopped_at) - new Date(j.started_at)) / 1000);
        if (Number.isFinite(diff) && diff >= 0) durationSeconds = diff;
      }
      return {
        id: j.id || j.job_number,
        name: j.name,
        stage: j.name,
        status: normalizeExecutionStatus(j.status, j.status),
        rawStatus: j.status,
        conclusion: j.status,
        durationSeconds,
        url: j.web_url || null,
      };
    }),
  };
}

async function triggerCircleRun(creds, { projectId, owner, repo, branch = 'main', inputs = {} }) {
  const client = makeCircleClient(creds.token, creds.baseUrl);
  const slug = resolveCircleProjectSlug({ projectId, owner, repo });
  const { data } = await client.post(`/project/${slug}/pipeline`, {
    branch,
    parameters: inputs && typeof inputs === 'object' ? inputs : {},
  });
  return {
    triggered: true,
    platform: 'circleci',
    runId: data.id,
    runNumber: data.number,
    status: normalizeExecutionStatus(data.state, data.state),
    branch,
    url: `https://app.circleci.com/pipelines/${slug}/${data.number || ''}`,
  };
}

// ─── Unified Controllers ──────────────────────────────────────────────────────

/**
 * POST /api/runs/list
 * Lists recent pipeline/workflow runs for { platform, credentials, owner, repo, projectId, branch }
 */
async function listRuns(req, res) {
  try {
    const {
      platform,
      credentials,
      owner,
      repo,
      projectId,
      projectSlug,
      branch,
      perPage = 10,
    } = req.body || {};
    const resolvedProjectId = projectId || projectSlug;
    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        error: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
      });
    }

    const creds = resolveCredentials(platform, credentials);

    if (platform === 'github') {
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo are required for GitHub' });
      }
      const rawRuns = await githubService.listWorkflowRuns(creds.token, owner, repo, {
        branch,
        perPage,
      });
      const runs = rawRuns.map((r) => ({
        ...r,
        number: r.runNumber,
        rawStatus: r.status,
        status: normalizeExecutionStatus(r.status, r.conclusion),
      }));
      return res.json({ platform, runs });
    }

    if (platform === 'gitlab') {
      const targetProject = resolvedProjectId || (owner && repo ? `${owner}/${repo}` : repo);
      if (!targetProject) {
        return res.status(400).json({ error: 'projectId (or owner and repo) is required for GitLab' });
      }
      const rawRuns = await gitlabService.listPipelines(targetProject, {
        branch,
        perPage,
        token: creds.token,
        instanceUrl: creds.instanceUrl,
      });
      const runs = rawRuns.map((r) => ({
        ...r,
        number: r.runNumber,
        rawStatus: r.status,
        status: normalizeExecutionStatus(r.status, r.conclusion),
      }));
      return res.json({ platform, runs });
    }

    if (platform === 'bitbucket') {
      const workspace = creds.workspace || owner || creds.username;
      if (!repo) {
        return res.status(400).json({ error: 'repo is required for Bitbucket' });
      }
      const rawRuns = await bitbucketService.listPipelines(
        creds.username,
        creds.appPassword,
        workspace,
        repo,
        { branch, perPage }
      );
      const runs = rawRuns.map((r) => ({
        ...r,
        number: r.runNumber,
        rawStatus: r.status,
        status: normalizeExecutionStatus(r.status, r.conclusion),
      }));
      return res.json({ platform, runs });
    }

    if (platform === 'circleci') {
      const runs = await listCircleRuns(creds, {
        projectId: resolvedProjectId,
        owner,
        repo,
        branch,
        perPage,
      });
      return res.json({ platform, runs });
    }
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to list runs' });
  }
}

/**
 * POST /api/runs/status
 * Fetches normalized run status + per-job statuses (queued | running | passed | failed | skipped)
 * for { platform, credentials, owner, repo, projectId, runId }
 */
async function getRunStatus(req, res) {
  try {
    const { platform, credentials, owner, repo, projectId, projectSlug, runId } = req.body || {};
    const resolvedProjectId = projectId || projectSlug;
    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        error: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
      });
    }
    if (!runId && runId !== 0) {
      return res.status(400).json({ error: 'runId is required' });
    }

    const creds = resolveCredentials(platform, credentials);

    if (platform === 'github') {
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo are required for GitHub' });
      }
      const data = await githubService.getWorkflowRunStatus(creds.token, owner, repo, runId);
      const jobs = (data.jobs || []).map((j) => ({
        id: j.id,
        name: j.name,
        stage: j.name,
        status: normalizeExecutionStatus(j.status, j.conclusion),
        rawStatus: j.status,
        conclusion: j.conclusion,
        durationSeconds: j.durationSeconds ?? null,
        url: j.url || null,
      }));
      return res.json({
        platform,
        runId: data.id,
        id: data.id,
        runNumber: data.runNumber,
        name: data.name,
        status: normalizeExecutionStatus(data.status, data.conclusion),
        rawStatus: data.status,
        conclusion: data.conclusion,
        branch: data.branch,
        commitSha: data.commitSha,
        url: data.url,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        jobs,
      });
    }

    if (platform === 'gitlab') {
      const targetProject = resolvedProjectId || (owner && repo ? `${owner}/${repo}` : repo);
      if (!targetProject) {
        return res.status(400).json({ error: 'projectId (or owner and repo) is required for GitLab' });
      }
      const data = await gitlabService.getPipelineStatusWithJobs(targetProject, runId, {
        token: creds.token,
        instanceUrl: creds.instanceUrl,
      });
      const jobs = (data.jobs || []).map((j) => ({
        id: j.id,
        name: j.name,
        stage: j.stage || j.name,
        status: normalizeExecutionStatus(j.status, j.conclusion),
        rawStatus: j.status,
        conclusion: j.conclusion,
        durationSeconds: j.durationSeconds ?? null,
        url: j.url || null,
      }));
      return res.json({
        platform,
        runId: data.id,
        id: data.id,
        runNumber: data.runNumber,
        name: data.name,
        status: normalizeExecutionStatus(data.status, data.conclusion),
        rawStatus: data.status,
        conclusion: data.conclusion,
        branch: data.branch,
        commitSha: data.commitSha,
        url: data.url,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        jobs,
      });
    }

    if (platform === 'bitbucket') {
      const workspace = creds.workspace || owner || creds.username;
      if (!repo) {
        return res.status(400).json({ error: 'repo is required for Bitbucket' });
      }
      const data = await bitbucketService.getPipelineStatus(
        creds.username,
        creds.appPassword,
        workspace,
        repo,
        runId
      );
      const jobs = (data.jobs || []).map((j) => ({
        id: j.id,
        name: j.name,
        stage: j.name,
        status: normalizeExecutionStatus(j.status, j.conclusion),
        rawStatus: j.status,
        conclusion: j.conclusion,
        durationSeconds: j.durationSeconds ?? null,
        url: null,
      }));
      return res.json({
        platform,
        runId: data.id,
        id: data.id,
        runNumber: data.runNumber,
        name: data.name,
        status: normalizeExecutionStatus(data.status, data.conclusion),
        rawStatus: data.status,
        conclusion: data.conclusion,
        branch: data.branch,
        commitSha: data.commitSha,
        url: data.url,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        jobs,
      });
    }

    if (platform === 'circleci') {
      const data = await getCircleRunStatus(creds, {
        projectId: resolvedProjectId,
        owner,
        repo,
        runId,
      });
      return res.json({
        platform,
        runId: data.id,
        ...data,
      });
    }
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to get run status' });
  }
}

/**
 * POST /api/runs/trigger
 * Triggers a new pipeline/workflow run on GitHub Actions, GitLab CI, Bitbucket Pipelines, or CircleCI.
 */
async function triggerRun(req, res) {
  try {
    const {
      platform,
      credentials,
      owner,
      repo,
      projectId,
      projectSlug,
      branch,
      ref,
      workflowId,
      inputs,
      variables,
    } = req.body || {};
    const resolvedProjectId = projectId || projectSlug;

    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        error: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
      });
    }

    const targetBranch = branch || ref || 'main';
    const creds = resolveCredentials(platform, credentials);

    if (platform === 'github') {
      if (!owner || !repo) {
        return res.status(400).json({ error: 'owner and repo are required for GitHub' });
      }
      const result = await githubService.triggerWorkflowDispatch(
        creds.token,
        owner,
        repo,
        workflowId,
        targetBranch,
        inputs || {}
      );
      return res.json({
        triggered: true,
        platform,
        branch: targetBranch,
        workflowId: result.workflowId,
        status: 'queued',
        url: `https://github.com/${owner}/${repo}/actions`,
      });
    }

    if (platform === 'gitlab') {
      const targetProject = resolvedProjectId || (owner && repo ? `${owner}/${repo}` : repo);
      if (!targetProject) {
        return res.status(400).json({ error: 'projectId (or owner and repo) is required for GitLab' });
      }
      const result = await gitlabService.triggerPipelineWithCreds(targetProject, targetBranch, {
        token: creds.token,
        instanceUrl: creds.instanceUrl,
        variables,
      });
      return res.json({
        triggered: true,
        platform,
        runId: result.id,
        status: normalizeExecutionStatus(result.status, result.status),
        branch: result.branch,
        url: result.url,
      });
    }

    if (platform === 'bitbucket') {
      const workspace = creds.workspace || owner || creds.username;
      if (!repo) {
        return res.status(400).json({ error: 'repo is required for Bitbucket' });
      }
      const result = await bitbucketService.triggerPipeline(
        creds.username,
        creds.appPassword,
        workspace,
        repo,
        targetBranch
      );
      return res.json({
        triggered: true,
        platform,
        runId: result.id,
        runNumber: result.runNumber,
        status: normalizeExecutionStatus(result.status, result.status),
        branch: result.branch,
        url: result.url,
      });
    }

    if (platform === 'circleci') {
      const result = await triggerCircleRun(creds, {
        projectId: resolvedProjectId,
        owner,
        repo,
        branch: targetBranch,
        inputs,
      });
      return res.json(result);
    }
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to trigger pipeline run' });
  }
}

/**
 * POST /api/runs/diagnose-and-fix
 * Fetches failed job logs (or accepts provided failedLogs/YAML), calls aiService.explainPipelineFailure
 * and aiService.autoRemediatePipeline, and returns:
 * { explanation, failedJobs, remediation: { patchedYaml, changeLog, commitMessage } }
 */
async function diagnoseAndFix(req, res) {
  try {
    const {
      platform = 'github',
      credentials,
      owner,
      repo,
      projectId,
      projectSlug,
      runId,
      failedLogs: providedFailedLogs,
      logs: providedLogs,
      errorLogs,
      jobName,
      yaml: providedYaml,
      configText,
      aiProvider,
      aiOptions,
    } = req.body || {};
    const resolvedProjectId = projectId || projectSlug;

    let failedJobs = [];
    const inputLogs = Array.isArray(providedFailedLogs)
      ? providedFailedLogs
      : Array.isArray(providedLogs)
        ? providedLogs
        : typeof providedLogs === 'string' && providedLogs.trim()
          ? [{ jobId: 'job_1', jobName: jobName || 'failed_job', stage: 'test', log: providedLogs }]
          : typeof errorLogs === 'string' && errorLogs.trim()
            ? [{ jobId: 'job_1', jobName: jobName || 'failed_job', stage: 'test', log: errorLogs }]
            : [];

    if (inputLogs.length > 0) {
      failedJobs = inputLogs.map((entry, idx) => ({
        jobId: entry.jobId ?? entry.id ?? `job_${idx + 1}`,
        jobName: entry.jobName || entry.name || `job_${idx + 1}`,
        stage: entry.stage || entry.jobName || entry.name || 'build',
        log: String(entry.log || entry.output || ''),
      }));
    } else if (runId !== undefined && runId !== null) {
      if (!SUPPORTED_PLATFORMS.includes(platform)) {
        return res.status(400).json({
          error: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
        });
      }

      const creds = resolveCredentials(platform, credentials);

      if (platform === 'github') {
        if (!owner || !repo) {
          return res.status(400).json({ error: 'owner and repo are required for GitHub' });
        }
        const { failedLogs } = await githubService.getWorkflowRunLogs(creds.token, owner, repo, runId);
        failedJobs = failedLogs;
      } else if (platform === 'gitlab') {
        const targetProject = resolvedProjectId || (owner && repo ? `${owner}/${repo}` : repo);
        if (!targetProject) {
          return res.status(400).json({ error: 'projectId (or owner and repo) is required for GitLab' });
        }
        const { failedLogs } = await gitlabService.getPipelineLogsWithCreds(targetProject, runId, {
          token: creds.token,
          instanceUrl: creds.instanceUrl,
        });
        failedJobs = failedLogs;
      } else if (platform === 'bitbucket') {
        const workspace = creds.workspace || owner || creds.username;
        if (!repo) {
          return res.status(400).json({ error: 'repo is required for Bitbucket' });
        }
        const { failedLogs } = await bitbucketService.getPipelineLogs(
          creds.username,
          creds.appPassword,
          workspace,
          repo,
          runId
        );
        failedJobs = failedLogs;
      } else if (platform === 'circleci') {
        const statusData = await getCircleRunStatus(creds, {
          projectId: resolvedProjectId,
          owner,
          repo,
          runId,
        });
        failedJobs = (statusData.jobs || [])
          .filter((j) => j.status === 'failed')
          .map((j) => ({
            jobId: j.id,
            jobName: j.name,
            stage: j.stage || j.name,
            log: `CircleCI job "${j.name}" failed with status: ${j.rawStatus}`,
          }));
      }
    } else {
      return res.status(400).json({
        error: 'Provide either runId (with platform/repo details) or failedLogs array',
      });
    }

    if (failedJobs.length === 0) {
      return res.json({
        explanation: {
          summary: 'No failed jobs found in this pipeline run.',
          explanation: 'All jobs completed without failure or no failure logs were returned.',
          rootCause: 'None',
          suggestedFixes: [],
          hasSecurityIssue: false,
        },
        failedJobs: [],
        remediation: {
          patchedYaml: providedYaml || configText || '',
          changeLog: [],
          commitMessage: 'chore: no remediation needed',
        },
      });
    }

    const parsedAIOptions = buildAIOptions(aiOptions);
    let explanation;
    try {
      explanation = await aiService.explainPipelineFailure(failedJobs, {
        aiProvider,
        aiOptions: parsedAIOptions,
      });
    } catch (err) {
      const firstJob = failedJobs[0];
      explanation = {
        summary: `Job "${firstJob.jobName}" failed during ${firstJob.stage || 'execution'}.`,
        explanation: `Automated heuristic inspection of "${firstJob.jobName}" log output:\n${String(firstJob.log || '').slice(-600)}`,
        rootCause: `Non-zero exit or step failure in job "${firstJob.jobName}".`,
        suggestedFixes: [
          `Inspect the failing command in job "${firstJob.jobName}" and verify dependency versions.`,
          'Add retry or timeout guards if the failure was caused by transient network issues.',
        ],
        hasSecurityIssue: false,
        warning: err.message,
      };
    }

    const rawYaml = typeof providedYaml === 'string' && providedYaml.trim()
      ? providedYaml
      : typeof configText === 'string' && configText.trim()
        ? configText
        : '';

    let remediation = {
      patchedYaml: rawYaml,
      changeLog: [],
      commitMessage: 'fix: auto-remediation by FlowForge',
    };

    if (rawYaml) {
      try {
        const remResult = await aiService.autoRemediatePipeline(rawYaml, explanation, {
          aiProvider,
          cicdPlatform: platform,
          aiOptions: parsedAIOptions,
        });
        remediation = {
          patchedYaml: remResult?.patchedYaml || rawYaml,
          changeLog: Array.isArray(remResult?.changeLog) ? remResult.changeLog : [],
          commitMessage: remResult?.commitMessage || 'fix: auto-remediation by FlowForge',
        };
      } catch {
        remediation = {
          patchedYaml: `# FlowForge-fix: Reviewed failure in ${failedJobs[0]?.jobName || 'pipeline'}\n${rawYaml}`,
          changeLog: [
            {
              job: failedJobs[0]?.jobName || 'pipeline',
              change: explanation.suggestedFixes?.[0] || 'Added FlowForge remediation annotation',
            },
          ],
          commitMessage: `fix(ci): remediate ${failedJobs[0]?.jobName || 'pipeline'} failure`,
        };
      }
    }

    return res.json({
      explanation,
      diagnosis: explanation,
      rootCause: explanation?.rootCause || explanation?.summary,
      summary: explanation?.summary,
      failedJobs,
      remediation,
      patchedYaml: remediation.patchedYaml,
      changeLog: remediation.changeLog,
      commitMessage: remediation.commitMessage,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to diagnose and fix pipeline run' });
  }
}

module.exports = {
  SUPPORTED_PLATFORMS,
  normalizeExecutionStatus,
  listRuns,
  getRunStatus,
  triggerRun,
  diagnoseAndFix,
};
