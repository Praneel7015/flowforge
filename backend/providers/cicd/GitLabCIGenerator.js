/**
 * GitLab CI Generator
 * Generates .gitlab-ci.yml from workflow nodes/edges.
 */
const yaml = require('js-yaml');
const CICDGenerator = require('./CICDGenerator');

class GitLabCIGenerator extends CICDGenerator {
  constructor() {
    super();
  }

  getMetadata() {
    return {
      name: 'gitlab',
      displayName: 'GitLab CI',
      fileName: '.gitlab-ci.yml',
    };
  }

  getNodeTypeMap() {
    return {
      trigger_push: {
        stage: null,
        template: { rules: [{ if: '$CI_PIPELINE_SOURCE == "push"' }] },
      },
      trigger_mr: {
        stage: null,
        template: { rules: [{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }] },
      },
      build: { stage: 'build', template: { script: ['echo "Building..."'] } },
      test: { stage: 'test', template: { script: ['echo "Running tests..."'] } },
      security_scan: { stage: 'test', template: { script: ['echo "Running security scan..."'] } },
      deploy: { stage: 'deploy', template: { script: ['echo "Deploying..."'] } },
      notify: { stage: '.post', template: { script: ['echo "Sending notification..."'] } },
      conditional: { stage: null, template: {} },
    };
  }

  generate(nodes, edges) {
    const nodeTypeMap = this.getNodeTypeMap();
    const stages = new Set();
    const jobs = {};
    const dependsOn = this._buildDependencies(edges);

    // Collect trigger rules
    const triggerRules = [];
    for (const node of nodes) {
      const mapping = nodeTypeMap[node.type];
      if (!mapping) continue;

      if (node.type === 'trigger_push' || node.type === 'trigger_mr') {
        if (mapping.template.rules) {
          triggerRules.push(...mapping.template.rules);
        }
        continue;
      }

      if (node.type === 'conditional') continue;

      const stage = node.data?.config?.stage || mapping.stage || 'build';
      stages.add(stage);

      const jobName = this._getJobName(node);
      const job = {
        stage,
        script: node.data?.config?.script || mapping.template.script,
      };

      // Add image if configured
      if (node.data?.config?.image) {
        job.image = node.data.config.image;
      }

      // Add dependencies
      const deps = (dependsOn[node.id] || [])
        .map((srcId) => {
          const srcNode = nodes.find((n) => n.id === srcId);
          if (!srcNode || srcNode.type.startsWith('trigger_') || srcNode.type === 'conditional') {
            return null;
          }
          return this._getJobName(srcNode);
        })
        .filter(Boolean);

      if (deps.length > 0) {
        job.needs = deps;
      }

      // Apply trigger rules
      if (triggerRules.length > 0) {
        job.rules = triggerRules;
      }

      // Add artifacts for security scan
      if (node.type === 'security_scan') {
        job.artifacts = {
          reports: { dependency_scanning: 'gl-dependency-scanning-report.json' },
        };
      }

      jobs[jobName] = job;
    }

    const pipeline = {
      stages: [...stages],
      ...jobs,
    };

    return yaml.dump(pipeline, { lineWidth: 120, noRefs: true });
  }
}

module.exports = GitLabCIGenerator;
