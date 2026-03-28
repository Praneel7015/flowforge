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

  /**
   * Normalize script config to an array of commands.
   * @param {string|string[]|undefined} input
   * @param {string|string[]} fallback
   * @returns {string[]}
   */
  _normalizeScripts(input, fallback = 'echo "Running job..."') {
    const normalize = (value) => {
      if (Array.isArray(value)) {
        return value
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean);
      }

      if (typeof value === 'string') {
        return value
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }

      return [];
    };

    const normalized = normalize(input);
    if (normalized.length > 0) {
      return normalized;
    }

    const fallbackNormalized = normalize(fallback);
    if (fallbackNormalized.length > 0) {
      return fallbackNormalized;
    }

    return ['echo "Running job..."'];
  }

  /**
   * Normalize comma/newline-separated values into a string list.
   * @param {string|string[]|undefined} input
   * @param {string[]} fallback
   * @returns {string[]}
   */
  _parseList(input, fallback = []) {
    const normalize = (value) => {
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry).trim()).filter(Boolean);
      }

      if (typeof value === 'string') {
        return value
          .split(/[\n,]+/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      }

      return [];
    };

    const parsed = normalize(input);
    if (parsed.length > 0) {
      return parsed;
    }

    return normalize(fallback);
  }

  /**
   * Parse matrix configuration from object or JSON string.
   * @param {object|string|undefined} input
   * @param {object} fallback
   * @returns {object<string, string[]>}
   */
  _parseMatrix(input, fallback = { NODE_VERSION: ['18', '20'] }) {
    const normalizeObject = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }

      const result = {};
      for (const [key, rawValue] of Object.entries(value)) {
        const values = this._parseList(rawValue, []);
        if (!values.length) continue;
        result[String(key).trim()] = values;
      }

      return result;
    };

    let parsedInput = input;
    if (typeof input === 'string') {
      try {
        parsedInput = JSON.parse(input);
      } catch {
        parsedInput = {};
      }
    }

    const normalized = normalizeObject(parsedInput);
    if (Object.keys(normalized).length > 0) {
      return normalized;
    }

    const normalizedFallback = normalizeObject(fallback);
    if (Object.keys(normalizedFallback).length > 0) {
      return normalizedFallback;
    }

    return { NODE_VERSION: ['18', '20'] };
  }
}

module.exports = CICDGenerator;
