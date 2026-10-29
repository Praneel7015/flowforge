const express = require('express');
const router = express.Router();
const controller = require('../controllers/repoController');

const SUPPORTED_PLATFORMS = ['github', 'gitlab', 'bitbucket'];

function validatePlatformAndCreds(req, res, next) {
  const { platform, credentials } = req.body;

  if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}` });
  }

  if (!credentials || typeof credentials !== 'object') {
    return res.status(400).json({ error: 'credentials object is required' });
  }

  if (platform === 'github' && !credentials.token) {
    return res.status(400).json({ error: 'credentials.token is required for GitHub' });
  }

  if (platform === 'gitlab' && !credentials.token) {
    return res.status(400).json({ error: 'credentials.token is required for GitLab' });
  }

  if (platform === 'bitbucket' && (!credentials.username || !credentials.appPassword)) {
    return res.status(400).json({ error: 'credentials.username and credentials.appPassword are required for Bitbucket' });
  }

  next();
}

function validateRepoBody(req, res, next) {
  const { repo } = req.body;
  if (!repo || typeof repo !== 'string') {
    return res.status(400).json({ error: 'repo is required' });
  }
  next();
}

function validateBranchBody(req, res, next) {
  const { branch } = req.body;
  if (!branch || typeof branch !== 'string') {
    return res.status(400).json({ error: 'branch is required' });
  }
  next();
}

// List repos for connected platform
router.post('/list-repos', validatePlatformAndCreds, controller.listRepos);

// List branches for a repo
router.post('/list-branches', validatePlatformAndCreds, validateRepoBody, controller.listBranches);

// Get full file tree for a repo + branch
router.post('/tree', validatePlatformAndCreds, validateRepoBody, validateBranchBody, controller.getRepoTree);

// Fetch contents of selected files (batch, max 30)
router.post('/file-contents', validatePlatformAndCreds, validateRepoBody, validateBranchBody, controller.getFileContents);

// Push generated pipeline YAML to repo (direct commit or PR/MR)
router.post('/push-pipeline', validatePlatformAndCreds, validateRepoBody, controller.pushPipeline);

module.exports = router;
