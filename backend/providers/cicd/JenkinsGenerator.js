/**
 * Jenkins Pipeline Generator
 * Generates Jenkinsfile from workflow nodes/edges.
 */
const CICDGenerator = require('./CICDGenerator');

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
      test: { stage: 'Test', steps: ['echo "Running tests..."'] },
      security_scan: { stage: 'Security Scan', steps: ['echo "Running security scan..."'] },
      deploy: { stage: 'Deploy', steps: ['echo "Deploying..."'] },
      notify: { stage: 'Notify', steps: ['echo "Sending notification..."'] },
      conditional: {},
    };
  }

  generate(nodes, edges) {
    const dependsOn = this._buildDependencies(edges);
    const triggers = this._extractTriggers(nodes);

    // Collect stages in order (based on dependencies)
    const stages = [];
    const processed = new Set();

    // Get job nodes (non-trigger, non-conditional)
    const jobNodes = nodes.filter(
      (n) => !n.type.startsWith('trigger_') && n.type !== 'conditional'
    );

    // Simple topological sort based on dependencies
    const addNode = (node) => {
      if (processed.has(node.id)) return;

      // Process dependencies first
      const deps = dependsOn[node.id] || [];
      for (const depId of deps) {
        const depNode = nodes.find((n) => n.id === depId);
        if (depNode && !depNode.type.startsWith('trigger_') && depNode.type !== 'conditional') {
          addNode(depNode);
        }
      }

      processed.add(node.id);
      stages.push(node);
    };

    for (const node of jobNodes) {
      addNode(node);
    }

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
      const stageName = node.data?.label || this._capitalize(node.type);
      const scripts = node.data?.config?.script || [`echo "Running ${stageName}..."`];

      jenkinsfile += `        stage('${stageName}') {\n`;
      jenkinsfile += '            steps {\n';

      for (const script of scripts) {
        // Escape single quotes in shell commands
        const escapedScript = script.replace(/'/g, "\\'");
        jenkinsfile += `                sh '${escapedScript}'\n`;
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
