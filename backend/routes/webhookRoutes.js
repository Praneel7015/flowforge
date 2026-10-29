const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const controller = require('../controllers/webhookController');

const IS_PROD = process.env.NODE_ENV === 'production';

// Constant-time string compare; length is checked first because
// timingSafeEqual throws on unequal lengths.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

// Without a configured secret, anyone could post fake pipeline events, so fail
// closed in production and only skip verification in local dev.
function missingSecret(res, name) {
  if (!IS_PROD) return false;
  console.error(`[webhooks] ${name} is not set; rejecting webhook`);
  res.status(503).json({ error: 'Webhook verification is not configured' });
  return true;
}

function validateGitLabSecret(req, res, next) {
  const expected = process.env.GITLAB_WEBHOOK_SECRET;
  if (!expected) {
    if (missingSecret(res, 'GITLAB_WEBHOOK_SECRET')) return;
    return next();
  }

  const gitlabToken = req.headers['x-gitlab-token'];
  const flowforgeToken = req.headers['x-flowforge-webhook-token'];
  if (safeEqual(gitlabToken, expected) || safeEqual(flowforgeToken, expected)) return next();

  return res.status(401).json({ error: 'Invalid webhook secret' });
}

function validateGitHubSignature(req, res, next) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    if (missingSecret(res, 'GITHUB_WEBHOOK_SECRET')) return;
    return next();
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature || typeof signature !== 'string') {
    return res.status(401).json({ error: 'Missing GitHub webhook signature' });
  }

  // GitHub signs the raw request bytes (captured in server.js); re-serialising
  // req.body can reorder keys or change whitespace and break the HMAC.
  const body = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (!safeEqual(signature, expected)) {
    return res.status(401).json({ error: 'Invalid GitHub webhook signature' });
  }

  next();
}

function routeWebhookValidation(req, res, next) {
  const isGitHub = Boolean(req.headers['x-github-event']);
  if (isGitHub) return validateGitHubSignature(req, res, next);
  return validateGitLabSecret(req, res, next);
}

router.post('/', routeWebhookValidation, controller.handleWebhook);

module.exports = router;
