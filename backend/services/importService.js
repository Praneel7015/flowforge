/**
 * Import service — parse an existing CI/CD config (YAML or Jenkinsfile) into
 * FlowForge workflow nodes/edges for visualization. This is the structural,
 * deterministic reverse of workflowService (no AI): it reads jobs/stages and
 * their dependencies so a user can drop in a pipeline they already have and see
 * it on the canvas.
 */
const yaml = require('js-yaml');
const { toScriptConfig } = require('../utils/scriptCommands');

const SUPPORTED_NODE_TYPES = [
  'trigger_push', 'trigger_mr', 'build', 'matrix_build', 'lint', 'test',
  'integration_test', 'smoke_test', 'cache_restore', 'cache_save',
  'security_scan', 'package', 'release', 'approval_gate', 'deploy',
  'canary_deploy', 'blue_green_deploy', 'rollback', 'notify', 'conditional',
];

const MAX_NODES = 60;

function humanize(value) {
  return String(value || 'job')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function classifyType(value) {
  const text = String(value || '').toLowerCase().replace(/[_-]+/g, ' ');
  const rules = [
    { type: 'matrix_build', includes: ['matrix'] },
    { type: 'cache_restore', includes: ['cache restore', 'restore cache'] },
    { type: 'cache_save', includes: ['cache save', 'save cache'] },
    { type: 'approval_gate', includes: ['approval', 'manual gate', 'manual approve'] },
    { type: 'canary_deploy', includes: ['canary'] },
    { type: 'blue_green_deploy', includes: ['blue green', 'blue/green', 'blue-green'] },
    { type: 'rollback', includes: ['rollback', 'roll back'] },
    { type: 'release', includes: ['release', 'publish'] },
    { type: 'package', includes: ['package', 'artifact', 'bundle', 'docker build', 'image'] },
    { type: 'security_scan', includes: ['security', 'sast', 'scan', 'vulnerability', 'snyk', 'trivy'] },
    { type: 'integration_test', includes: ['integration'] },
    { type: 'smoke_test', includes: ['smoke'] },
    { type: 'lint', includes: ['lint', 'static analysis', 'flake8', 'eslint', 'format'] },
    { type: 'test', includes: ['test', 'pytest', 'jest', 'coverage'] },
    { type: 'deploy', includes: ['deploy', 'ship', 'release to', 'rollout'] },
    { type: 'notify', includes: ['notify', 'notification', 'slack', 'teams', 'email'] },
    { type: 'build', includes: ['build', 'compile', 'install'] },
  ];
  for (const rule of rules) {
    if (rule.includes.some((k) => text.includes(k))) return rule.type;
  }
  return 'build';
}

// Each entry stays one command, so a multi-line block isn't split into lines.
function joinScript(value) {
  if (Array.isArray(value)) return toScriptConfig(value.filter((v) => typeof v === 'string'));
  if (typeof value === 'string') return toScriptConfig([value]);
  return '';
}

function firstString(value) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

function normalizeNeeds(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') return entry.job || entry.name || null;
      return null;
    })
    .filter(Boolean);
}

// ─── Platform parsers → { nodes: [{key,label,type,config}], edges: [[from,to]] } ─

function parseGitHub(doc) {
  const jobs = doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};
  const nodes = [];
  const edges = [];

  for (const [jobId, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    const label = typeof job.name === 'string' && job.name.trim() ? job.name.trim() : humanize(jobId);
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const script = steps
      .map((s) => (s && typeof s.run === 'string' ? s.run : ''))
      .filter(Boolean)
      .join('\n');
    nodes.push({
      key: jobId,
      label,
      type: classifyType(`${jobId} ${label}`),
      config: {
        image: job.container?.image || firstString(job['runs-on']),
        script,
      },
    });
    for (const dep of normalizeNeeds(job.needs)) edges.push([dep, jobId]);
  }

  // Trigger node from `on:` connected to jobs with no dependencies.
  const triggers = doc.on || doc.true; // js-yaml may parse `on:` as boolean true
  if (triggers && nodes.length) {
    const keys = new Set(Object.keys(jobs));
    const hasPush = typeof triggers === 'string'
      ? /push/.test(triggers)
      : Array.isArray(triggers)
        ? triggers.includes('push')
        : Boolean(triggers.push);
    const triggerType = hasPush ? 'trigger_push' : 'trigger_mr';
    const roots = nodes.filter((n) => !edges.some(([, to]) => to === n.key));
    nodes.unshift({ key: '__trigger__', label: hasPush ? 'Push Trigger' : 'PR Trigger', type: triggerType, config: {} });
    for (const root of roots) if (keys.has(root.key)) edges.push(['__trigger__', root.key]);
  }

  return { nodes, edges };
}

