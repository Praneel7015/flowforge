/**
 * Config Controller - Provider configuration API
 */
const { getProviderSummary, getAIConfig, getCICDConfig } = require('../config');
const { getAIProvider, isProviderAvailable } = require('../providers/ai');

/**
 * GET /api/config/providers
 * Returns list of all providers and their enabled status.
 */
async function getProviders(req, res) {
  try {
    const summary = getProviderSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/config/providers/:type/:name/status
 * Check if a specific provider is configured and working.
 */
async function getProviderStatus(req, res) {
  const { type, name } = req.params;

  try {
    if (type === 'ai') {
      const config = getAIConfig(name);
      if (!config) {
        return res.json({ configured: false, valid: false, error: 'Provider not found' });
      }

      if (!config.enabled) {
        return res.json({
          configured: false,
          valid: false,
          error: `${name.toUpperCase()} API key not configured`,
        });
      }

      // Try to validate the provider
      const provider = getAIProvider(name);
      const validation = await provider.validateConfig();

      res.json({
        configured: true,
        valid: validation.valid,
        error: validation.error,
        warning: validation.warning,
        metadata: provider.getMetadata(),
      });
    } else if (type === 'cicd') {
      const config = getCICDConfig(name);
      if (!config) {
        return res.json({ configured: false, valid: false, error: 'Platform not found' });
      }

      res.json({
        configured: true,
        valid: true,
        metadata: config,
      });
    } else {
      res.status(400).json({ error: `Unknown provider type: ${type}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getProviders,
  getProviderStatus,
};
