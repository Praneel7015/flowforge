/**
 * CircleCI Generator
 * Generates .circleci/config.yml from workflow nodes/edges.
 */
const yaml = require('js-yaml');
const CICDGenerator = require('./CICDGenerator');

class CircleCIGenerator extends CICDGenerator {
  constructor() {
    super();
  }

  getMetadata() {
    return {
      name: 'circleci',
      displayName: 'CircleCI',
      fileName: '.circleci/config.yml',
    };
  }

  getNodeTypeMap() {
    return {
      trigger_push: { filter: 'branches' },
      trigger_mr: { filter: 'pull_request' },
      build: { executor: 'default', steps: ['echo "Building..."'] },
      matrix_build: { executor: 'default', steps: ['echo "Running matrix build..."'] },
      lint: { executor: 'default', steps: ['echo "Running lint checks..."'] },
      test: { executor: 'default', steps: ['echo "Running tests..."'] },
      integration_test: { executor: 'default', steps: ['echo "Running integration tests..."'] },
      smoke_test: { executor: 'default', steps: ['echo "Running smoke tests..."'] },
      cache_restore: { executor: 'default', steps: ['echo "Restoring cache..."'] },
      cache_save: { executor: 'default', steps: ['echo "Saving cache..."'] },
      security_scan: { executor: 'default', steps: ['echo "Running security scan..."'] },
      package: { executor: 'default', steps: ['echo "Packaging build artifacts..."'] },
      release: { executor: 'default', steps: ['echo "Creating release..."'] },
      approval_gate: { executor: 'default', steps: ['echo "Waiting for approval..."'] },
      deploy: { executor: 'default', steps: ['echo "Deploying..."'] },
      canary_deploy: { executor: 'default', steps: ['echo "Deploying canary release..."'] },
      blue_green_deploy: { executor: 'default', steps: ['echo "Running blue/green deployment..."'] },
      rollback: { executor: 'default', steps: ['echo "Rolling back deployment..."'] },
      notify: { executor: 'default', steps: ['echo "Sending notification..."'] },
      conditional: {},
    };
  }

  generate(nodes, edges) {
    const dependsOn = this._buildDependencies(edges);

    // Build jobs
    const jobs = {};
    const workflowJobs = [];

    for (const node of nodes) {
      if (node.type.startsWith('trigger_') || node.type === 'conditional') {
        continue;
      }

      const jobName = this._getJobName(node);
      const deps = (dependsOn[node.id] || [])
        .map((srcId) => {
          const srcNode = nodes.find((n) => n.id === srcId);
          if (!srcNode || srcNode.type.startsWith('trigger_') || srcNode.type === 'conditional') {
            return null;
          }
          return this._getJobName(srcNode);
        })
        .filter(Boolean);

      if (node.type === 'approval_gate') {
        const workflowJob = {
          [jobName]: {
            type: 'approval',
          },
        };

        if (deps.length > 0) {
          workflowJob[jobName].requires = deps;
        }

        workflowJobs.push(workflowJob);
        continue;
      }

      const scripts = this._normalizeScripts(
        node.data?.config?.script,
        `echo "Running ${node.data?.label || node.type}..."`
      );

      // Build job definition
      const job = {
        docker: [{ image: node.data?.config?.image || 'cimg/node:20.0' }],
        steps: ['checkout'],
      };

      if (node.type === 'matrix_build') {
        const matrix = this._parseMatrix(node.data?.config?.matrix, {
          NODE_VERSION: ['18', '20'],
        });
        const maxDimension = Math.max(...Object.values(matrix).map((vals) => vals.length));
        job.parallelism = Math.max(2, maxDimension);
        job.steps.push({
          run: {
            name: 'Matrix dimensions',
            command: `echo "Matrix: ${Object.entries(matrix)
              .map(([k, vals]) => `${k}=${vals.join('|')}`)
              .join('; ')}"`,
          },
        });
      }

      if (node.type === 'cache_restore') {
        const cacheKey =
          node.data?.config?.cacheKey || 'v1-deps-{{ checksum "package-lock.json" }}';
        job.steps.push({
          restore_cache: {
            keys: [cacheKey],
          },
        });
      }

      if (node.type === 'cache_save') {
        const cacheKey =
          node.data?.config?.cacheKey || 'v1-deps-{{ checksum "package-lock.json" }}';
        const cachePaths = this._parseList(node.data?.config?.cachePaths, ['node_modules']);
        job.steps.push({
          save_cache: {
            key: cacheKey,
            paths: cachePaths,
          },
        });
      }

      if (node.type === 'canary_deploy' && !node.data?.config?.script) {
        const trafficPercent = String(node.data?.config?.trafficPercent || '10');
        job.steps.push({
          run: {
            name: 'Canary rollout',
            command: `echo "Deploying canary with ${trafficPercent}% traffic"`,
          },
        });
      }

      if (node.type === 'blue_green_deploy' && !node.data?.config?.script) {
        const activeColor = String(node.data?.config?.activeColor || 'green').toLowerCase();
        job.steps.push({
          run: {
            name: 'Blue/Green switch',
            command: `echo "Switching active stack to ${activeColor}"`,
          },
        });
      }

      // Add run steps
      for (const script of scripts) {
        job.steps.push({
          run: {
            name: node.data?.label || node.type,
            command: script,
          },
        });
      }

      // Add artifacts for certain job types
      if (node.type === 'build') {
        job.steps.push({
          persist_to_workspace: {
            root: '.',
            paths: ['dist', 'build', 'node_modules'],
          },
        });
      }

      if (node.type === 'test' || node.type === 'deploy') {
        job.steps.unshift({
          attach_workspace: { at: '.' },
        });
      }

      jobs[jobName] = job;

      // Build workflow job reference
      const workflowJob = { [jobName]: {} };

      if (deps.length > 0) {
        workflowJob[jobName].requires = deps;
      }

      workflowJobs.push(workflowJob);
    }

    // Build config
    const config = {
      version: 2.1,
      executors: {
        default: {
          docker: [{ image: 'cimg/node:20.0' }],
        },
      },
      jobs,
      workflows: {
        'build-test-deploy': {
          jobs: workflowJobs,
        },
      },
    };

    return yaml.dump(config, { lineWidth: 120, noRefs: true });
  }
}

module.exports = CircleCIGenerator;
