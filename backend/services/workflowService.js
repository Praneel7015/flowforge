/**
 * Workflow Service - Converts visual workflow to CI/CD configuration
 * Uses the CI/CD generator factory to support multiple platforms.
 */
const { getCICDGenerator, getAvailablePlatforms } = require('../providers/cicd');

// Re-export NODE_TYPE_MAP for backwards compatibility (GitLab default)
const NODE_TYPE_MAP = getCICDGenerator('gitlab').getNodeTypeMap();

/**
 * Convert workflow nodes/edges to CI/CD configuration.
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 * @param {object} options - { cicdPlatform: 'gitlab' | 'github' | 'jenkins' | 'circleci' }
 * @returns {{ content: string, metadata: object }}
 */
function workflowToConfig(nodes, edges, options = {}) {
  const platform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(platform);

  return {
    content: generator.generate(nodes, edges),
    metadata: generator.getMetadata(),
  };
}

/**
 * Convert workflow to YAML (backwards compatible - defaults to GitLab).
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 * @returns {string} - YAML content
 */
function workflowToYaml(nodes, edges) {
  return workflowToConfig(nodes, edges, { cicdPlatform: 'gitlab' }).content;
}

/**
 * Get node type map for a specific platform.
 * @param {string} platform - Platform name
 * @returns {object}
 */
function getNodeTypeMapForPlatform(platform) {
  const generator = getCICDGenerator(platform);
  return generator.getNodeTypeMap();
}

/**
 * Get list of available CI/CD platforms.
 * @returns {string[]}
 */
function getAvailableCICDPlatforms() {
  return getAvailablePlatforms();
}

module.exports = {
  workflowToYaml,
  workflowToConfig,
  getNodeTypeMapForPlatform,
  getAvailableCICDPlatforms,
  NODE_TYPE_MAP, // Backwards compatibility
};
