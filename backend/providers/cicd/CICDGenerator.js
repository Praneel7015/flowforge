/* eslint-disable no-unused-vars -- abstract base class: parameters document the contract subclasses implement */
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
      node.data?.label
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `job_${node.id}`
    );
  }

  /**
   * Build a collision-free map from node.id to a unique job name.
   * E.g. two nodes with label "Unit Tests" -> "unit_tests" and "unit_tests_2".
   * @param {Array} nodes
   * @returns {object<string, string>}
   */
  _buildUniqueJobNameMap(nodes) {
    const map = {};
    const counts = {};
    const used = new Set();

    for (const node of nodes || []) {
      if (!node || !node.id || node.type?.startsWith('trigger_') || node.type === 'conditional') {
        continue;
      }

      const base = this._getJobName(node);
      counts[base] = (counts[base] || 0) + 1;

      let candidate = counts[base] === 1 ? base : `${base}_${counts[base]}`;
      while (used.has(candidate)) {
        counts[base] += 1;
        candidate = `${base}_${counts[base]}`;
      }

      used.add(candidate);
      map[node.id] = candidate;
    }

    return map;
  }

  /**
   * Resolve upstream job dependencies for a node, walking recursively through
   * intermediate `conditional` nodes so stages behind a conditional gate still
   * inherit their upstream dependencies.
   * @param {string} nodeId
   * @param {Array} nodes
   * @param {object} dependsOn
   * @param {object} [jobNameMap]
   * @returns {string[]}
   */
  _resolveJobDependencies(nodeId, nodes, dependsOn, jobNameMap = null) {
    const nodeById = new Map((nodes || []).map((n) => [n.id, n]));
    const resolved = [];
    const seenJobNames = new Set();
    const visitedNodes = new Set();

    const walk = (currentId) => {
      const parentIds = dependsOn[currentId] || [];
      for (const srcId of parentIds) {
        if (visitedNodes.has(srcId)) continue;
        visitedNodes.add(srcId);

        const srcNode = nodeById.get(srcId);
        if (!srcNode || srcNode.type?.startsWith('trigger_')) {
          continue;
        }

        if (srcNode.type === 'conditional') {
          walk(srcId);
          continue;
        }

        const jobName = (jobNameMap && jobNameMap[srcNode.id]) || this._getJobName(srcNode);
        if (jobName && !seenJobNames.has(jobName)) {
          seenJobNames.add(jobName);
          resolved.push(jobName);
        }
      }
    };

    visitedNodes.add(nodeId);
    walk(nodeId);
    return resolved;
  }

  /**
   * Extract `data.config.condition` from any immediate parent `conditional` node
   * (or chained conditional parents).
   * @param {string} nodeId
   * @param {Array} nodes
   * @param {object} dependsOn
   * @returns {string|null}
   */
  _resolveCondition(nodeId, nodes, dependsOn) {
    const nodeById = new Map((nodes || []).map((n) => [n.id, n]));
    const visited = new Set([nodeId]);
    const conditions = [];

    const walk = (currentId) => {
      const parentIds = dependsOn[currentId] || [];
      for (const srcId of parentIds) {
        if (visited.has(srcId)) continue;
        visited.add(srcId);

        const srcNode = nodeById.get(srcId);
        if (!srcNode || srcNode.type !== 'conditional') continue;

        const cond = srcNode.data?.config?.condition;
        if (typeof cond === 'string' && cond.trim()) {
          conditions.push(cond.trim());
        }
        walk(srcId);
      }
    };

    walk(nodeId);
    return conditions.length > 0 ? conditions[0] : null;
  }

  /**
   * Cycle-safe 3-color DFS topological sort of non-trigger, non-conditional job nodes.
   * Traverses through intermediate conditional nodes so ordering respects edges
   * across conditional gates without stack overflow on cycles.
   * @param {Array} nodes
   * @param {Array} edges
   * @returns {Array}
   */
  _topologicalSort(nodes, edges) {
    const dependsOn = this._buildDependencies(edges || []);
    const nodeById = new Map((nodes || []).map((n) => [n.id, n]));
    const jobNodes = (nodes || []).filter(
      (n) => n && !n.type?.startsWith('trigger_') && n.type !== 'conditional'
    );

    const visiting = new Set(); // Gray
    const visited = new Set(); // Black
    const sorted = [];

    const getParentJobNodes = (nodeId, seenCond = new Set()) => {
      const parents = [];
      for (const depId of dependsOn[nodeId] || []) {
        const depNode = nodeById.get(depId);
        if (!depNode || depNode.type?.startsWith('trigger_')) continue;
        if (depNode.type === 'conditional') {
          if (!seenCond.has(depId)) {
            seenCond.add(depId);
            parents.push(...getParentJobNodes(depId, seenCond));
          }
        } else {
          parents.push(depNode);
        }
      }
      return parents;
    };

    const visit = (node) => {
      if (!node || visited.has(node.id)) return;
      if (visiting.has(node.id)) {
        // Cycle detected — break cycle safely
        return;
      }

      visiting.add(node.id);

      const parentNodes = getParentJobNodes(node.id);
      for (const depNode of parentNodes) {
        visit(depNode);
      }

      visiting.delete(node.id);
      visited.add(node.id);
      sorted.push(node);
    };

    for (const node of jobNodes) {
      visit(node);
    }

    return sorted;
  }

  /**
   * Default command for a step without a script: prints the label. The label
   * is user text (and arrives via shared blueprint links), so it is
   * single-quoted for the shell: $(...), backticks and $VAR are printed, not run.
   * @param {string} label
   * @returns {string}
   */
  _echoLabel(label) {
    const text = `Running ${String(label ?? 'job')}...`;
    return `echo '${text.replace(/'/g, "'\\''")}'`;
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
