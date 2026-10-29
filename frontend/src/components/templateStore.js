// Template storage and built-ins live outside NodeTemplates.jsx so that file
// only exports components (keeps React Fast Refresh working).

const TEMPLATES_KEY = 'flowforge.templates.v1';
export const TEMPLATES_CHANGED_EVENT = 'flowforge:templates-changed';

export const BUILT_IN_TEMPLATES = [
  {
    id: 'basic-ci',
    name: 'Node.js Production CI/CD',
    description: 'Push trigger, cache, build, parallel lint & test, deploy',
    builtIn: true,
    nodes: [
      { id: 'node_1', type: 'trigger_push', position: { x: 260, y: 40 }, data: { label: 'Git Push Trigger', config: { branch: 'main' } } },
      { id: 'node_2', type: 'cache_restore', position: { x: 260, y: 150 }, data: { label: 'Restore npm Cache', config: { image: 'node:20-alpine', stage: 'build', cacheKey: 'deps-$CI_COMMIT_REF_SLUG', cachePaths: 'node_modules/', script: 'echo "Restoring npm cache..."' } } },
      { id: 'node_3', type: 'build', position: { x: 260, y: 270 }, data: { label: 'Build Application', config: { image: 'node:20-alpine', stage: 'build', script: 'npm ci\nnpm run build' } } },
      { id: 'node_4', type: 'lint', position: { x: 60, y: 410 }, data: { label: 'ESLint & Typecheck', config: { image: 'node:20-alpine', stage: 'test', script: 'npm run lint' } } },
      { id: 'node_5', type: 'test', position: { x: 260, y: 410 }, data: { label: 'Unit Tests', config: { image: 'node:20-alpine', stage: 'test', script: 'npm test -- --ci' } } },
      { id: 'node_6', type: 'security_scan', position: { x: 460, y: 410 }, data: { label: 'Dependency Audit', config: { image: 'node:20-alpine', stage: 'test', script: 'npm audit --audit-level=high' } } },
      { id: 'node_7', type: 'deploy', position: { x: 260, y: 560 }, data: { label: 'Deploy to Production', config: { image: 'node:20-alpine', stage: 'deploy', environment: 'production', script: 'echo "Deploying release to production..."' } } },
    ],
    edges: [
      { id: 'tpl_e1', source: 'node_1', target: 'node_2', animated: true },
      { id: 'tpl_e2', source: 'node_2', target: 'node_3', animated: true },
      { id: 'tpl_e3', source: 'node_3', target: 'node_4', animated: true },
      { id: 'tpl_e4', source: 'node_3', target: 'node_5', animated: true },
      { id: 'tpl_e5', source: 'node_3', target: 'node_6', animated: true },
      { id: 'tpl_e6', source: 'node_4', target: 'node_7', animated: true },
      { id: 'tpl_e7', source: 'node_5', target: 'node_7', animated: true },
      { id: 'tpl_e8', source: 'node_6', target: 'node_7', animated: true },
    ],
  },
  {
    id: 'standard-test-suite',
    name: 'Python FastAPI + Docker',
    description: 'Pytest suite, Ruff lint, Trivy scan, and container release',
    builtIn: true,
    nodes: [
      { id: 'node_1', type: 'trigger_push', position: { x: 260, y: 40 }, data: { label: 'Push to Main', config: { branch: 'main' } } },
      { id: 'node_2', type: 'lint', position: { x: 100, y: 170 }, data: { label: 'Ruff & Black Check', config: { image: 'python:3.12-slim', stage: 'test', script: 'pip install ruff\nruff check .' } } },
      { id: 'node_3', type: 'test', position: { x: 400, y: 170 }, data: { label: 'Pytest Suite', config: { image: 'python:3.12-slim', stage: 'test', script: 'pip install -r requirements.txt\npytest -q' } } },
      { id: 'node_4', type: 'package', position: { x: 260, y: 310 }, data: { label: 'Build Docker Image', config: { image: 'docker:26-cli', stage: 'build', artifactPath: 'dist/', script: 'docker build -t api:$CI_COMMIT_SHORT_SHA .' } } },
      { id: 'node_5', type: 'deploy', position: { x: 260, y: 450 }, data: { label: 'Deploy Service', config: { image: 'alpine:3.20', stage: 'deploy', environment: 'production', script: 'echo "Rolling out container image..."' } } },
    ],
    edges: [
      { id: 'tpl_e1', source: 'node_1', target: 'node_2', animated: true },
      { id: 'tpl_e2', source: 'node_1', target: 'node_3', animated: true },
      { id: 'tpl_e3', source: 'node_2', target: 'node_4', animated: true },
      { id: 'tpl_e4', source: 'node_3', target: 'node_4', animated: true },
      { id: 'tpl_e5', source: 'node_4', target: 'node_5', animated: true },
    ],
  },
  {
    id: 'deploy-pipeline',
    name: 'Zero-Downtime Progressive Rollout',
    description: 'Approval gate, 10% canary, blue/green switch, rollback & Slack notify',
    builtIn: true,
    nodes: [
      { id: 'node_1', type: 'trigger_push', position: { x: 260, y: 40 }, data: { label: 'Release Branch Trigger', config: { branch: 'main' } } },
      { id: 'node_2', type: 'approval_gate', position: { x: 260, y: 160 }, data: { label: 'Production Approval', config: { stage: 'deploy', environment: 'production', approver: 'platform-leads', script: 'echo "Approved for rollout"' } } },
      { id: 'node_3', type: 'canary_deploy', position: { x: 260, y: 290 }, data: { label: 'Canary 10% Rollout', config: { image: 'node:20-alpine', stage: 'deploy', environment: 'production', trafficPercent: '10', script: './scripts/canary.sh --weight=10' } } },
      { id: 'node_4', type: 'blue_green_deploy', position: { x: 260, y: 420 }, data: { label: 'Blue/Green Cutover', config: { image: 'node:20-alpine', stage: 'deploy', environment: 'production', activeColor: 'green', script: './scripts/switch-traffic.sh green' } } },
      { id: 'node_5', type: 'notify', position: { x: 260, y: 550 }, data: { label: 'Notify #releases', config: { stage: '.post', channel: '#releases', script: 'echo "Production cutover complete!"' } } },
    ],
    edges: [
      { id: 'tpl_e1', source: 'node_1', target: 'node_2', animated: true },
      { id: 'tpl_e2', source: 'node_2', target: 'node_3', animated: true },
      { id: 'tpl_e3', source: 'node_3', target: 'node_4', animated: true },
      { id: 'tpl_e4', source: 'node_4', target: 'node_5', animated: true },
    ],
  },
];

export function readSavedTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function writeSavedTemplates(templates) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch { /* ignore */ }
}

function notifyTemplatesChanged() {
  window.dispatchEvent(new CustomEvent(TEMPLATES_CHANGED_EVENT));
}

export function saveCurrentAsTemplate(name, description, nodes, edges) {
  const saved = readSavedTemplates();
  const template = {
    id: `custom_${Date.now()}`,
    name,
    description,
    builtIn: false,
    nodes: nodes.map((n, i) => ({
      ...n,
      id: `node_${i + 1}`,
      position: { x: n.position.x, y: n.position.y },
    })),
    edges: edges.map((e, i) => {
      const sourceIdx = nodes.findIndex((n) => n.id === e.source);
      const targetIdx = nodes.findIndex((n) => n.id === e.target);
      return {
        id: `tpl_e${i + 1}`,
        source: sourceIdx >= 0 ? `node_${sourceIdx + 1}` : e.source,
        target: targetIdx >= 0 ? `node_${targetIdx + 1}` : e.target,
        animated: true,
      };
    }),
  };
  saved.push(template);
  writeSavedTemplates(saved);
  notifyTemplatesChanged();
  return template;
}
