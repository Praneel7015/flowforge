const aiService = require('../services/aiService');
const workflowService = require('../services/workflowService');
const gitlabService = require('../services/gitlabService');
const { buildAIOptions } = require('../utils/aiOptions');

async function generatePipeline(req, res) {
  try {
    const { prompt, aiProvider, cicdPlatform, aiOptions, repoContext } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const result = await aiService.generatePipelineFromPrompt(prompt, {
      aiProvider,
      cicdPlatform,
      aiOptions: buildAIOptions(aiOptions),
      repoContext: Array.isArray(repoContext) ? repoContext : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('generatePipeline error:', err.message);
    res.status(err.status === 400 ? 400 : 500).json({ error: 'Failed to generate pipeline: ' + err.message });
  }
}

async function exportYaml(req, res) {
  try {
    const { nodes, edges, cicdPlatform } = req.body;
    if (!nodes || !edges) return res.status(400).json({ error: 'nodes and edges are required' });

    const result = workflowService.workflowToConfig(nodes, edges, { cicdPlatform });
    res.json({
      yaml: result.content,
      metadata: result.metadata,
    });
  } catch (err) {
    console.error('exportYaml error:', err.message);
    res.status(500).json({ error: 'Failed to export: ' + err.message });
  }
}

async function importPipeline(req, res) {
  try {
    const { configText, yaml, cicdPlatform } = req.body || {};
    const rawConfig =
      typeof configText === 'string' && configText.trim()
        ? configText
        : typeof yaml === 'string' && yaml.trim()
          ? yaml
          : '';

    if (!rawConfig) {
      return res.status(400).json({ error: 'configText is required' });
    }

    const dag = aiService.parseConfigToDAG(rawConfig, cicdPlatform);
    res.json({
      nodes: dag.nodes,
      edges: dag.edges,
      yaml: rawConfig,
      detectedPlatform: dag.detectedPlatform || cicdPlatform || 'gitlab',
    });
  } catch (err) {
    const status = err.status || 500;
    console.error('importPipeline error:', err.message);
    res.status(status).json({ error: err.message || 'Failed to import pipeline' });
  }
}

async function getPipelineStatus(req, res) {
  try {
    const { projectId, pipelineId } = req.params;
    const status = await gitlabService.getPipelineStatus(projectId, pipelineId);
    res.json(status);
  } catch (err) {
    console.error('getPipelineStatus error:', err.message);
    res.status(500).json({ error: 'Failed to get pipeline status' });
  }
}

async function explainFailure(req, res) {
  try {
    const { projectId, pipelineId } = req.params;
    const { aiProvider } = req.query;
    const aiOptions = buildAIOptions(req.body?.aiOptions);

    const { failedLogs } = await gitlabService.getPipelineLogs(projectId, pipelineId);

    if (failedLogs.length === 0) {
      return res.json({ summary: 'No failed jobs found in this pipeline.' });
    }

    const explanation = await aiService.explainPipelineFailure(failedLogs, { aiProvider, aiOptions });
    res.json(explanation);
  } catch (err) {
    console.error('explainFailure error:', err.message);
    res.status(500).json({ error: 'Failed to explain pipeline failure' });
  }
}

async function triggerPipeline(req, res) {
  try {
    const { projectId } = req.params;
    const { ref } = req.body;
    const result = await gitlabService.triggerPipeline(projectId, ref || 'main');
    res.json(result);
  } catch (err) {
    console.error('triggerPipeline error:', err.message);
    res.status(500).json({ error: 'Failed to trigger pipeline' });
  }
}

module.exports = {
  generatePipeline,
  exportYaml,
  importPipeline,
  getPipelineStatus,
  explainFailure,
  triggerPipeline,
};
