const yaml = require('js-yaml');
const CICDGenerator = require('./CICDGenerator');

class BitbucketPipelinesGenerator extends CICDGenerator {
  getMetadata() {
    return {
      name: 'bitbucket',
      displayName: 'Bitbucket Pipelines',
      fileName: 'bitbucket-pipelines.yml',
    };
  }

  getNodeTypeMap() {
    return {
      trigger_push: 'trigger',
      trigger_mr: 'trigger',
      build: 'step',
      matrix_build: 'step',
      lint: 'step',
      test: 'step',
      integration_test: 'step',
      smoke_test: 'step',
      cache_restore: 'cache',
      cache_save: 'cache',
      security_scan: 'step',
      package: 'step',
      release: 'step',
      approval_gate: 'step',
      deploy: 'step',
      canary_deploy: 'step',
      blue_green_deploy: 'step',
      rollback: 'step',
      notify: 'step',
      conditional: 'step',
    };
  }

  generate(nodes, edges) {
    const triggers = this._extractTriggers(nodes);
    const jobNameMap = this._buildUniqueJobNameMap(nodes);
    const stageNodes = this._topologicalSort(nodes, edges);

    const steps = stageNodes.map((node) => {
      const name = jobNameMap[node.id] || this._getJobName(node);
      const scripts = this._normalizeScripts(
        node.data?.config?.script,
        this._echoLabel(node.data?.label || name)
      );

      const step = { name, script: scripts };

      if (node.data?.config?.image) {
        step.image = node.data.config.image;
      }

      if (node.type === 'deploy' || node.type === 'canary_deploy' || node.type === 'blue_green_deploy') {
        step.deployment = node.data?.config?.environment || 'production';
      }

      if (node.type === 'approval_gate') {
        step.trigger = 'manual';
      }

      const cacheKeys = [];
      if (node.data?.config?.cacheKey) cacheKeys.push(node.data.config.cacheKey);
      if (node.data?.config?.cachePaths) {
        step.caches = ['node'];
      }

      return { step };
    });

    const config = { image: 'node:20' };

    const pipelines = {};

    if (triggers.onPush) {
      pipelines.default = [{ step: { name: 'default', script: ['echo "Pipeline triggered"'] } }];
      pipelines.branches = {
        main: steps,
      };
    } else {
      pipelines.default = steps;
    }

    if (triggers.onPR) {
      pipelines['pull-requests'] = {
        '**': steps,
      };
    }

    config.pipelines = pipelines;

    return yaml.dump(config, { lineWidth: -1, noRefs: true });
  }
}

module.exports = BitbucketPipelinesGenerator;
