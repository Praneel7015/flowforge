const express = require('express');
const axios = require('axios');
const router = express.Router();

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
 * Body: { chatWebhookUrl, messages, currentYaml, cicdPlatform }
 */
router.post('/chat', async (req, res) => {
  const { chatWebhookUrl, messages, currentYaml, cicdPlatform } = req.body;

  if (!chatWebhookUrl || typeof chatWebhookUrl !== 'string') {
    return res.status(400).json({ error: 'chatWebhookUrl is required' });
  }

  if (!isSafeWebhookUrl(chatWebhookUrl)) {
    return res.status(400).json({ error: 'Invalid webhook URL. Must be a public HTTP(S) URL.' });
  }

  try {
    const { data } = await axios.post(chatWebhookUrl, {
      messages,
      currentYaml,
      cicdPlatform,
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    res.json({ reply: data.reply || data.message || JSON.stringify(data) });
  } catch (err) {
    res.status(502).json({
      error: 'Failed to get response from n8n chat webhook',
      details: err.response?.data || err.message,
    });
  }
});

module.exports = router;
