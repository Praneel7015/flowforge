const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const controller = require('../controllers/webhookController');

function validateGitLabSecret(req, res, next) {
  const expected = process.env.GITLAB_WEBHOOK_SECRET;
  if (!expected) return next();

  const gitlabToken = req.headers['x-gitlab-token'];
  const flowforgeToken = req.headers['x-flowforge-webhook-token'];
  if (gitlabToken === expected || flowforgeToken === expected) return next();

  return res.status(401).json({ error: 'Invalid webhook secret' });
}

function validateGitHubSignature(req, res, next) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return next();

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return res.status(401).json({ error: 'Missing GitHub webhook signature' });

  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
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
