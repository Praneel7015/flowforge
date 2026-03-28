const express = require('express');
const router = express.Router();
const controller = require('../controllers/webhookController');

function validateWebhookSecret(req, res, next) {
	const expected = process.env.GITLAB_WEBHOOK_SECRET;
	if (!expected) return next();

	const gitlabToken = req.headers['x-gitlab-token'];
	const flowforgeToken = req.headers['x-flowforge-webhook-token'];
	if (gitlabToken === expected || flowforgeToken === expected) return next();

	return res.status(401).json({ error: 'Invalid webhook secret' });
}

// GitLab webhook receiver
router.post('/', validateWebhookSecret, controller.handleWebhook);

module.exports = router;
