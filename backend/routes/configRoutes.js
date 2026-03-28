/**
 * Config Routes - Provider configuration API endpoints
 */
const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// GET /api/config/providers - List all providers
router.get('/providers', configController.getProviders);

// GET /api/config/providers/:type/:name/status - Check provider status
router.get('/providers/:type/:name/status', configController.getProviderStatus);

function validateSelfTest(req, res, next) {
	const { aiOptions } = req.body || {};
	if (aiOptions !== undefined && (typeof aiOptions !== 'object' || Array.isArray(aiOptions))) {
		return res.status(400).json({ error: 'aiOptions must be an object when provided' });
	}
	next();
}

// POST /api/config/providers/ai/:name/self-test - Validate runtime provider options
router.post('/providers/:type/:name/self-test', validateSelfTest, configController.selfTestProvider);

module.exports = router;
