const express = require('express');
const axios = require('axios');
const router = express.Router();

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

  try {
    const url = new URL(webhookUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return res.status(400).json({ error: 'Invalid webhook URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid webhook URL' });
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
