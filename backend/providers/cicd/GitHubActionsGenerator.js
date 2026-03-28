/**
 * GitHub Actions Generator
 * Generates .github/workflows/ci.yml from workflow nodes/edges.
 */
const yaml = require('js-yaml');
const CICDGenerator = require('./CICDGenerator');

class GitHubActionsGenerator extends CICDGenerator {
  constructor() {
    super();
  }

  getMetadata() {
    return {
      name: 'github',
      displayName: 'GitHub Actions',
      fileName: '.github/workflows/ci.yml',
    };
  }

  getNodeTypeMap() {
    return {
      trigger_push: { event: 'push' },
      trigger_mr: { event: 'pull_request' },
      build: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Building..."' }] },
      test: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running tests..."' }] },
      security_scan: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running security scan..."' }] },
      deploy: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Deploying..."' }] },
      notify: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Sending notification..."' }] },
      conditional: {},
    };
  }

  generate(nodes, edges) {
    const dependsOn = this._buildDependencies(edges);
    const triggers = this._extractTriggers(nodes);

    // Build 'on' section
    const on = {};
    if (triggers.onPush) on.push = { branches: ['main', 'master'] };
    if (triggers.onPR) on.pull_request = { branches: ['main', 'master'] };
    if (Object.keys(on).length === 0) {
      on.push = { branches: ['main'] };
    }

    // Build jobs
    const jobs = {};

    for (const node of nodes) {
      if (node.type.startsWith('trigger_') || node.type === 'conditional') {
        continue;
      }

      const jobName = this._getJobName(node);
      const job = {
        'runs-on': node.data?.config?.runsOn || 'ubuntu-latest',
        steps: [],
      };

      // Add checkout step
      job.steps.push({
        uses: 'actions/checkout@v4',
      });

      // Add setup steps based on node type
      if (node.type === 'build' || node.type === 'test') {
        job.steps.push({
          uses: 'actions/setup-node@v4',
          with: { 'node-version': '20' },
        });
      }

      // Add main step
      const scripts = node.data?.config?.script || [`echo "Running ${node.data?.label || node.type}..."`];
      for (const script of scripts) {
        job.steps.push({
          name: node.data?.label || node.type,
          run: script,
        });
      }

      // Add dependencies (needs)
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

      // Add environment for deploy
      if (node.type === 'deploy' && node.data?.config?.environment) {
        job.environment = node.data.config.environment;
      }

      jobs[jobName] = job;
    }

    const workflow = {
      name: 'CI/CD Pipeline',
      on,
      jobs,
    };

    return yaml.dump(workflow, { lineWidth: 120, noRefs: true, quotingType: '"' });
  }
}

module.exports = GitHubActionsGenerator;
