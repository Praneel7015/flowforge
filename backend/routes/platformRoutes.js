const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * POST /api/platforms/validate
 * Validate credentials for a CI/CD platform by calling its API.
 * Body: { platform, credentials }
 */
router.post('/validate', async (req, res) => {
  const { platform, credentials } = req.body;

  if (!platform || !credentials) {
    return res.status(400).json({ valid: false, error: 'Platform and credentials are required.' });
  }

  try {
    const result = await validatePlatform(platform, credentials);
    res.json(result);
  } catch (err) {
    res.json({
      valid: false,
      error: err.message || 'Validation failed unexpectedly.',
    });
  }
});

async function validatePlatform(platform, creds) {
  switch (platform) {
    case 'gitlab':
      return validateGitLab(creds);
    case 'github':
      return validateGitHub(creds);
    case 'bitbucket':
      return validateBitbucket(creds);
    case 'circleci':
      return validateCircleCI(creds);
    default:
      return { valid: false, error: `Unknown platform: ${platform}` };
  }
}

async function validateGitLab(creds) {
  const { instanceUrl, token } = creds;
  if (!token) return { valid: false, error: 'Personal Access Token is required.' };

  const baseUrl = (instanceUrl || 'https://gitlab.com').replace(/\/+$/, '');

  try {
    const { data } = await axios.get(`${baseUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token },
      timeout: 10000,
    });
    return {
      valid: true,
      user: data.username,
      message: `Authenticated as @${data.username}`,
    };
  } catch (err) {
    if (err.response?.status === 401) {
      return { valid: false, error: 'Invalid token. Check your Personal Access Token.' };
    }
    if (err.response?.status === 403) {
      return { valid: false, error: 'Token lacks required scopes. Needs at least read_api.' };
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return { valid: false, error: `Cannot reach ${baseUrl}. Check the instance URL.` };
    }
    return { valid: false, error: err.response?.data?.message || 'Connection failed.' };
  }
}

async function validateGitHub(creds) {
  const { token } = creds;
  if (!token) return { valid: false, error: 'Personal Access Token is required.' };

  try {
    const { data } = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      timeout: 10000,
    });
    return {
      valid: true,
      user: data.login,
      message: `Authenticated as @${data.login}`,
    };
  } catch (err) {
    if (err.response?.status === 401) {
      return { valid: false, error: 'Invalid token. Check your Personal Access Token.' };
    }
    if (err.response?.status === 403) {
      return { valid: false, error: 'Token lacks required permissions or rate limit exceeded.' };
    }
    return { valid: false, error: err.response?.data?.message || 'Connection failed.' };
  }
}

async function validateBitbucket(creds) {
  const { username, appPassword, workspace } = creds;
  if (!username || !appPassword) {
    return { valid: false, error: 'Username and App Password are both required.' };
  }

  try {
    const { data } = await axios.get('https://api.bitbucket.org/2.0/user', {
      auth: { username, password: appPassword },
      timeout: 10000,
    });
    return {
      valid: true,
      user: data.display_name || data.username,
      message: `Authenticated as ${data.display_name || data.username}`,
    };
  } catch (err) {
    if (err.response?.status === 401) {
      return { valid: false, error: 'Invalid credentials. Check username and app password.' };
    }
    return { valid: false, error: err.response?.data?.error?.message || 'Connection failed.' };
  }
}

async function validateCircleCI(creds) {
  const { token } = creds;
  if (!token) return { valid: false, error: 'API Token is required.' };

  try {
    const { data } = await axios.get('https://circleci.com/api/v2/me', {
      headers: { 'Circle-Token': token },
      timeout: 10000,
    });
    return {
      valid: true,
      user: data.login || data.name,
      message: `Authenticated as ${data.login || data.name || 'user'}`,
    };
  } catch (err) {
    if (err.response?.status === 401) {
      return { valid: false, error: 'Invalid token. Check your CircleCI API token.' };
    }
    return { valid: false, error: err.response?.data?.message || 'Connection failed.' };
  }
}

module.exports = router;
