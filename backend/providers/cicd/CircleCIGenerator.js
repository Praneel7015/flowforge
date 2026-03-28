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
      test: { executor: 'default', steps: ['echo "Running tests..."'] },
      security_scan: { executor: 'default', steps: ['echo "Running security scan..."'] },
      deploy: { executor: 'default', steps: ['echo "Deploying..."'] },
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
      const scripts = node.data?.config?.script || [`echo "Running ${node.data?.label || node.type}..."`];

      // Build job definition
      const job = {
        docker: [{ image: node.data?.config?.image || 'cimg/node:20.0' }],
        steps: ['checkout'],
      };

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

      // Add requires (dependencies)
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
