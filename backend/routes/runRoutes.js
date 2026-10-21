const express = require('express');
const router = express.Router();
const runController = require('../controllers/runController');

// List recent pipeline/workflow runs across GitHub Actions, GitLab CI, Bitbucket Pipelines, CircleCI
router.post('/list', runController.listRuns);

// Fetch normalized run status + per-job status list for React Flow DAG live overlay
router.post('/status', runController.getRunStatus);

// Trigger a new pipeline/workflow run
router.post('/trigger', runController.triggerRun);

// Fetch failed job logs, explain failure with AI, and generate auto-remediated YAML patch
router.post('/diagnose-and-fix', runController.diagnoseAndFix);

module.exports = router;
