/**
 * Abstract base class for CI/CD configuration generators.
 * Converts workflow nodes/edges to platform-specific YAML/config.
 */
class CICDGenerator {
  constructor() {
    if (new.target === CICDGenerator) {
      throw new Error('CICDGenerator is abstract and cannot be instantiated directly');
    }
  }

  /**
   * Get generator metadata.
   * @returns {{ name: string, displayName: string, fileName: string }}
   */
  getMetadata() {
    throw new Error('getMetadata() must be implemented');
  }

  /**
   * Get node type mappings for this CI/CD platform.
   * @returns {object} - Mapping of generic node types to platform-specific concepts
   */
  getNodeTypeMap() {
    throw new Error('getNodeTypeMap() must be implemented');
  }

  /**
   * Convert workflow graph to CI/CD configuration.
   * @param {Array<{ id: string, type: string, data: object, position: object }>} nodes
   * @param {Array<{ id: string, source: string, target: string }>} edges
   * @returns {string} - YAML or config content
   */
  generate(nodes, edges) {
    throw new Error('generate() must be implemented');
  }

  /**
   * Validate generated configuration syntax.
   * @param {string} config
   * @returns {{ valid: boolean, errors?: string[] }}
   */
  validate(config) {
    // Default: no validation
    return { valid: true };
  }

  /**
   * Helper to build adjacency list from edges.
   * @param {Array} edges
   * @returns {object} - Map of node ID to array of source node IDs
   */
  _buildDependencies(edges) {
    const dependsOn = {};
    for (const edge of edges) {
      if (!dependsOn[edge.target]) dependsOn[edge.target] = [];
      dependsOn[edge.target].push(edge.source);
    }
    return dependsOn;
  }

  /**
   * Helper to extract trigger rules from nodes.
   * @param {Array} nodes
   * @returns {{ onPush: boolean, onPR: boolean }}
   */
  _extractTriggers(nodes) {
    const triggers = { onPush: false, onPR: false };
    for (const node of nodes) {
      if (node.type === 'trigger_push') triggers.onPush = true;
      if (node.type === 'trigger_mr') triggers.onPR = true;
    }
    return triggers;
  }

  /**
   * Helper to get a job name from node data.
   * @param {object} node
   * @returns {string}
   */
  _getJobName(node) {
    return (
      node.data?.label?.toLowerCase().replace(/\s+/g, '_') || `job_${node.id}`
    );
  }
}

module.exports = CICDGenerator;
