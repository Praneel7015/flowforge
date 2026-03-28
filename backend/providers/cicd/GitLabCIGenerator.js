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
      matrix_build: { stage: 'build', template: { script: ['echo "Running matrix build..."'] } },
      lint: { stage: 'test', template: { script: ['echo "Running lint checks..."'] } },
      test: { stage: 'test', template: { script: ['echo "Running tests..."'] } },
      integration_test: { stage: 'test', template: { script: ['echo "Running integration tests..."'] } },
      smoke_test: { stage: 'test', template: { script: ['echo "Running smoke tests..."'] } },
      cache_restore: { stage: 'build', template: { script: ['echo "Restoring build cache..."'] } },
      cache_save: { stage: 'build', template: { script: ['echo "Saving build cache..."'] } },
      security_scan: { stage: 'test', template: { script: ['echo "Running security scan..."'] } },
      package: { stage: 'build', template: { script: ['echo "Packaging build artifacts..."'] } },
      release: { stage: 'deploy', template: { script: ['echo "Creating release..."'] } },
      approval_gate: { stage: 'deploy', template: { script: ['echo "Waiting for manual approval..."'] } },
      deploy: { stage: 'deploy', template: { script: ['echo "Deploying..."'] } },
      canary_deploy: { stage: 'deploy', template: { script: ['echo "Deploying canary release..."'] } },
      blue_green_deploy: { stage: 'deploy', template: { script: ['echo "Running blue/green deployment..."'] } },
      rollback: { stage: 'deploy', template: { script: ['echo "Rolling back deployment..."'] } },
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
      const defaultScripts =
        mapping.template.script || [`echo "Running ${node.data?.label || node.type}..."`];
      const job = {
        stage,
        script: this._normalizeScripts(node.data?.config?.script, defaultScripts),
      };

      // Add image if configured
      if (node.data?.config?.image) {
        job.image = node.data.config.image;
      }

      if (node.type === 'matrix_build') {
        const matrix = this._parseMatrix(node.data?.config?.matrix, {
          NODE_VERSION: ['18', '20'],
        });
        job.parallel = { matrix: [matrix] };
      }

      if (node.type === 'cache_restore' || node.type === 'cache_save') {
        const cachePaths = this._parseList(node.data?.config?.cachePaths, ['node_modules/']);
        job.cache = {
          key: node.data?.config?.cacheKey || '$CI_COMMIT_REF_SLUG',
          paths: cachePaths,
          policy: node.type === 'cache_restore' ? 'pull' : 'push',
        };
      }

      if (node.type === 'approval_gate') {
        const approver = node.data?.config?.approver;
        const environment = node.data?.config?.environment;
        job.when = 'manual';
        job.allow_failure = false;
        if (environment) {
          job.environment = { name: environment };
        }
        if (!node.data?.config?.script) {
          job.script = this._normalizeScripts(
            undefined,
            approver
              ? `echo "Waiting for approval from ${approver}"`
              : 'echo "Waiting for manual approval"'
          );
        }
      }

      if (node.type === 'canary_deploy') {
        const environment = node.data?.config?.environment || 'production';
        const trafficPercent = String(node.data?.config?.trafficPercent || '10');
        job.environment = { name: `${environment}/canary` };
        job.variables = {
          ...(job.variables || {}),
          TRAFFIC_PERCENT: trafficPercent,
        };
        if (!node.data?.config?.script) {
          job.script = this._normalizeScripts(
            undefined,
            `echo "Deploying canary with ${trafficPercent}% traffic"`
          );
        }
      }

      if (node.type === 'blue_green_deploy') {
        const environment = node.data?.config?.environment || 'production';
        const activeColor = String(node.data?.config?.activeColor || 'green').toLowerCase();
        job.environment = { name: `${environment}/${activeColor}` };
        job.variables = {
          ...(job.variables || {}),
          ACTIVE_COLOR: activeColor,
        };
        if (!node.data?.config?.script) {
          job.script = this._normalizeScripts(
            undefined,
            `echo "Switching active environment to ${activeColor}"`
          );
        }
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

      if (node.type === 'package') {
        const artifactPath = node.data?.config?.artifactPath;
        job.artifacts = {
          ...(job.artifacts || {}),
          paths: artifactPath ? [artifactPath] : ['dist/', 'build/'],
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
