const axios = require('axios');

const BITBUCKET_API = 'https://api.bitbucket.org/2.0';
const DEFAULT_TIMEOUT = Number(process.env.BITBUCKET_TIMEOUT_MS || 20000);
const MAX_FILE_SIZE = 100 * 1024;

function makeClient(username, appPassword) {
  return axios.create({
    baseURL: BITBUCKET_API,
    auth: { username, password: appPassword },
    timeout: DEFAULT_TIMEOUT,
  });
}

function toApiError(action, err) {
  const status = err.response?.status;
  const detail = err.response?.data?.error?.message || err.response?.data?.message || err.message;
  return new Error(`Bitbucket ${action} failed${status ? ` (${status})` : ''}: ${detail}`);
}

function ensureCreds(username, appPassword) {
  if (!username || !appPassword) throw new Error('Bitbucket username and app password are required');
}

// ─── Repo browsing ────────────────────────────────────────────────────────────

async function listRepos(username, appPassword, workspace) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;
  try {
    const { data } = await client.get(`/repositories/${ws}`, {
      params: { pagelen: 100, sort: '-updated_on', fields: 'values.slug,values.full_name,values.name,values.mainbranch,values.is_private,values.description,values.language,values.updated_on' },
    });
    return (data.values || []).map((r) => ({
      id: r.slug,
      name: r.name,
      fullName: r.full_name,
      owner: ws,
      defaultBranch: r.mainbranch?.name || 'main',
      private: r.is_private,
      description: r.description || '',
      language: r.language || '',
      updatedAt: r.updated_on,
    }));
  } catch (err) {
    throw toApiError('list repos', err);
  }
}

async function listBranches(username, appPassword, workspace, repo) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;
  try {
    const { data } = await client.get(`/repositories/${ws}/${repo}/refs/branches`, {
      params: { pagelen: 100 },
    });
    return (data.values || []).map((b) => ({
      name: b.name,
      sha: b.target?.hash,
    }));
  } catch (err) {
    throw toApiError('list branches', err);
  }
}

async function getRepoTree(username, appPassword, workspace, repo, branch) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;

  const allItems = [];

  async function fetchDir(path) {
    const url = path
      ? `/repositories/${ws}/${repo}/src/${branch}/${path}`
      : `/repositories/${ws}/${repo}/src/${branch}/`;

    try {
      const { data } = await client.get(url, { params: { pagelen: 100 } });
      const items = data.values || [];

      for (const item of items) {
        if (item.type === 'commit_directory') {
          allItems.push({ path: item.path, type: 'dir', size: 0 });
          await fetchDir(item.path);
        } else if (item.type === 'commit_file') {
          allItems.push({ path: item.path, type: 'file', size: item.size || 0 });
        }
      }
    } catch {
      // Silently skip unreadable directories
    }
  }

  await fetchDir('');
  return allItems;
}

async function getFileContent(username, appPassword, workspace, repo, filePath, branch) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;

  try {
    // Get file metadata first to check size
    const { data: meta } = await client.get(
      `/repositories/${ws}/${repo}/src/${branch}/${filePath}`,
      { params: { format: 'meta' } }
    );

    if (meta.size > MAX_FILE_SIZE) {
      return { path: filePath, content: null, skipped: true, reason: `File too large (${Math.round(meta.size / 1024)}KB)` };
    }

    const { data: content } = await client.get(
      `/repositories/${ws}/${repo}/src/${branch}/${filePath}`,
      { responseType: 'text', transformResponse: [(d) => d] }
    );

    return { path: filePath, content: typeof content === 'string' ? content : JSON.stringify(content) };
  } catch (err) {
    if (err.response?.status === 404) {
      return { path: filePath, content: null, skipped: true, reason: 'File not found' };
    }
    throw toApiError('get file content', err);
  }
}

async function getFileContents(username, appPassword, workspace, repo, paths, branch) {
  const results = await Promise.allSettled(
    paths.map((p) => getFileContent(username, appPassword, workspace, repo, p, branch))
  );
  return results
    .map((r, i) => (r.status === 'fulfilled' ? r.value : { path: paths[i], content: null, skipped: true, reason: r.reason?.message }))
    .filter((r) => !r.skipped);
}

// ─── Pipeline push ────────────────────────────────────────────────────────────

async function pushFile(username, appPassword, workspace, repo, filePath, content, commitMessage, branch) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;

  try {
    // Bitbucket uses multipart form for file commits
    const FormData = require('form-data');
    const form = new FormData();
    form.append(filePath, content, { filename: filePath });
    form.append('message', commitMessage || `ci: add ${filePath} via FlowForge`);
    form.append('branch', branch);

    await client.post(`/repositories/${ws}/${repo}/src`, form, {
      headers: form.getHeaders(),
    });

    return { path: filePath, branch };
  } catch (err) {
    throw toApiError('push file', err);
  }
}

async function createBranch(username, appPassword, workspace, repo, branchName, fromRef) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;

  try {
    const { data } = await client.post(`/repositories/${ws}/${repo}/refs/branches`, {
      name: branchName,
      target: { hash: fromRef },
    });
    return { name: data.name };
  } catch (err) {
    throw toApiError('create branch', err);
  }
}

async function createPullRequest(username, appPassword, workspace, repo, { title, description, sourceBranch, targetBranch }) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;

  try {
    const { data } = await client.post(`/repositories/${ws}/${repo}/pullrequests`, {
      title,
      description: description || '',
      source: { branch: { name: sourceBranch } },
      destination: { branch: { name: targetBranch } },
    });
    return {
      number: data.id,
      url: data.links?.html?.href,
      title: data.title,
    };
  } catch (err) {
    throw toApiError('create pull request', err);
  }
}

async function getDefaultBranch(username, appPassword, workspace, repo) {
  ensureCreds(username, appPassword);
  const client = makeClient(username, appPassword);
  const ws = workspace || username;
  try {
    const { data } = await client.get(`/repositories/${ws}/${repo}`);
    return data.mainbranch?.name || 'main';
  } catch (err) {
    throw toApiError('get default branch', err);
  }
}

module.exports = {
  listRepos,
  listBranches,
  getRepoTree,
  getFileContent,
  getFileContents,
  pushFile,
  createBranch,
  createPullRequest,
  getDefaultBranch,
};
