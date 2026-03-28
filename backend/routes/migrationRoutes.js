const express = require('express');
const router = express.Router();
const controller = require('../controllers/migrationController');

const SUPPORTED_PLATFORMS = ['gitlab', 'github', 'jenkins', 'circleci'];

function validateJenkinsfile(req, res, next) {
	const content = req.body?.jenkinsfile;
	if (typeof content !== 'string' || !content.trim()) {
		return res.status(400).json({ error: 'jenkinsfile must be a non-empty string' });
	}
	if (content.length > 250000) {
		return res.status(413).json({ error: 'jenkinsfile payload is too large' });
	}
	next();
}

function validateConvert(req, res, next) {
	const { pipelineConfig, sourcePlatform, targetPlatform } = req.body || {};

	if (typeof pipelineConfig !== 'string' || !pipelineConfig.trim()) {
		return res.status(400).json({ error: 'pipelineConfig must be a non-empty string' });
	}

	if (pipelineConfig.length > 250000) {
		return res.status(413).json({ error: 'pipelineConfig payload is too large' });
	}

	if (!SUPPORTED_PLATFORMS.includes(sourcePlatform)) {
		return res.status(400).json({
			error: `sourcePlatform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
		});
	}

	if (!SUPPORTED_PLATFORMS.includes(targetPlatform)) {
		return res.status(400).json({
			error: `targetPlatform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
		});
	}

	if (sourcePlatform === targetPlatform) {
		return res.status(400).json({
			error: 'sourcePlatform and targetPlatform must be different',
		});
	}

	next();
}

// Generic source -> target CI/CD conversion
router.post('/convert', validateConvert, controller.convertPipeline);

// Legacy Jenkinsfile conversion endpoint
router.post('/jenkinsfile', validateJenkinsfile, controller.convertJenkinsfile);

module.exports = router;
