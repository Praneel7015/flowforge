const express = require('express');
const router = express.Router();
const controller = require('../controllers/migrationController');

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

// Convert Jenkinsfile to GitLab CI YAML
router.post('/jenkinsfile', validateJenkinsfile, controller.convertJenkinsfile);

module.exports = router;
