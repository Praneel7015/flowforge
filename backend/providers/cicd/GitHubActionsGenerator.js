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
      matrix_build: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running matrix build..."' }] },
      lint: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running lint checks..."' }] },
      test: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running tests..."' }] },
      integration_test: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running integration tests..."' }] },
      smoke_test: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running smoke tests..."' }] },
      cache_restore: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Restoring cache..."' }] },
      cache_save: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Saving cache..."' }] },
      security_scan: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running security scan..."' }] },
      package: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Packaging build artifacts..."' }] },
      release: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Creating release..."' }] },
      approval_gate: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Waiting for approval..."' }] },
      deploy: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Deploying..."' }] },
      canary_deploy: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Deploying canary release..."' }] },
      blue_green_deploy: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Running blue/green deployment..."' }] },
      rollback: { runsOn: 'ubuntu-latest', steps: [{ run: 'echo "Rolling back deployment..."' }] },
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
      if (node.type === 'build' || node.type === 'test' || node.type === 'matrix_build') {
        job.steps.push({
          uses: 'actions/setup-node@v4',
          with: {
            'node-version':
              node.type === 'matrix_build' ? '${{ matrix.NODE_VERSION }}' : '20',
          },
        });
      }

      if (node.type === 'matrix_build') {
        const matrix = this._parseMatrix(node.data?.config?.matrix, {
          NODE_VERSION: ['18', '20'],
        });
        job.strategy = {
          'fail-fast': false,
          matrix,
        };
      }

      if (node.type === 'cache_restore' || node.type === 'cache_save') {
        const cachePaths = this._parseList(node.data?.config?.cachePaths, ['node_modules']);
        const cacheKey =
          node.data?.config?.cacheKey || "${{ runner.os }}-deps-${{ hashFiles('**/package-lock.json') }}";

        job.steps.push({
          name: node.type === 'cache_restore' ? 'Restore cache' : 'Save cache',
          uses:
            node.type === 'cache_restore'
              ? 'actions/cache/restore@v4'
              : 'actions/cache/save@v4',
          with: {
            path: cachePaths.join('\n'),
            key: cacheKey,
          },
        });
      }

      if (node.type === 'approval_gate') {
        const environment = node.data?.config?.environment || 'production';
        const approver = node.data?.config?.approver;
        job.environment = environment;
        if (!node.data?.config?.script) {
          const text = approver
            ? `echo "Approval required from ${approver}. Configure environment reviewers in GitHub."`
            : 'echo "Approval gate enabled. Configure environment reviewers in GitHub."';
          job.steps.push({ name: 'Approval gate', run: text });
        }
      }

      if (node.type === 'canary_deploy') {
        const environment = node.data?.config?.environment || 'production';
        const trafficPercent = String(node.data?.config?.trafficPercent || '10');
        job.environment = `${environment}-canary`;
        if (!node.data?.config?.script) {
          job.steps.push({
            name: 'Canary rollout',
            run: `echo "Deploying canary with ${trafficPercent}% traffic"`,
          });
        }
      }

      if (node.type === 'blue_green_deploy') {
        const environment = node.data?.config?.environment || 'production';
        const activeColor = String(node.data?.config?.activeColor || 'green').toLowerCase();
        job.environment = environment;
        if (!node.data?.config?.script) {
          job.steps.push({
            name: 'Blue/Green switch',
            run: `echo "Switching active stack to ${activeColor}"`,
          });
        }
      }

      // Add main step
      const scripts = this._normalizeScripts(
        node.data?.config?.script,
        `echo "Running ${node.data?.label || node.type}..."`
      );
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
