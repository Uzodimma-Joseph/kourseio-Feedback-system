const axios = require('axios');
const config = require('../config');

/**
 * Forward a normalized customer message to the n8n workflow.
 * This call only confirms n8n *accepted* the message — the actual AI
 * reply comes back later via POST /api/telegram/send.
 */
async function forwardToN8n(payload) {
  if (!config.n8nWebhookUrl) {
    throw new Error('N8N_WEBHOOK_URL is not configured');
  }

  return axios.post(config.n8nWebhookUrl, payload, {
    timeout: config.n8nTimeoutMs,
    headers: { 'Content-Type': 'application/json' },
  });
}

module.exports = { forwardToN8n };