const GITLAB_RESERVED = new Set([
  'stages', 'variables', 'workflow', 'default', 'include', 'image', 'services',
  'before_script', 'after_script', 'cache', 'pages', 'sast', 'secrets',
]);

function parseGitLab(doc) {
  const nodes = [];
  const edges = [];
  const stageOrder = Array.isArray(doc.stages) ? doc.stages : [];
  const stageBuckets = new Map();

  for (const [key, job] of Object.entries(doc)) {
    if (GITLAB_RESERVED.has(key) || key.startsWith('.')) continue;
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;

    nodes.push({
      key,
      label: humanize(key),
      type: classifyType(`${key} ${job.stage || ''}`),
      config: {
        image: firstString(job.image?.name || job.image),
        script: joinScript(job.script),
        stage: typeof job.stage === 'string' ? job.stage : undefined,
      },
    });

    const stage = typeof job.stage === 'string' ? job.stage : '__nostage__';
    if (!stageBuckets.has(stage)) stageBuckets.set(stage, []);
    stageBuckets.get(stage).push(key);

    for (const dep of normalizeNeeds(job.needs)) edges.push([dep, key]);
  }

  // If no explicit needs, wire stages sequentially (each stage feeds the next).
  if (edges.length === 0 && stageOrder.length > 1) {
    for (let i = 0; i < stageOrder.length - 1; i += 1) {
      const from = stageBuckets.get(stageOrder[i]) || [];
      const to = stageBuckets.get(stageOrder[i + 1]) || [];
      for (const f of from) for (const t of to) edges.push([f, t]);
    }
  }

  return { nodes, edges };
}

function parseCircleCI(doc) {
  const jobs = doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};
  const nodes = [];
  const edges = [];

  for (const [jobId, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const script = steps
      .map((s) => (s && typeof s === 'object' && s.run ? (typeof s.run === 'string' ? s.run : s.run.command) : ''))
      .filter(Boolean)
      .join('\n');
    nodes.push({
      key: jobId,
      label: humanize(jobId),
      type: classifyType(jobId),
      config: { image: firstString(job.docker?.[0]?.image), script },
    });
  }

  const workflows = doc.workflows && typeof doc.workflows === 'object' ? doc.workflows : {};
  for (const wf of Object.values(workflows)) {
    if (!wf || typeof wf !== 'object' || !Array.isArray(wf.jobs)) continue;
    for (const entry of wf.jobs) {
      if (typeof entry === 'string') continue;
      if (entry && typeof entry === 'object') {
        const [jobName, cfg] = Object.entries(entry)[0] || [];
        if (!jobName) continue;
        for (const dep of normalizeNeeds(cfg?.requires)) edges.push([dep, jobName]);
      }
    }
  }

  return { nodes, edges };
}

function parseJenkins(text) {
  const nodes = [];
  const edges = [];
  const stageRegex = /stage\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match = stageRegex.exec(text);
  let previous = null;
  while (match) {
    const name = match[1];
    const key = `stage_${nodes.length + 1}`;
    nodes.push({ key, label: name, type: classifyType(name), config: {} });
    if (previous) edges.push([previous, key]);
    previous = key;
    match = stageRegex.exec(text);
  }
  return { nodes, edges };
}

