const express = require('express');
const axios = require('axios');
const router = express.Router();

// === Security: block SSRF via private/internal URLs ===
function isSafeWebhookUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return false;
    if (/^10\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    if (host.endsWith('.internal') || host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

// === Chat payload helpers (from main) ===
function sanitizeText(value, maxLen = 200) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function extractLatestMessageText(messages, preferredRole = 'user') {
  if (!Array.isArray(messages)) return '';

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message.content !== 'string') continue;
    if (preferredRole && message.role !== preferredRole) continue;

    const content = message.content.trim();
    if (content) return content;
  }

  return preferredRole ? extractLatestMessageText(messages, '') : '';
}

function buildProductionWebhookUrl(webhookUrl) {
  if (typeof webhookUrl !== 'string') return null;
  if (!webhookUrl.includes('/webhook-test/')) return null;

  return webhookUrl.replace('/webhook-test/', '/webhook/');
}

function buildChatPayload({ messages, currentYaml, cicdPlatform, aiProvider, userContext }) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const yamlContext = typeof currentYaml === 'string' ? currentYaml : '';

  const rawContext = userContext && typeof userContext === 'object' ? userContext : {};
  const fallbackUserId = `anon-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const userId = sanitizeText(rawContext.userId, 120) || fallbackUserId;
  const username = sanitizeText(rawContext.username, 120) || `flowforge-${userId.slice(-6)}`;
  const conversationId =
    sanitizeText(rawContext.conversationId, 160) ||
    sanitizeText(rawContext.chatId, 160) ||
    `${userId}-default`;
  const chatId = sanitizeText(rawContext.chatId, 160) || conversationId;
  const text = extractLatestMessageText(safeMessages, 'user') || extractLatestMessageText(safeMessages, '');

  return {
    text,
    input: text,
    userId,
    username,
    chatId,
    conversationId,
    currentYaml: yamlContext,
    yamlContext,
    messages: safeMessages,
    messageCount: safeMessages.length,
    cicdPlatform: cicdPlatform || 'gitlab',
    aiProvider: aiProvider || null,
    source: 'flowforge-chat-proxy',
    timestamp: new Date().toISOString(),
    userContext: {
      userId,
      username,
      chatId,
      conversationId,
    },
  };
}

function extractReply(data) {
  if (typeof data === 'string' && data.trim()) return data;
  if (Array.isArray(data) && data.length > 0) return extractReply(data[0]);

  if (data && typeof data === 'object') {
    const keys = ['reply', 'response', 'message', 'output', 'text'];
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  return JSON.stringify(data);
}

/**
 * POST /api/n8n/forward
 * Forward pipeline data to an n8n webhook URL.
 * Body: { webhookUrl, payload }
 */
router.post('/forward', async (req, res) => {
  const { webhookUrl, payload } = req.body;

  if (!webhookUrl || typeof webhookUrl !== 'string') {
    return res.status(400).json({ error: 'webhookUrl is required' });
  }

  if (!isSafeWebhookUrl(webhookUrl)) {
    return res.status(400).json({ error: 'Invalid webhook URL. Must be a public HTTP(S) URL.' });
  }

  try {
    const { data } = await axios.post(webhookUrl, payload || {}, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
    res.json({ success: true, response: data });
  } catch (err) {
    res.status(502).json({
      error: 'Failed to forward to n8n webhook',
      details: err.response?.data || err.message,
    });
  }
});

/**
 * POST /api/n8n/chat
 * Route chat messages through an n8n webhook instead of direct AI.
 * Body: {
 *   chatWebhookUrl,
 *   messages,
 *   currentYaml,
 *   cicdPlatform,
 *   aiProvider,
 *   userContext: { userId, username, chatId, conversationId }
 * }
 */
router.post('/chat', async (req, res) => {
  const { chatWebhookUrl, messages, currentYaml, cicdPlatform, aiProvider, userContext } = req.body;

  if (!chatWebhookUrl || typeof chatWebhookUrl !== 'string') {
    return res.status(400).json({ error: 'chatWebhookUrl is required' });
  }

  if (!isSafeWebhookUrl(chatWebhookUrl)) {
    return res.status(400).json({ error: 'Invalid webhook URL. Must be a public HTTP(S) URL.' });
  }

  const payload = buildChatPayload({
    messages,
    currentYaml,
    cicdPlatform,
    aiProvider,
    userContext,
  });

  try {
    let data;

    try {
      const response = await axios.post(chatWebhookUrl, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });
      data = response.data;
    } catch (err) {
      const fallbackUrl = buildProductionWebhookUrl(chatWebhookUrl);
      if (err.response?.status !== 404 || !fallbackUrl || fallbackUrl === chatWebhookUrl) {
        throw err;
      }

      const fallbackResponse = await axios.post(fallbackUrl, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });
      data = fallbackResponse.data;
    }

    res.json({ reply: extractReply(data) });
  } catch (err) {
    res.status(502).json({
      error: 'Failed to get response from n8n chat webhook',
      details: err.response?.data || err.message,
    });
  }
});

module.exports = router;
