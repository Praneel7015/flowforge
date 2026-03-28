/**
 * AI Service - Platform-agnostic AI operations for CI/CD
 * Uses the AI provider factory to support multiple AI backends.
 */
const { getAIProvider } = require('../providers/ai');
const { getCICDGenerator } = require('../providers/cicd');
const axios = require('axios');
const yaml = require('js-yaml');

/**
 * Helper to get provider instance.
 * @param {string} [providerName] - Optional provider name override.
 * @param {object} [runtimeConfig] - Optional per-request AI config (BYOM).
 * @returns {AIProvider}
 */
function getProvider(providerName, runtimeConfig = {}) {
  return getAIProvider(providerName, runtimeConfig);
}

/**
 * Core helper: call AI with a system prompt and user message.
 * @param {string} system - System prompt
 * @param {string} userMessage - User message
 * @param {object} options - { maxTokens, aiProvider }
 * @returns {Promise<string>}
 */
async function ask(system, userMessage, options = {}) {
  const provider = getProvider(options.aiProvider, options.aiOptions || {});
  return provider.complete(system, userMessage, {
    maxTokens: options.maxTokens || 4096,
  });
}

const STANDARD_NODE_TYPES = [
  'trigger_push',
  'trigger_mr',
  'build',
  'matrix_build',
  'lint',
  'test',
  'integration_test',
  'smoke_test',
  'cache_restore',
  'cache_save',
  'security_scan',
  'package',
  'release',
  'approval_gate',
  'deploy',
  'canary_deploy',
  'blue_green_deploy',
  'rollback',
  'notify',
  'conditional',
];

const ADVANCED_NODE_TYPES = [
  'matrix_build',
  'cache_restore',
  'cache_save',
  'approval_gate',
  'canary_deploy',
  'blue_green_deploy',
];

function getSupportedNodeTypes() {
  if (process.env.ENABLE_ADVANCED_NODES === 'false') {
    return STANDARD_NODE_TYPES.filter((type) => !ADVANCED_NODE_TYPES.includes(type));
  }

  return STANDARD_NODE_TYPES;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripCodeFences(text) {
  if (typeof text !== 'string') return '';

  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json|yaml)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  return trimmed;
}

function normalizeYamlString(rawYaml) {
  if (typeof rawYaml !== 'string') return '';

  let yamlText = rawYaml.trim();
  if (!yamlText) return '';

  if (yamlText.startsWith('"') && yamlText.endsWith('"')) {
    const parsedQuoted = safeJsonParse(yamlText);
    if (typeof parsedQuoted === 'string') {
      yamlText = parsedQuoted;
    }
  }

  if (/\\n/.test(yamlText)) {
    yamlText = yamlText
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"');
  }

  return yamlText;
}

function extractPipelinePayload(text) {
  const cleaned = stripCodeFences(text);
  const candidates = [cleaned];

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const parsed = safeJsonParse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }

    if (typeof parsed === 'string') {
      const nested = safeJsonParse(parsed);
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return null;
}

