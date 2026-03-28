const aiService = require('../services/aiService');
const { buildAIOptions } = require('../utils/aiOptions');

async function convertJenkinsfile(req, res) {
  try {
    const { jenkinsfile, aiProvider, cicdPlatform, aiOptions } = req.body;
    if (!jenkinsfile) return res.status(400).json({ error: 'jenkinsfile content is required' });

    const result = await aiService.convertJenkinsfile(jenkinsfile, {
      aiProvider,
      cicdPlatform,
      aiOptions: buildAIOptions(aiOptions),
    });
    res.json(result);
  } catch (err) {
    console.error('convertJenkinsfile error:', err.message);
    res.status(500).json({ error: 'Failed to convert Jenkinsfile: ' + err.message });
  }
}

module.exports = { convertJenkinsfile };
