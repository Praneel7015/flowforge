const githubService = require('../services/githubService');
const gitlabService = require('../services/gitlabService');
const bitbucketService = require('../services/bitbucketService');

function extractGitHubCreds(credentials) {
  return { token: credentials.token };
}

function extractGitLabCreds(credentials) {
  return { token: credentials.token, instanceUrl: credentials.instanceUrl };
}

function extractBitbucketCreds(credentials) {
  return {
    username: credentials.username,
    appPassword: credentials.appPassword,
    workspace: credentials.workspace,
  };
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

// ─── List repos ───────────────────────────────────────────────────────────────

async function listRepos(req, res) {
  const { platform, credentials } = req.body;

  try {
    let repos;
    if (platform === 'github') {
      const { token } = extractGitHubCreds(credentials);
      repos = await githubService.listRepos(token);
    } else if (platform === 'gitlab') {
      const { token, instanceUrl } = extractGitLabCreds(credentials);
      repos = await gitlabService.listUserRepos(token, instanceUrl);
    } else if (platform === 'bitbucket') {
      const { username, appPassword, workspace } = extractBitbucketCreds(credentials);
      repos = await bitbucketService.listRepos(username, appPassword, workspace);
    } else {
      return badRequest(res, `Unsupported platform: ${platform}`);
    }
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── List branches ────────────────────────────────────────────────────────────

async function listBranches(req, res) {
  const { platform, credentials, owner, repo } = req.body;

  try {
    let branches;
    if (platform === 'github') {
      const { token } = extractGitHubCreds(credentials);
      branches = await githubService.listBranches(token, owner, repo);
    } else if (platform === 'gitlab') {
      const { token, instanceUrl } = extractGitLabCreds(credentials);
      branches = await gitlabService.listUserBranches(token, instanceUrl, repo);
    } else if (platform === 'bitbucket') {
      const { username, appPassword, workspace } = extractBitbucketCreds(credentials);
      branches = await bitbucketService.listBranches(username, appPassword, workspace, repo);
    } else {
      return badRequest(res, `Unsupported platform: ${platform}`);
    }
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Get file tree ────────────────────────────────────────────────────────────

async function getRepoTree(req, res) {
  const { platform, credentials, owner, repo, branch } = req.body;

  try {
    let tree;
    if (platform === 'github') {
      const { token } = extractGitHubCreds(credentials);
      tree = await githubService.getRepoTree(token, owner, repo, branch);
    } else if (platform === 'gitlab') {
      const { token, instanceUrl } = extractGitLabCreds(credentials);
      tree = await gitlabService.getUserRepoTree(token, instanceUrl, repo, branch);
    } else if (platform === 'bitbucket') {
      const { username, appPassword, workspace } = extractBitbucketCreds(credentials);
      tree = await bitbucketService.getRepoTree(username, appPassword, workspace, repo, branch);
    } else {
      return badRequest(res, `Unsupported platform: ${platform}`);
    }
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Get file contents (batch) ────────────────────────────────────────────────

async function getFileContents(req, res) {
  const { platform, credentials, owner, repo, paths, branch } = req.body;

  if (!Array.isArray(paths) || paths.length === 0) {
    return badRequest(res, 'paths must be a non-empty array');
  }

  if (paths.length > 30) {
    return badRequest(res, 'Maximum 30 files per request');
  }

  try {
    let files;
    if (platform === 'github') {
      const { token } = extractGitHubCreds(credentials);
      files = await githubService.getFileContents(token, owner, repo, paths, branch);
    } else if (platform === 'gitlab') {
      const { token, instanceUrl } = extractGitLabCreds(credentials);
      files = await gitlabService.getUserFileContents(token, instanceUrl, repo, paths, branch);
    } else if (platform === 'bitbucket') {
      const { username, appPassword, workspace } = extractBitbucketCreds(credentials);
      files = await bitbucketService.getFileContents(username, appPassword, workspace, repo, paths, branch);
    } else {
      return badRequest(res, `Unsupported platform: ${platform}`);
    }
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Push pipeline YAML to repo ───────────────────────────────────────────────

async function pushPipeline(req, res) {
  const {
    platform,
    credentials,
    owner,
    repo,
    yamlContent,
    filePath,
    commitMessage,
    branch,
    mode,       // 'direct' | 'pr'
    prBranch,
    prTitle,
    prDescription,
    targetBranch,
  } = req.body;

  if (!yamlContent) return badRequest(res, 'yamlContent is required');
  if (!branch) return badRequest(res, 'branch is required');

  const resolvedFilePath = filePath || '.github/workflows/ci.yml';
  const resolvedCommitMessage = commitMessage || 'ci: add pipeline config via FlowForge';

  try {
    if (mode === 'pr') {
      // Create new branch, push file, open PR/MR
      const newBranch = prBranch || `flowforge/add-pipeline-${Date.now()}`;
      const baseBranch = targetBranch || branch;

      if (platform === 'github') {
        const { token } = extractGitHubCreds(credentials);
        await githubService.createBranch(token, owner, repo, newBranch, baseBranch);
        await githubService.pushFile(token, owner, repo, resolvedFilePath, yamlContent, resolvedCommitMessage, newBranch);
        const pr = await githubService.createPullRequest(token, owner, repo, {
          title: prTitle || 'ci: add FlowForge pipeline config',
          body: prDescription || 'Adds a CI/CD pipeline configuration generated by FlowForge.',
          head: newBranch,
          base: baseBranch,
        });
        return res.json({ success: true, mode: 'pr', url: pr.url, prNumber: pr.number, branch: newBranch });
      }

      if (platform === 'gitlab') {
        const { token, instanceUrl } = extractGitLabCreds(credentials);
        await gitlabService.createUserBranch(token, instanceUrl, repo, newBranch, baseBranch);
        await gitlabService.pushUserFile(token, instanceUrl, repo, resolvedFilePath, yamlContent, resolvedCommitMessage, newBranch);
        const mr = await gitlabService.createUserMergeRequest(token, instanceUrl, repo, {
          title: prTitle || 'ci: add FlowForge pipeline config',
          description: prDescription || 'Adds a CI/CD pipeline configuration generated by FlowForge.',
          sourceBranch: newBranch,
          targetBranch: baseBranch,
        });
        return res.json({ success: true, mode: 'mr', url: mr.url, prNumber: mr.number, branch: newBranch });
      }

      if (platform === 'bitbucket') {
        const { username, appPassword, workspace } = extractBitbucketCreds(credentials);
        await bitbucketService.createBranch(username, appPassword, workspace, repo, newBranch, baseBranch);
        await bitbucketService.pushFile(username, appPassword, workspace, repo, resolvedFilePath, yamlContent, resolvedCommitMessage, newBranch);
        const pr = await bitbucketService.createPullRequest(username, appPassword, workspace, repo, {
          title: prTitle || 'ci: add FlowForge pipeline config',
          description: prDescription || 'Adds a CI/CD pipeline configuration generated by FlowForge.',
          sourceBranch: newBranch,
          targetBranch: baseBranch,
        });
        return res.json({ success: true, mode: 'pr', url: pr.url, prNumber: pr.number, branch: newBranch });
      }

      return badRequest(res, `Unsupported platform: ${platform}`);
    }

    // Direct commit
    if (platform === 'github') {
      const { token } = extractGitHubCreds(credentials);
      const result = await githubService.pushFile(token, owner, repo, resolvedFilePath, yamlContent, resolvedCommitMessage, branch);
      return res.json({ success: true, mode: 'direct', url: result.commitUrl, branch });
    }

    if (platform === 'gitlab') {
      const { token, instanceUrl } = extractGitLabCreds(credentials);
      await gitlabService.pushUserFile(token, instanceUrl, repo, resolvedFilePath, yamlContent, resolvedCommitMessage, branch);
      return res.json({ success: true, mode: 'direct', branch });
    }

    if (platform === 'bitbucket') {
      const { username, appPassword, workspace } = extractBitbucketCreds(credentials);
      await bitbucketService.pushFile(username, appPassword, workspace, repo, resolvedFilePath, yamlContent, resolvedCommitMessage, branch);
      return res.json({ success: true, mode: 'direct', branch });
    }

    return badRequest(res, `Unsupported platform: ${platform}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listRepos,
  listBranches,
  getRepoTree,
  getFileContents,
  pushPipeline,
};