function extractYamlFromText(text) {
  const cleaned = stripCodeFences(text);

  const yamlFieldMatch = cleaned.match(/"yaml"\s*:\s*"([\s\S]*)/);
  if (yamlFieldMatch && yamlFieldMatch[1]) {
    let fragment = yamlFieldMatch[1];
    const stopIndex = fragment.search(/",\s*"(nodes|edges)"/);
    if (stopIndex !== -1) {
      fragment = fragment.slice(0, stopIndex);
    }

    fragment = fragment.replace(/"\s*}\s*$/, '');
    return normalizeYamlString(fragment);
  }

  return normalizeYamlString(cleaned);
}

function humanizeLabel(value) {
  return String(value || 'build')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function classifyNodeType(value, supportedNodeTypes) {
  const text = String(value || '').toLowerCase();

  const rules = [
    { type: 'matrix_build', includes: ['matrix'] },
    { type: 'cache_restore', includes: ['cache restore', 'restore cache'] },
    { type: 'cache_save', includes: ['cache save', 'save cache'] },
    { type: 'approval_gate', includes: ['approval', 'manual gate', 'manual'] },
    { type: 'canary_deploy', includes: ['canary'] },
    { type: 'blue_green_deploy', includes: ['blue green', 'blue/green', 'blue-green'] },
    { type: 'rollback', includes: ['rollback', 'roll back'] },
    { type: 'release', includes: ['release'] },
    { type: 'package', includes: ['package', 'artifact', 'bundle'] },
    { type: 'security_scan', includes: ['security', 'sast', 'scan', 'vulnerability'] },
    { type: 'integration_test', includes: ['integration'] },
    { type: 'smoke_test', includes: ['smoke'] },
    { type: 'lint', includes: ['lint', 'static analysis'] },
    { type: 'test', includes: ['test'] },
    { type: 'deploy', includes: ['deploy', 'ship', 'publish'] },
    { type: 'notify', includes: ['notify', 'notification', 'slack', 'teams'] },
    { type: 'build', includes: ['build', 'compile'] },
  ];

  for (const rule of rules) {
    if (!supportedNodeTypes.includes(rule.type)) continue;
    if (rule.includes.some((keyword) => text.includes(keyword))) {
      return rule.type;
    }
  }

  return supportedNodeTypes.includes('build') ? 'build' : supportedNodeTypes[0] || 'build';
}

function sanitizeNodes(rawNodes, supportedNodeTypes) {
  if (!Array.isArray(rawNodes)) return [];

  const seenIds = new Set();

  return rawNodes.map((node, index) => {
    let id = typeof node?.id === 'string' && node.id.trim() ? node.id.trim() : `node_${index + 1}`;
    while (seenIds.has(id)) {
      id = `${id}_${index + 1}`;
    }
    seenIds.add(id);

    const preferredType =
      typeof node?.type === 'string' && supportedNodeTypes.includes(node.type)
        ? node.type
        : classifyNodeType(`${node?.type || ''} ${node?.data?.label || ''}`, supportedNodeTypes);

    const x = Number(node?.position?.x);
    const y = Number(node?.position?.y);

    return {
      id,
      type: preferredType,
      position: {
        x: Number.isFinite(x) ? x : 220 + (index % 2) * 280,
        y: Number.isFinite(y) ? y : 120 + index * 130,
      },
      data: {
        label:
          typeof node?.data?.label === 'string' && node.data.label.trim()
            ? node.data.label.trim()
            : humanizeLabel(node?.id || preferredType),
        config:
          node?.data?.config && typeof node.data.config === 'object' && !Array.isArray(node.data.config)
            ? node.data.config
            : {},
      },
    };
  });
}

function sanitizeEdges(rawEdges, nodes) {
  if (!Array.isArray(rawEdges) || nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((node) => node.id));

  return rawEdges
    .map((edge, index) => {
      const source = typeof edge?.source === 'string' ? edge.source : '';
      const target = typeof edge?.target === 'string' ? edge.target : '';
      return {
        id: typeof edge?.id === 'string' && edge.id.trim() ? edge.id : `e_${source}_${target}_${index}`,
        source,
        target,
        animated: edge?.animated !== false,
      };
    })
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target);
}

function extractJobNamesFromConfig(configText, cicdPlatform) {
  if (!configText || typeof configText !== 'string') {
    return [];
  }

  if (cicdPlatform === 'jenkins') {
    const jobs = [];
    const stageRegex = /stage\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match = stageRegex.exec(configText);
    while (match) {
      jobs.push(match[1]);
      match = stageRegex.exec(configText);
    }
    return jobs;
  }

  let document = null;
  try {
    document = yaml.load(configText);
  } catch {
    return [];
  }

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return [];
  }

  if ((cicdPlatform === 'github' || cicdPlatform === 'circleci') && document.jobs) {
    const jobs = Object.keys(document.jobs || {});
    return jobs.filter((jobName) => jobName && !jobName.startsWith('.'));
  }

  const reservedTopLevel = new Set([
    'stages',
    'variables',
    'workflow',
    'default',
    'include',
    'image',
    'services',
    'before_script',
    'after_script',
    'cache',
    'name',
    'on',
    'env',
    'version',
    'executors',
    'workflows',
  ]);

  return Object.keys(document).filter((key) => {
    if (!key || key.startsWith('.')) return false;
    if (reservedTopLevel.has(key)) return false;

    const value = document[key];
    return value && typeof value === 'object' && !Array.isArray(value);
  });
}

function buildFallbackWorkflow(configText, cicdPlatform) {
  const supportedNodeTypes = getSupportedNodeTypes();
  const jobNames = extractJobNamesFromConfig(configText, cicdPlatform);
  const inferredJobs = jobNames.length > 0 ? jobNames : ['build', 'test', 'deploy'];

  const nodes = [
    {
      id: 'node_1',
      type: supportedNodeTypes.includes('trigger_push') ? 'trigger_push' : supportedNodeTypes[0],
      position: { x: 220, y: 80 },
      data: { label: 'Git Push Trigger', config: {} },
    },
  ];

  let previousId = 'node_1';
  const edges = [];

  inferredJobs.forEach((jobName, index) => {
    const nodeId = `node_${index + 2}`;
    const type = classifyNodeType(jobName, supportedNodeTypes);

    nodes.push({
      id: nodeId,
      type,
      position: {
        x: 220 + (index % 2) * 280,
        y: 220 + index * 130,
      },
      data: {
        label: humanizeLabel(jobName),
        config: {},
      },
    });

    edges.push({
      id: `e_${previousId}_${nodeId}`,
      source: previousId,
      target: nodeId,
      animated: true,
    });

    previousId = nodeId;
  });

  return { nodes, edges };
}

function parsePipelineResult(text, cicdPlatform) {
  const supportedNodeTypes = getSupportedNodeTypes();
  const payload = extractPipelinePayload(text);

  if (payload) {
    const yamlText = normalizeYamlString(payload.yaml || '');
    let nodes = sanitizeNodes(payload.nodes, supportedNodeTypes);
    let edges = sanitizeEdges(payload.edges, nodes);

    if (nodes.length > 0 && edges.length === 0) {
      edges = nodes.slice(1).map((node, index) => ({
        id: `e_${nodes[index].id}_${node.id}`,
        source: nodes[index].id,
        target: node.id,
        animated: true,
      }));
    }

    if (nodes.length === 0 && yamlText) {
      const fallback = buildFallbackWorkflow(yamlText, cicdPlatform);
      nodes = fallback.nodes;
      edges = fallback.edges;
    }

    return {
      yaml: yamlText,
      nodes,
      edges,
    };
  }

  const yamlText = extractYamlFromText(text);
  const fallback = buildFallbackWorkflow(yamlText, cicdPlatform);

  return {
    yaml: yamlText,
    nodes: fallback.nodes,
    edges: fallback.edges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AI Pipeline Generator (Platform-Agnostic)
// ─────────────────────────────────────────────────────────────────────────────

async function generatePipelineFromPrompt(prompt, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const system = `You are an expert DevOps engineer specializing in CI/CD automation.
Given a description, produce:
1. A valid ${metadata.displayName} configuration file (${metadata.fileName}).
2. React Flow workflow nodes for the visual editor.

Node shape: { "id": "<unique>", "type": "<nodeType>", "data": { "label": "<name>", "config": {} }, "position": { "x": <n>, "y": <n> } }
Valid nodeTypes: ${getSupportedNodeTypes().join(', ')}.
Edge shape: { "id": "e<src>-<tgt>", "source": "<id>", "target": "<id>", "animated": true }

Target platform: ${metadata.displayName}
${getPlatformGuidelines(cicdPlatform)}

Return ONLY raw JSON, no markdown fences:
{ "yaml": "...", "nodes": [...], "edges": [...] }`;

  const text = await ask(system, prompt, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 4096,
  });

  return parsePipelineResult(text, cicdPlatform);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pipeline Failure Explainer
// ─────────────────────────────────────────────────────────────────────────────

async function explainPipelineFailure(logs, options = {}) {
  const system = `You are an expert CI/CD debugging assistant.
Analyse the provided pipeline failure logs and return ONLY raw JSON — no markdown fences:
{
  "summary": "<one-line>",
  "explanation": "<detailed>",
  "rootCause": "<root cause>",
  "suggestedFixes": ["<fix1>", "<fix2>"],
  "hasSecurityIssue": false,
  "securityDetails": ""
}`;

  const logText = logs
    .map((l) => `=== Job: ${l.jobName} | stage: ${l.stage} ===\n${l.log}`)
    .join('\n\n')
    .slice(-14000);

  const text = await ask(system, logText, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 2048,
  });

  try {
    return JSON.parse(text);
  } catch {
    return {
      summary: text,
      explanation: text,
      rootCause: 'Unknown',
      suggestedFixes: [],
      hasSecurityIssue: false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Jenkinsfile → Target Platform Migration
// ─────────────────────────────────────────────────────────────────────────────

async function convertJenkinsfile(jenkinsfile, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const system = `You are an expert in Jenkins and ${metadata.displayName}.
Convert the Jenkinsfile to a valid ${metadata.fileName} and React Flow nodes.
Valid nodeTypes: ${getSupportedNodeTypes().join(', ')}.

Target platform: ${metadata.displayName}
${getPlatformGuidelines(cicdPlatform)}

Return ONLY raw JSON — no markdown fences:
{ "yaml": "...", "nodes": [...], "edges": [...] }`;

  const text = await ask(system, jenkinsfile, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 4096,
  });

  return parsePipelineResult(text, cicdPlatform);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pipeline Health Advisor
// ─────────────────────────────────────────────────────────────────────────────

async function scorePipelineHealth(yaml, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const system = `You are a senior DevOps architect.
Score the ${metadata.displayName} configuration on four dimensions (0-100 each):
  speed        — parallelism, caching, dependency optimization, unnecessary sequential stages
  security     — secret handling, security scanning present, pinned images, least privilege
  reliability  — retry logic, artifacts, test coverage enforcement, timeout settings
  best_practice— DRY principles, image hygiene, modern syntax usage

Return ONLY raw JSON — no markdown fences:
{
  "overallScore": <0-100>,
  "grade": "<A-F>",
  "breakdown": {
    "speed":         { "score": <n>, "issues": ["..."], "tips": ["..."] },
    "security":      { "score": <n>, "issues": ["..."], "tips": ["..."] },
    "reliability":   { "score": <n>, "issues": ["..."], "tips": ["..."] },
    "best_practice": { "score": <n>, "issues": ["..."], "tips": ["..."] }
  },
  "topRecommendations": ["<highest impact fix 1>", "<2>", "<3>"]
}`;

  const text = await ask(system, yaml, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 2048,
  });

  try {
    return JSON.parse(text);
  } catch {
    return {
      overallScore: 0,
      grade: 'F',
      breakdown: {},
      topRecommendations: [text],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Auto-Remediation Agent
// ─────────────────────────────────────────────────────────────────────────────

async function autoRemediatePipeline(yaml, failureAnalysis, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const system = `You are a senior DevOps engineer performing automated pipeline remediation.
You are given a broken ${metadata.displayName} configuration and an AI failure analysis.
Fix all identified issues. Rules:
  - Preserve existing jobs unless they are the direct cause of the failure.
  - Add missing deps, fix scripts, pin unstable images, add retry where appropriate.
  - Annotate every changed line with: # FlowForge-fix: <reason>

Target platform: ${metadata.displayName}

Return ONLY raw JSON — no markdown fences:
{
  "patchedYaml": "<corrected ${metadata.fileName}>",
  "changeLog": [
    { "job": "<job name>", "change": "<what was fixed and why>" }
  ],
  "commitMessage": "<conventional-commits format: fix: ...>"
}`;

  const user = `Failure analysis:\n${JSON.stringify(failureAnalysis, null, 2)}\n\nOriginal configuration:\n${yaml}`;
  const text = await ask(system, user, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 4096,
  });

  try {
    return JSON.parse(text);
  } catch {
    return {
      patchedYaml: yaml,
      changeLog: [],
      commitMessage: 'fix: auto-remediation by FlowForge',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Pipeline Chat Assistant
// ─────────────────────────────────────────────────────────────────────────────

async function pipelineChat(messages, currentYaml, options = {}) {
  const cicdPlatform = options.cicdPlatform || 'gitlab';
  const generator = getCICDGenerator(cicdPlatform);
  const metadata = generator.getMetadata();

  const n8nWebhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;
  if (n8nWebhookUrl) {
    const authHeader = process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-FlowForge-Token';
    const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers[authHeader] = authToken;

    const payload = {
      messages,
      currentYaml,
      aiProvider: options.aiProvider || null,
      aiOptions: options.aiOptions || null,
      cicdPlatform,
      platformDisplayName: metadata.displayName,
      source: 'flowforge-pipeline-chat',
      timestamp: new Date().toISOString(),
    };

    const { data } = await axios.post(n8nWebhookUrl, payload, {
      headers,
      timeout: Number(process.env.N8N_CHAT_TIMEOUT_MS || 30000),
    });

    return extractN8NReply(data);
  }

  // Fallback keeps local development unblocked if n8n is not configured yet.
  const system = `You are FlowForge Assistant — an expert CI/CD engineer embedded inside the FlowForge visual pipeline builder.

You have full visibility of the user's current pipeline (shown below).
Help users understand, debug, optimize, and evolve their CI/CD configuration.
Be concise and precise. Always include runnable configuration or shell snippets when relevant.
If the user asks you to modify the pipeline, return the full corrected configuration inside a fenced code block.

Current platform: ${metadata.displayName}
Current pipeline:
\`\`\`yaml
${currentYaml || '# No pipeline loaded yet — drag nodes onto the canvas or use AI Generator.'}
\`\`\``;

  const provider = getProvider(options.aiProvider, options.aiOptions || {});
  return provider.chat(system, messages, { maxTokens: 2048 });
}

function extractN8NReply(data) {
  if (typeof data === 'string' && data.trim()) return data;
  if (Array.isArray(data) && data.length > 0) return extractN8NReply(data[0]);
  if (data && typeof data === 'object') {
    const keys = ['reply', 'response', 'message', 'output', 'text'];
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  throw new Error('n8n webhook did not return a valid chat response');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Platform-specific guidelines for AI prompts
// ─────────────────────────────────────────────────────────────────────────────

function getPlatformGuidelines(platform) {
  const guidelines = {
    gitlab: `
Guidelines for GitLab CI:
- Use 'stages:' to define pipeline stages
- Jobs use 'script:', 'image:', 'needs:', 'rules:'
- Use 'artifacts:' for passing data between jobs
- Use '$CI_*' variables for GitLab CI context`,

    github: `
Guidelines for GitHub Actions:
- Use 'on:' to define triggers (push, pull_request)
- Jobs run on 'runs-on:' runners (ubuntu-latest, etc.)
- Use 'steps:' with 'uses:' for actions and 'run:' for commands
- Use 'needs:' for job dependencies
- Use '\${{ secrets.* }}' for secrets`,

    jenkins: `
Guidelines for Jenkins Pipeline:
- Use declarative pipeline syntax with 'pipeline { }'
- Define 'agent any' or specific agents
- Use 'stages { }' containing 'stage() { steps { } }'
- Use 'sh' for shell commands
- Use 'environment { }' for environment variables`,

    circleci: `
Guidelines for CircleCI:
- Use 'version: 2.1'
- Define 'jobs:' with 'docker:' executors
- Use 'steps:' with 'checkout', 'run:', etc.
- Define 'workflows:' to orchestrate jobs
- Use 'requires:' for job dependencies`,
  };

  return guidelines[platform] || '';
}

module.exports = {
  generatePipelineFromPrompt,
  explainPipelineFailure,
  convertJenkinsfile,
  scorePipelineHealth,
  autoRemediatePipeline,
  pipelineChat,
};
