const express = require('express');
const config = require('../config');

/**
 * A single generic outbound endpoint. n8n calls this to deliver an AI
 * reply to a customer, AND to deliver the admin feedback notification —
 * both are just "send this text to this chat_id", so one endpoint
 * covers both without n8n needing its own separate Telegram credential.
 */
function buildCallbackRouter(bot) {
  const router = express.Router();

  router.post('/telegram/send', async (req, res) => {
    const secret = req.header('X-Bot-Callback-Secret');
    if (!config.botCallbackSecret || secret !== config.botCallbackSecret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const { chat_id, text, parse_mode } = req.body || {};
    if (!chat_id || !text) {
      return res.status(400).json({ ok: false, error: 'chat_id and text are required' });
    }

    try {
      await bot.telegram.sendMessage(
        chat_id,
        text,
        parse_mode ? { parse_mode } : undefined
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('Failed to send Telegram message:', err.message);
      return res.status(502).json({ ok: false, error: 'Failed to deliver message via Telegram' });
    }
  });

  return router;
}

module.exports = { buildCallbackRouter };
