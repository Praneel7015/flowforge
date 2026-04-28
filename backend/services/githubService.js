const axios = require('axios');

const GITHUB_API = 'https://api.github.com';
const DEFAULT_TIMEOUT = Number(process.env.GITHUB_TIMEOUT_MS || 20000);
const MAX_FILE_SIZE = 100 * 1024; // 100KB per file

function makeClient(token) {
  return axios.create({
    baseURL: GITHUB_API,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    timeout: DEFAULT_TIMEOUT,
  });
}

function toApiError(action, err) {
  const status = err.response?.status;
  const detail = err.response?.data?.message || err.message;
  return new Error(`GitHub ${action} failed${status ? ` (${status})` : ''}: ${detail}`);
}

function ensureToken(token) {
  if (!token) throw new Error('GitHub token is required');
}

// ─── Repo browsing ────────────────────────────────────────────────────────────

async function listRepos(token) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data } = await client.get('/user/repos', {
      params: { sort: 'updated', per_page: 100, affiliation: 'owner,collaborator' },
    });
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      defaultBranch: r.default_branch,
      private: r.private,
      description: r.description || '',
      language: r.language || '',
      updatedAt: r.updated_at,
    }));
  } catch (err) {
    throw toApiError('list repos', err);
  }
}

async function listBranches(token, owner, repo) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data } = await client.get(`/repos/${owner}/${repo}/branches`, {
      params: { per_page: 100 },
    });
    return data.map((b) => ({ name: b.name, sha: b.commit.sha }));
  } catch (err) {
    throw toApiError('list branches', err);
  }
}

async function getRepoTree(token, owner, repo, branch) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    // Get the branch SHA first
    const { data: branchData } = await client.get(`/repos/${owner}/${repo}/branches/${branch}`);
    const sha = branchData.commit.sha;

    const { data } = await client.get(`/repos/${owner}/${repo}/git/trees/${sha}`, {
      params: { recursive: '1' },
    });

    return data.tree
      .filter((item) => item.type === 'blob' || item.type === 'tree')
      .map((item) => ({
        path: item.path,
        type: item.type === 'tree' ? 'dir' : 'file',
        size: item.size || 0,
      }));
  } catch (err) {
    throw toApiError('get repo tree', err);
  }
}

async function getFileContent(token, owner, repo, path, branch) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data } = await client.get(`/repos/${owner}/${repo}/contents/${path}`, {
      params: branch ? { ref: branch } : {},
    });

    if (data.size > MAX_FILE_SIZE) {
      return { path, content: null, skipped: true, reason: `File too large (${Math.round(data.size / 1024)}KB)` };
    }

    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { path, content, sha: data.sha, encoding: 'utf8' };
  } catch (err) {
    if (err.response?.status === 404) {
      return { path, content: null, skipped: true, reason: 'File not found' };
    }
    throw toApiError('get file content', err);
  }
}

async function getFileContents(token, owner, repo, paths, branch) {
  const results = await Promise.allSettled(
    paths.map((p) => getFileContent(token, owner, repo, p, branch))
  );
  return results
    .map((r, i) => (r.status === 'fulfilled' ? r.value : { path: paths[i], content: null, skipped: true, reason: r.reason?.message }))
    .filter((r) => !r.skipped);
}

// ─── Pipeline push ────────────────────────────────────────────────────────────

async function getDefaultBranch(token, owner, repo) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data } = await client.get(`/repos/${owner}/${repo}`);
    return data.default_branch || 'main';
  } catch (err) {
    throw toApiError('get default branch', err);
  }
}

async function getFileSha(token, owner, repo, path, branch) {
  const client = makeClient(token);
  try {
    const { data } = await client.get(`/repos/${owner}/${repo}/contents/${path}`, {
      params: branch ? { ref: branch } : {},
    });
    return data.sha || null;
  } catch {
    return null;
  }
}

async function pushFile(token, owner, repo, path, content, commitMessage, branch) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const existingSha = await getFileSha(token, owner, repo, path, branch);
    const body = {
      message: commitMessage || `ci: add ${path} via FlowForge`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
    };
    if (existingSha) body.sha = existingSha;

    const { data } = await client.put(`/repos/${owner}/${repo}/contents/${path}`, body);
    return {
      path,
      sha: data.content?.sha,
      commitSha: data.commit?.sha,
      commitUrl: data.commit?.html_url,
    };
  } catch (err) {
    throw toApiError('push file', err);
  }
}

async function createBranch(token, owner, repo, branchName, fromRef) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    // Get the SHA of the source ref
    const { data: refData } = await client.get(`/repos/${owner}/${repo}/git/ref/heads/${fromRef}`);
    const sha = refData.object.sha;

    await client.post(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha,
    });
    return { name: branchName, sha };
  } catch (err) {
    if (err.response?.status === 422) {
      throw new Error(`Branch "${branchName}" already exists`);
    }
    throw toApiError('create branch', err);
  }
}

async function createPullRequest(token, owner, repo, { title, body, head, base }) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data } = await client.post(`/repos/${owner}/${repo}/pulls`, {
      title,
      body: body || '',
      head,
      base,
    });
    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state,
    };
  } catch (err) {
    throw toApiError('create pull request', err);
  }
}

// ─── Actions / webhook support ────────────────────────────────────────────────

async function getWorkflowRunStatus(token, owner, repo, runId) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data } = await client.get(`/repos/${owner}/${repo}/actions/runs/${runId}`);
    return {
      id: data.id,
      name: data.name,
      status: data.status,
      conclusion: data.conclusion,
      branch: data.head_branch,
      commitSha: data.head_sha,
      url: data.html_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    throw toApiError('get workflow run status', err);
  }
}

async function getWorkflowRunLogs(token, owner, repo, runId) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data: jobs } = await client.get(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);

    const failedJobs = (jobs.jobs || []).filter((j) => j.conclusion === 'failure');

    const logs = failedJobs.map((job) => ({
      jobId: job.id,
      jobName: job.name,
      stage: job.name,
      log: job.steps
        .filter((s) => s.conclusion === 'failure')
        .map((s) => `Step: ${s.name}\nConclusion: ${s.conclusion}`)
        .join('\n'),
    }));

    return { jobs: jobs.jobs || [], failedLogs: logs };
  } catch (err) {
    throw toApiError('get workflow run logs', err);
  }
}

async function postPRComment(token, owner, repo, prNumber, body) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    const { data } = await client.post(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, { body });
    return { id: data.id, url: data.html_url };
  } catch (err) {
    throw toApiError('post PR comment', err);
  }
}

async function triggerWorkflowDispatch(token, owner, repo, workflowId, ref = 'main', inputs = {}) {
  ensureToken(token);
  const client = makeClient(token);
  try {
    await client.post(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      ref,
      inputs,
    });
    return { triggered: true, ref, workflowId };
  } catch (err) {
    throw toApiError('trigger workflow dispatch', err);
  }
}

module.exports = {
  listRepos,
  listBranches,
  getRepoTree,
  getFileContent,
  getFileContents,
  getDefaultBranch,
  pushFile,
  createBranch,
  createPullRequest,
  getWorkflowRunStatus,
  getWorkflowRunLogs,
  postPRComment,
  triggerWorkflowDispatch,
};
