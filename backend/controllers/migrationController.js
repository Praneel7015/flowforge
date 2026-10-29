const aiService = require('../services/aiService');
const { logSafe } = require('../utils/logSafe');
const { sendError } = require('../utils/sendError');
const { buildAIOptions } = require('../utils/aiOptions');

async function convertPipeline(req, res) {
  try {
    const { pipelineConfig, sourcePlatform, targetPlatform, aiProvider, aiOptions } = req.body;

    if (!pipelineConfig) {
      return res.status(400).json({ error: 'pipelineConfig content is required' });
    }

    if (!sourcePlatform || !targetPlatform) {
      return res.status(400).json({ error: 'sourcePlatform and targetPlatform are required' });
    }

    if (sourcePlatform === targetPlatform) {
      return res.status(400).json({
        error: 'sourcePlatform and targetPlatform cannot be the same',
      });
    }

    const result = await aiService.convertPipelineConfig(pipelineConfig, {
      sourcePlatform,
      targetPlatform,
      aiProvider,
      aiOptions: buildAIOptions(aiOptions),
    });

    return res.json(result);
  } catch (err) {
    console.error('convertPipeline error: %s', logSafe(err.message));
    return sendError(res, err, 'Failed to convert pipeline');
  }
}

async function convertJenkinsfile(req, res) {
  try {
    const { jenkinsfile, aiProvider, cicdPlatform, aiOptions } = req.body;
    if (!jenkinsfile) return res.status(400).json({ error: 'jenkinsfile content is required' });

    const targetPlatform = cicdPlatform || 'gitlab';

    const result = await aiService.convertPipelineConfig(jenkinsfile, {
      sourcePlatform: 'jenkins',
      targetPlatform,
      aiProvider,
      aiOptions: buildAIOptions(aiOptions),
    });
    res.json(result);
  } catch (err) {
    console.error('convertJenkinsfile error: %s', logSafe(err.message));
    sendError(res, err, 'Failed to convert Jenkinsfile');
  }
}

module.exports = { convertPipeline, convertJenkinsfile };
