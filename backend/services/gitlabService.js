const axios = require('axios');

const GITLAB_URL = process.env.GITLAB_URL || 'https://gitlab.com';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const GITLAB_TIMEOUT_MS = Number(process.env.GITLAB_TIMEOUT_MS || 20000);

const gitlab = axios.create({
  baseURL: `${GITLAB_URL}/api/v4`,
  headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN },
  timeout: GITLAB_TIMEOUT_MS,
});

function ensureGitLabConfigured() {
  if (!GITLAB_TOKEN) {
    throw new Error('GITLAB_TOKEN is missing. Configure it in backend/.env');
  }
}

function toApiError(action, err) {
  const status = err.response?.status;
  const detail = err.response?.data?.message || err.response?.data?.error || err.message;
  return new Error(`${action} failed${status ? ` (${status})` : ''}: ${detail}`);
}

/**
 * Get the status of a pipeline by project and pipeline ID.
 */
async function getPipelineStatus(projectId, pipelineId) {
  ensureGitLabConfigured();
  try {
    const encodedProjectId = encodeURIComponent(projectId);
    const { data } = await gitlab.get(`/projects/${encodedProjectId}/pipelines/${pipelineId}`);
    return data;
  } catch (err) {
    throw toApiError('Get pipeline status', err);
  }
}

/**
 * Get jobs (and their logs) for a pipeline.
 */
async function getPipelineLogs(projectId, pipelineId) {
  ensureGitLabConfigured();
  try {
    const encodedProjectId = encodeURIComponent(projectId);
    const { data: jobs } = await gitlab.get(
      `/projects/${encodedProjectId}/pipelines/${pipelineId}/jobs`
    );

    const logs = await Promise.all(
      jobs
        .filter((job) => job.status === 'failed')
        .map(async (job) => {
          const { data: trace } = await gitlab.get(
            `/projects/${encodedProjectId}/jobs/${job.id}/trace`,
            { transformResponse: [(d) => d] }
          );
          return {
            jobId: job.id,
            jobName: job.name,
            stage: job.stage,
            log: typeof trace === 'string' ? trace : JSON.stringify(trace),
          };
        })
    );

    return { jobs, failedLogs: logs };
  } catch (err) {
    throw toApiError('Get pipeline logs', err);
  }
}

/**
 * Create a GitLab issue in a project.
 */
async function createIssue(projectId, { title, description, labels }) {
  ensureGitLabConfigured();
  try {
    const encodedProjectId = encodeURIComponent(projectId);
    const { data } = await gitlab.post(`/projects/${encodedProjectId}/issues`, {
      title,
      description,
      labels: labels || 'security,automated',
    });
    return data;
  } catch (err) {
    throw toApiError('Create issue', err);
  }
}

/**
 * Trigger a pipeline on a given ref.
 */
async function triggerPipeline(projectId, ref = 'main') {
  ensureGitLabConfigured();
  try {
    const encodedProjectId = encodeURIComponent(projectId);
    const { data } = await gitlab.post(`/projects/${encodedProjectId}/pipeline`, { ref });
    return data;
  } catch (err) {
    throw toApiError('Trigger pipeline', err);
  }
}

/**
 * Post a comment on a merge request.
 */
async function commentOnMergeRequest(projectId, mergeRequestIid, body) {
  ensureGitLabConfigured();
  try {
    const encodedProjectId = encodeURIComponent(projectId);
    const { data } = await gitlab.post(
      `/projects/${encodedProjectId}/merge_requests/${mergeRequestIid}/notes`,
      { body }
    );
    return data;
  } catch (err) {
    throw toApiError('Comment on merge request', err);
  }
}

/**
 * Post a comment on a commit.
 */
async function commentOnCommit(projectId, sha, note) {
  ensureGitLabConfigured();
  try {
    const encodedProjectId = encodeURIComponent(projectId);
    const { data } = await gitlab.post(
      `/projects/${encodedProjectId}/repository/commits/${sha}/comments`,
      { note }
    );
    return data;
  } catch (err) {
    throw toApiError('Comment on commit', err);
  }
}

module.exports = {
  getPipelineStatus,
  getPipelineLogs,
  createIssue,
  triggerPipeline,
  commentOnMergeRequest,
  commentOnCommit,
};
