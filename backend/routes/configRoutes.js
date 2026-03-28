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

module.exports = router;
