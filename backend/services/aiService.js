/**
 * AI Service - Platform-agnostic AI operations for CI/CD
 * Uses the AI provider factory to support multiple AI backends.
 */
const { getAIProvider } = require('../providers/ai');
const { getCICDGenerator } = require('../providers/cicd');
const axios = require('axios');

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
Valid nodeTypes: trigger_push, trigger_mr, build, test, security_scan, deploy, notify, conditional.
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

  try {
    return JSON.parse(text);
  } catch {
    return { yaml: text, nodes: [], edges: [] };
  }
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
Valid nodeTypes: trigger_push, build, test, security_scan, deploy, notify, conditional.

Target platform: ${metadata.displayName}
${getPlatformGuidelines(cicdPlatform)}

Return ONLY raw JSON — no markdown fences:
{ "yaml": "...", "nodes": [...], "edges": [...] }`;

  const text = await ask(system, jenkinsfile, {
    aiProvider: options.aiProvider,
    aiOptions: options.aiOptions,
    maxTokens: 4096,
  });

  try {
    return JSON.parse(text);
  } catch {
    return { yaml: text, nodes: [], edges: [] };
  }
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