// Jenkinsfiles are Groovy, not YAML; identify them by structural signature so a
// coincidental partial YAML parse never routes them to a YAML parser.
function looksLikeJenkins(text) {
  return (
    /stage\s*\(\s*['"]/.test(text) &&
    /pipeline\s*\{|node\s*\{|steps\s*\{|sh\s+['"]/.test(text)
  );
}

function detectPlatform(text, doc) {
  if (looksLikeJenkins(text)) return 'jenkins';
  if (doc && typeof doc === 'object') {
    if (doc.jobs && (doc.on || doc.true) && !doc.workflows) return 'github';
    if (doc.workflows && doc.jobs) return 'circleci';
    if (doc.stages || Object.values(doc).some((v) => v && typeof v === 'object' && (v.script || v.stage))) {
      return 'gitlab';
    }
    if (doc.jobs) return 'github';
  }
  return 'gitlab';
}

// ─── Layout: layered top-down placement based on dependency depth ────────────

function layoutNodes(rawNodes, rawEdges) {
  const idByKey = new Map();
  rawNodes.forEach((n, i) => idByKey.set(n.key, `node_${i + 1}`));

  const edges = rawEdges
    .filter(([from, to]) => idByKey.has(from) && idByKey.has(to) && from !== to)
    .map(([from, to], i) => ({
      id: `e_${idByKey.get(from)}_${idByKey.get(to)}_${i}`,
      source: idByKey.get(from),
      target: idByKey.get(to),
      animated: true,
    }));

  // Compute depth (longest path from a root) for a tidy layered layout.
  const incoming = new Map(rawNodes.map((n) => [n.key, []]));
  for (const [from, to] of rawEdges) {
    if (incoming.has(to) && idByKey.has(from)) incoming.get(to).push(from);
  }
  const depthCache = new Map();
  const depthOf = (key, seen = new Set()) => {
    if (depthCache.has(key)) return depthCache.get(key);
    if (seen.has(key)) return 0; // cycle guard
    seen.add(key);
    const parents = incoming.get(key) || [];
    const d = parents.length ? Math.max(...parents.map((p) => depthOf(p, seen) + 1)) : 0;
    depthCache.set(key, d);
    return d;
  };

  const perLayer = new Map();
  const nodes = rawNodes.map((n) => {
    const depth = depthOf(n.key);
    const indexInLayer = perLayer.get(depth) || 0;
    perLayer.set(depth, indexInLayer + 1);
    return {
      id: idByKey.get(n.key),
      type: SUPPORTED_NODE_TYPES.includes(n.type) ? n.type : 'build',
      position: { x: 160 + indexInLayer * 300, y: 80 + depth * 150 },
      data: {
        label: n.label || humanize(n.key),
        config: Object.fromEntries(
          Object.entries(n.config || {}).filter(([, v]) => v !== undefined && v !== '')
        ),
      },
    };
  });

  return { nodes, edges };
}

/**
 * @param {string} content - raw YAML or Jenkinsfile
 * @param {string} [platformHint] - gitlab|github|jenkins|circleci|auto
 * @returns {{ yaml: string, nodes: array, edges: array, detectedPlatform: string }}
 */
function importPipeline(content, platformHint = 'auto') {
  const text = typeof content === 'string' ? content : '';

  let doc = null;
  try {
    doc = yaml.load(text);
  } catch {
    doc = null;
  }

  // A Jenkinsfile signature always wins — it can never be valid YAML for another
  // platform, even if a hint says otherwise or js-yaml half-parses it.
  const platform = looksLikeJenkins(text)
    ? 'jenkins'
    : platformHint && platformHint !== 'auto'
      ? platformHint
      : detectPlatform(text, doc);

  let parsed;
  if (platform === 'jenkins') {
    parsed = parseJenkins(text);
  } else if (!doc || typeof doc !== 'object') {
    parsed = { nodes: [], edges: [] };
  } else if (platform === 'github') {
    parsed = parseGitHub(doc);
  } else if (platform === 'circleci') {
    parsed = parseCircleCI(doc);
  } else {
    parsed = parseGitLab(doc);
  }

  // Generic fallback: treat top-level object keys as jobs.
  if (parsed.nodes.length === 0 && doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const keys = Object.keys(doc).filter(
      (k) => doc[k] && typeof doc[k] === 'object' && !GITLAB_RESERVED.has(k) && !k.startsWith('.')
    );
    parsed = {
      nodes: keys.map((k) => ({ key: k, label: humanize(k), type: classifyType(k), config: {} })),
      edges: [],
    };
  }

  if (parsed.nodes.length === 0) {
    const error = new Error('Could not find any jobs or stages in the provided pipeline.');
    error.status = 422;
    throw error;
  }

  if (parsed.nodes.length > MAX_NODES) {
    parsed.nodes = parsed.nodes.slice(0, MAX_NODES);
    const kept = new Set(parsed.nodes.map((n) => n.key));
    parsed.edges = parsed.edges.filter(([f, t]) => kept.has(f) && kept.has(t));
  }

  const { nodes, edges } = layoutNodes(parsed.nodes, parsed.edges);
  return { yaml: text, nodes, edges, detectedPlatform: platform };
}

module.exports = { importPipeline };
