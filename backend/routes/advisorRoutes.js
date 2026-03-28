const express = require('express');
const router = express.Router();
const controller = require('../controllers/advisorController');

function validateHealth(req, res, next) {
	if (typeof req.body?.yaml !== 'string' || !req.body.yaml.trim()) {
		return res.status(400).json({ error: 'yaml must be a non-empty string' });
	}
	next();
}

function validateRemediate(req, res, next) {
	const { yaml, failureAnalysis } = req.body || {};
	if (typeof yaml !== 'string' || !yaml.trim()) {
		return res.status(400).json({ error: 'yaml must be a non-empty string' });
	}
	if (!failureAnalysis || typeof failureAnalysis !== 'object' || Array.isArray(failureAnalysis)) {
		return res.status(400).json({ error: 'failureAnalysis must be an object' });
	}
	next();
}

function validateChat(req, res, next) {
	const { messages } = req.body || {};
	if (!Array.isArray(messages) || messages.length === 0) {
		return res.status(400).json({ error: 'messages must be a non-empty array' });
	}

	const isValid = messages.every(
		(m) =>
			m &&
			typeof m === 'object' &&
			(m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
			typeof m.content === 'string' &&
			m.content.trim().length > 0
	);

	if (!isValid) {
		return res.status(400).json({
			error: 'each message must include role (user|assistant|system) and non-empty content',
		});
	}
	next();
}

// Score pipeline health: POST { yaml }
router.post('/health', validateHealth, controller.healthScore);

// Auto-remediate failures: POST { yaml, failureAnalysis }
router.post('/remediate', validateRemediate, controller.remediate);

// Conversational chat: POST { messages, currentYaml }
router.post('/chat', validateChat, controller.chat);

module.exports = router;
