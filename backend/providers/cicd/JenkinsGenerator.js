/**
 * Jenkins Pipeline Generator
 * Generates Jenkinsfile from workflow nodes/edges.
 */
const CICDGenerator = require('./CICDGenerator');

// User text (labels, scripts, approvers, cache keys…) is placed inside
// single-quoted Groovy strings. Escape backslashes as well as quotes and line
// breaks in one pass; escaping only quotes lets "\\'" or a newline end the
// string early and inject Jenkinsfile code.
const GROOVY_SPECIAL = /[\\'\r\n]/g;
const GROOVY_ESCAPES = { '\\': '\\\\', "'": "\\'", '\r': '\\r', '\n': '\\n' };
const escapeGroovyChar = (ch) => GROOVY_ESCAPES[ch];
const escapeGroovy = (value) => String(value).replace(GROOVY_SPECIAL, escapeGroovyChar);

// A multi-line command goes into a ''' block so the shell gets it as one script
// (an if/fi or a heredoc keeps working). Line breaks stay literal there; quotes
// and backslashes are still escaped, so the block can't be closed early.
const GROOVY_BLOCK_SPECIAL = /[\\'\r]/g;
const escapeGroovyBlock = (value) => String(value).replace(GROOVY_BLOCK_SPECIAL, escapeGroovyChar);

/** One `sh` step: inline for a one-line command, a ''' block otherwise. */
const shStep = (command, indent) =>
  command.includes('\n')
    ? `${indent}sh '''\\\n${escapeGroovyBlock(command)}\n${indent}'''\n`
    : `${indent}sh '${escapeGroovy(command)}'\n`;

class JenkinsGenerator extends CICDGenerator {
  constructor() {
    super();
  }

  getMetadata() {
    return {
      name: 'jenkins',
      displayName: 'Jenkins Pipeline',
      fileName: 'Jenkinsfile',
    };
  }

  getNodeTypeMap() {
    return {
      trigger_push: { trigger: 'pollSCM' },
      trigger_mr: { trigger: 'pullRequest' },
      build: { stage: 'Build', steps: ['echo "Building..."'] },
      matrix_build: { stage: 'Matrix Build', steps: ['echo "Running matrix build..."'] },
      lint: { stage: 'Lint', steps: ['echo "Running lint checks..."'] },
      test: { stage: 'Test', steps: ['echo "Running tests..."'] },
      integration_test: { stage: 'Integration Test', steps: ['echo "Running integration tests..."'] },
      smoke_test: { stage: 'Smoke Test', steps: ['echo "Running smoke tests..."'] },
      cache_restore: { stage: 'Cache Restore', steps: ['echo "Restoring cache..."'] },
      cache_save: { stage: 'Cache Save', steps: ['echo "Saving cache..."'] },
      security_scan: { stage: 'Security Scan', steps: ['echo "Running security scan..."'] },
      package: { stage: 'Package', steps: ['echo "Packaging build artifacts..."'] },
      release: { stage: 'Release', steps: ['echo "Creating release..."'] },
      approval_gate: { stage: 'Approval Gate', steps: ['echo "Waiting for approval..."'] },
      deploy: { stage: 'Deploy', steps: ['echo "Deploying..."'] },
      canary_deploy: { stage: 'Canary Deploy', steps: ['echo "Deploying canary release..."'] },
      blue_green_deploy: { stage: 'Blue Green Deploy', steps: ['echo "Running blue/green deployment..."'] },
      rollback: { stage: 'Rollback', steps: ['echo "Rolling back deployment..."'] },
      notify: { stage: 'Notify', steps: ['echo "Sending notification..."'] },
      conditional: {},
    };
  }

  generate(nodes, edges) {
    const triggers = this._extractTriggers(nodes);
    const stages = this._topologicalSort(nodes, edges);

    // Generate Jenkinsfile
    let jenkinsfile = 'pipeline {\n';
    jenkinsfile += '    agent any\n\n';

    // Add triggers
    if (triggers.onPush || triggers.onPR) {
      jenkinsfile += '    triggers {\n';
      if (triggers.onPush) {
        jenkinsfile += '        pollSCM(\'H/5 * * * *\')\n';
      }
      jenkinsfile += '    }\n\n';
    }

    // Add environment if needed
    jenkinsfile += '    environment {\n';
    jenkinsfile += '        CI = \'true\'\n';
    jenkinsfile += '    }\n\n';

    // Add stages
    jenkinsfile += '    stages {\n';

    for (const node of stages) {
      const rawLabel = node.data?.label || this._capitalize(node.type);
      const stageName = escapeGroovy(rawLabel);
      // Raw label here: scripts are Groovy-escaped once, when they are written out.
      const scripts = this._normalizeScripts(node.data?.config?.script, this._echoLabel(rawLabel));

      if (node.type === 'matrix_build') {
        const matrix = this._parseMatrix(node.data?.config?.matrix, {
          NODE_VERSION: ['18', '20'],
        });
        const axisBlock = Object.entries(matrix)
          .map(([axisName, axisValues]) => {
            const safeAxisName = String(axisName).replace(GROOVY_SPECIAL, escapeGroovyChar);
            const safeValues = axisValues
              .map((value) => `'${String(value).replace(GROOVY_SPECIAL, escapeGroovyChar)}'`)
              .join(', ');

            return [
              '                    axis {',
              `                        name '${safeAxisName}'`,
              `                        values ${safeValues}`,
              '                    }',
            ].join('\n');
          })
          .join('\n');

        jenkinsfile += `        stage('${stageName}') {\n`;
        jenkinsfile += '            matrix {\n';
        jenkinsfile += '                axes {\n';
        jenkinsfile += `${axisBlock}\n`;
        jenkinsfile += '                }\n';
        jenkinsfile += '                stages {\n';
        jenkinsfile += `                    stage('${stageName} Matrix Run') {\n`;
        jenkinsfile += '                        steps {\n';

        for (const script of scripts) {
          jenkinsfile += shStep(script, '                            ');
        }

        jenkinsfile += '                        }\n';
        jenkinsfile += '                    }\n';
        jenkinsfile += '                }\n';
        jenkinsfile += '            }\n';
        jenkinsfile += '        }\n';
        continue;
      }

      if (node.type === 'approval_gate') {
        const approver = node.data?.config?.approver
          ? String(node.data.config.approver).replace(GROOVY_SPECIAL, escapeGroovyChar)
          : null;

        jenkinsfile += `        stage('${stageName}') {\n`;
        jenkinsfile += '            steps {\n';
        if (approver) {
          jenkinsfile += `                input message: 'Approval required to continue', submitter: '${approver}'\n`;
        } else {
          jenkinsfile += '                input message: \'Manual approval required to continue pipeline\'\n';
        }
        jenkinsfile += '            }\n';
        jenkinsfile += '        }\n';
        continue;
      }

      jenkinsfile += `        stage('${stageName}') {\n`;
      jenkinsfile += '            steps {\n';

      if (node.type === 'cache_restore') {
        const cacheKey = String(node.data?.config?.cacheKey || 'build-cache').replace(GROOVY_SPECIAL, escapeGroovyChar);
        jenkinsfile += '                script {\n';
        jenkinsfile += `                    try { unstash '${cacheKey}' } catch (err) { echo 'No cache found for ${cacheKey}' }\n`;
        jenkinsfile += '                }\n';
      }

      if (node.type === 'cache_save') {
        const cacheKey = String(node.data?.config?.cacheKey || 'build-cache').replace(GROOVY_SPECIAL, escapeGroovyChar);
        const cachePaths = this._parseList(node.data?.config?.cachePaths, ['node_modules/**'])
          .join(', ')
          .replace(GROOVY_SPECIAL, escapeGroovyChar);
        jenkinsfile += `                stash name: '${cacheKey}', includes: '${cachePaths}'\n`;
      }

      if (node.type === 'canary_deploy' && !node.data?.config?.script) {
        const trafficPercent = String(node.data?.config?.trafficPercent || '10').replace(GROOVY_SPECIAL, escapeGroovyChar);
        jenkinsfile += `                echo 'Deploying canary with ${trafficPercent}% traffic'\n`;
      }

      if (node.type === 'blue_green_deploy' && !node.data?.config?.script) {
        const activeColor = String(node.data?.config?.activeColor || 'green')
          .toLowerCase()
          .replace(GROOVY_SPECIAL, escapeGroovyChar);
        jenkinsfile += `                echo 'Switching active stack to ${activeColor}'\n`;
      }

      for (const script of scripts) {
        jenkinsfile += shStep(script, '                ');
      }

      jenkinsfile += '            }\n';
      jenkinsfile += '        }\n';
    }

    jenkinsfile += '    }\n\n';

    // Add post actions
    jenkinsfile += '    post {\n';
    jenkinsfile += '        always {\n';
    jenkinsfile += '            cleanWs()\n';
    jenkinsfile += '        }\n';
    jenkinsfile += '        failure {\n';
    jenkinsfile += '            echo \'Pipeline failed!\'\n';
    jenkinsfile += '        }\n';
    jenkinsfile += '        success {\n';
    jenkinsfile += '            echo \'Pipeline succeeded!\'\n';
    jenkinsfile += '        }\n';
    jenkinsfile += '    }\n';

    jenkinsfile += '}\n';

    return jenkinsfile;
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
  }
}

module.exports = JenkinsGenerator;
