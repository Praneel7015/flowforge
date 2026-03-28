const express = require('express');
const router = express.Router();
const controller = require('../controllers/pipelineController');

function badRequest(res, message) {
	return res.status(400).json({ error: message });
}

function validateGenerate(req, res, next) {
	if (typeof req.body?.prompt !== 'string' || !req.body.prompt.trim()) {
		return badRequest(res, 'prompt must be a non-empty string');
	}
	next();
}

function validateExport(req, res, next) {
	const { nodes, edges } = req.body || {};
	if (!Array.isArray(nodes) || !Array.isArray(edges)) {
		return badRequest(res, 'nodes and edges must be arrays');
	}
	next();
}

function validateIds(req, res, next) {
	const { projectId, pipelineId } = req.params;
	if (!projectId || !pipelineId) {
		return badRequest(res, 'projectId and pipelineId are required');
	}
	if (!/^\d+$/.test(String(pipelineId))) {
		return badRequest(res, 'pipelineId must be numeric');
	}
	next();
}

function validateTrigger(req, res, next) {
	const { projectId } = req.params;
	const { ref } = req.body || {};
	if (!projectId) return badRequest(res, 'projectId is required');
	if (ref !== undefined && (typeof ref !== 'string' || !ref.trim())) {
		return badRequest(res, 'ref must be a non-empty string when provided');
	}
	next();
}

// AI-powered pipeline generation from natural language
router.post('/generate', validateGenerate, controller.generatePipeline);

// Export workflow nodes/edges to .gitlab-ci.yml
router.post('/export', validateExport, controller.exportYaml);

// Get pipeline status from GitLab
router.get('/:projectId/:pipelineId/status', validateIds, controller.getPipelineStatus);

// Explain a pipeline failure using AI
router.get('/:projectId/:pipelineId/explain', validateIds, controller.explainFailure);

// Trigger a new pipeline
router.post('/:projectId/trigger', validateTrigger, controller.triggerPipeline);

module.exports = router;
