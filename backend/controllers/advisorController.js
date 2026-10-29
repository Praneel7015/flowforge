const aiService = require('../services/aiService');
const { logSafe } = require('../utils/logSafe');
const { sendError } = require('../utils/sendError');
const { buildAIOptions } = require('../utils/aiOptions');
const { scanForSecrets } = require('../utils/secretScanner');
const { resolveChatSession, deriveChatKeys } = require('../utils/chatSession');

const SESSION_HEADER = 'x-flowforge-chat-session';

/**
 * Score the health of a CI/CD configuration submitted in the request body.
 */
async function healthScore(req, res) {
  try {
    const { yaml, aiProvider, cicdPlatform, aiOptions } = req.body;
    if (!yaml) return res.status(400).json({ error: 'yaml is required' });

    const report = await aiService.scorePipelineHealth(yaml, {
      aiProvider,
      cicdPlatform,
      aiOptions: buildAIOptions(aiOptions),
    });
    res.json(report);
  } catch (err) {
    console.error('healthScore error: %s', logSafe(err.message));
    sendError(res, err, 'Health analysis failed');
  }
}

/**
 * Auto-remediate a pipeline given its YAML and a pre-fetched failure analysis.
 * Returns a patched YAML and a changelog suitable for creating an MR/PR.
 */
async function remediate(req, res) {
  try {
    const { yaml, failureAnalysis, aiProvider, cicdPlatform, aiOptions } = req.body;
    if (!yaml || !failureAnalysis) {
      return res.status(400).json({ error: 'yaml and failureAnalysis are required' });
    }

    const result = await aiService.autoRemediatePipeline(yaml, failureAnalysis, {
      aiProvider,
      cicdPlatform,
      aiOptions: buildAIOptions(aiOptions),
    });
    res.json(result);
  } catch (err) {
    console.error('remediate error: %s', logSafe(err.message));
    sendError(res, err, 'Auto-remediation failed');
  }
}

/**
 * Conversational chat with the pipeline assistant.
 * Body: {
 *   messages: [{role, content}],
 *   currentYaml: "...",
 *   aiProvider,
 *   cicdPlatform,
 *   useN8n,                            // opt in to the server's n8n webhook
 *   userContext: { conversationId }    // optional label, scoped to the session
 * }
 * Header: X-FlowForge-Chat-Session: <token from a previous response>
 *
 * With useN8n, the n8n memory keys come from the server-signed anonymous
 * session (see utils/chatSession.js); ids in the body or headers are ignored.
 */
async function chat(req, res) {
  try {
    const { messages, currentYaml, aiProvider, cicdPlatform, aiOptions, useN8n } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const wantsN8n = useN8n === true;
    let session = null;
    let userContext = {};
    if (wantsN8n) {
      session = resolveChatSession(req.get(SESSION_HEADER));
      const rawContext = req.body.userContext;
      const conversationLabel =
        rawContext && typeof rawContext === 'object' ? rawContext.conversationId : undefined;
      userContext = deriveChatKeys(session.sessionId, conversationLabel);
    }

    const reply = await aiService.pipelineChat(messages, currentYaml || '', {
      aiProvider,
      cicdPlatform,
      aiOptions: buildAIOptions(aiOptions),
      userContext,
      useN8n: wantsN8n,
    });
    res.json(session ? { reply, sessionToken: session.token } : { reply });
  } catch (err) {
    console.error('chat error: %s', logSafe(err.message));
    sendError(res, err, 'Chat failed');
  }
}

/**
 * Scan pipeline content for hardcoded secrets without touching any AI provider.
 * Body: { content | yaml }
 */
function scanSecrets(req, res) {
  const content = req.body?.content ?? req.body?.yaml;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content (or yaml) must be a non-empty string' });
  }

  const result = scanForSecrets(content);
  res.json(result);
}

module.exports = { healthScore, remediate, chat, scanSecrets };
