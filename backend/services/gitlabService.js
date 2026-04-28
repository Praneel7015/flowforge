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

// ─── User-initiated repo functions (token per request) ───────────────────────

const MAX_FILE_SIZE = 100 * 1024;

function makeUserClient(token, instanceUrl) {
  const base = (instanceUrl || 'https://gitlab.com').replace(/\/+$/, '');
  return axios.create({
    baseURL: `${base}/api/v4`,
    headers: { 'PRIVATE-TOKEN': token },
    timeout: GITLAB_TIMEOUT_MS,
  });
}

async function listUserRepos(token, instanceUrl) {
  if (!token) throw new Error('GitLab token is required');
  const client = makeUserClient(token, instanceUrl);
  try {
    const { data } = await client.get('/projects', {
      params: { membership: true, order_by: 'last_activity_at', per_page: 100, simple: true },
    });
    return data.map((p) => ({
      id: p.id,
      name: p.name,
      fullName: p.path_with_namespace,
      owner: p.namespace?.path,
      defaultBranch: p.default_branch || 'main',
      private: p.visibility !== 'public',
      description: p.description || '',
    }));
  } catch (err) {
    throw toApiError('list repos', err);
  }
}

async function listUserBranches(token, instanceUrl, projectId) {
  if (!token) throw new Error('GitLab token is required');
  const client = makeUserClient(token, instanceUrl);
  try {
    const encoded = encodeURIComponent(projectId);
    const { data } = await client.get(`/projects/${encoded}/repository/branches`, {
      params: { per_page: 100 },
    });
    return data.map((b) => ({ name: b.name, sha: b.commit?.id }));
  } catch (err) {
    throw toApiError('list branches', err);
  }
}

async function getUserRepoTree(token, instanceUrl, projectId, branch) {
  if (!token) throw new Error('GitLab token is required');
  const client = makeUserClient(token, instanceUrl);
  try {
    const encoded = encodeURIComponent(projectId);
    const allItems = [];
    let page = 1;

    while (true) {
      const { data } = await client.get(`/projects/${encoded}/repository/tree`, {
        params: { ref: branch, recursive: true, per_page: 100, page },
      });
      if (!data.length) break;
      allItems.push(...data);
      if (data.length < 100) break;
      page++;
    }

    return allItems.map((item) => ({
      path: item.path,
      type: item.type === 'tree' ? 'dir' : 'file',
      size: 0,
    }));
  } catch (err) {
    throw toApiError('get repo tree', err);
  }
}

async function getUserFileContent(token, instanceUrl, projectId, filePath, branch) {
  if (!token) throw new Error('GitLab token is required');
  const client = makeUserClient(token, instanceUrl);
  try {
    const encodedProject = encodeURIComponent(projectId);
    const encodedPath = encodeURIComponent(filePath);

    const { data: meta } = await client.get(
      `/projects/${encodedProject}/repository/files/${encodedPath}`,
      { params: { ref: branch } }
    );

    if (meta.size > MAX_FILE_SIZE) {
      return { path: filePath, content: null, skipped: true, reason: `File too large (${Math.round(meta.size / 1024)}KB)` };
    }

    const content = Buffer.from(meta.content, 'base64').toString('utf8');
    return { path: filePath, content };
  } catch (err) {
    if (err.response?.status === 404) {
      return { path: filePath, content: null, skipped: true, reason: 'File not found' };
    }
    throw toApiError('get file content', err);
  }
}

async function getUserFileContents(token, instanceUrl, projectId, paths, branch) {
  const results = await Promise.allSettled(
    paths.map((p) => getUserFileContent(token, instanceUrl, projectId, p, branch))
  );
  return results
    .map((r, i) => (r.status === 'fulfilled' ? r.value : { path: paths[i], content: null, skipped: true, reason: r.reason?.message }))
    .filter((r) => !r.skipped);
}

async function pushUserFile(token, instanceUrl, projectId, filePath, content, commitMessage, branch) {
  if (!token) throw new Error('GitLab token is required');
  const client = makeUserClient(token, instanceUrl);
  const encodedProject = encodeURIComponent(projectId);
  const encodedPath = encodeURIComponent(filePath);

  // Check if file exists to decide create vs update
  let exists = false;
  try {
    await client.get(`/projects/${encodedProject}/repository/files/${encodedPath}`, {
      params: { ref: branch },
    });
    exists = true;
  } catch {
    exists = false;
  }

  try {
    const body = {
      branch,
      content,
      commit_message: commitMessage || `ci: add ${filePath} via FlowForge`,
      encoding: 'text',
    };

    const method = exists ? 'put' : 'post';
    const { data } = await client[method](
      `/projects/${encodedProject}/repository/files/${encodedPath}`,
      body
    );
    return { path: filePath, branch: data.branch };
  } catch (err) {
    throw toApiError('push file', err);
  }
}

async function createUserBranch(token, instanceUrl, projectId, branchName, fromRef) {
  if (!token) throw new Error('GitLab token is required');
  const client = makeUserClient(token, instanceUrl);
  try {
    const encoded = encodeURIComponent(projectId);
    const { data } = await client.post(`/projects/${encoded}/repository/branches`, {
      branch: branchName,
      ref: fromRef,
    });
    return { name: data.name };
  } catch (err) {
    if (err.response?.status === 400) {
      throw new Error(`Branch "${branchName}" already exists`);
    }
    throw toApiError('create branch', err);
  }
}

async function createUserMergeRequest(token, instanceUrl, projectId, { title, description, sourceBranch, targetBranch }) {
  if (!token) throw new Error('GitLab token is required');
  const client = makeUserClient(token, instanceUrl);
  try {
    const encoded = encodeURIComponent(projectId);
    const { data } = await client.post(`/projects/${encoded}/merge_requests`, {
      title,
      description: description || '',
      source_branch: sourceBranch,
      target_branch: targetBranch,
    });
    return { number: data.iid, url: data.web_url, title: data.title };
  } catch (err) {
    throw toApiError('create merge request', err);
  }
}

module.exports = {
  getPipelineStatus,
  getPipelineLogs,
  createIssue,
  triggerPipeline,
  commentOnMergeRequest,
  commentOnCommit,
  listUserRepos,
  listUserBranches,
  getUserRepoTree,
  getUserFileContent,
  getUserFileContents,
  pushUserFile,
  createUserBranch,
  createUserMergeRequest,
};
