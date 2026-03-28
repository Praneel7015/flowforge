const aiService = require('../services/aiService');
const { buildAIOptions } = require('../utils/aiOptions');

function sanitizeText(value, maxLen = 200) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function readHeaderValue(headers, name) {
  const value = headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildChatUserContext(reqBody, reqHeaders) {
  const rawContext =
    reqBody?.userContext && typeof reqBody.userContext === 'object' ? reqBody.userContext : {};

  const userId =
    sanitizeText(rawContext.userId, 120) ||
    sanitizeText(reqBody?.userId, 120) ||
    sanitizeText(readHeaderValue(reqHeaders, 'x-flowforge-user-id'), 120) ||
    sanitizeText(readHeaderValue(reqHeaders, 'x-user-id'), 120);

  const username =
    sanitizeText(rawContext.username, 120) ||
    sanitizeText(reqBody?.username, 120) ||
    sanitizeText(readHeaderValue(reqHeaders, 'x-flowforge-username'), 120);

  const conversationId =
    sanitizeText(rawContext.conversationId, 160) || sanitizeText(reqBody?.conversationId, 160);

  const chatId =
    sanitizeText(rawContext.chatId, 160) ||
    sanitizeText(reqBody?.chatId, 160) ||
    sanitizeText(readHeaderValue(reqHeaders, 'x-flowforge-chat-id'), 160);

  return {
    userId,
    username,
    conversationId,
    chatId,
  };
}

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
    console.error('healthScore error:', err.message);
    res.status(500).json({ error: 'Health analysis failed: ' + err.message });
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
    console.error('remediate error:', err.message);
    res.status(500).json({ error: 'Auto-remediation failed: ' + err.message });
  }
}

/**
 * Conversational chat with the pipeline assistant.
 * Body: {
 *   messages: [{role, content}],
 *   currentYaml: "...",
 *   aiProvider,
 *   cicdPlatform,
 *   userContext: { userId, username, chatId, conversationId }
 * }
 */
async function chat(req, res) {
  try {
    const { messages, currentYaml, aiProvider, cicdPlatform, aiOptions } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const userContext = buildChatUserContext(req.body, req.headers);

    const reply = await aiService.pipelineChat(messages, currentYaml || '', {
      aiProvider,
      cicdPlatform,
      aiOptions: buildAIOptions(aiOptions),
      userContext,
    });
    res.json({ reply });
  } catch (err) {
    console.error('chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
}

module.exports = { healthScore, remediate, chat };
