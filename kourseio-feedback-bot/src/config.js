require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  publicUrl: process.env.PUBLIC_URL,
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
  botCallbackSecret: process.env.BOT_CALLBACK_SECRET,
  n8nTimeoutMs: Number(process.env.N8N_TIMEOUT_MS || 10000),
};

module.exports = config;
