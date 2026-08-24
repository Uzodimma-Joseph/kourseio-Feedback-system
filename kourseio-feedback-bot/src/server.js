const express = require('express');
const { Telegraf } = require('telegraf');

const config = require('./config');
const { registerHandlers } = require('./telegram/handlers');
const { buildCallbackRouter } = require('./routes/callback');

if (!config.botToken) {
  console.error('TELEGRAM_BOT_TOKEN is required — set it in your environment.');
  process.exit(1);
}
if (!config.botCallbackSecret) {
  console.warn('BOT_CALLBACK_SECRET is not set — /api/telegram/send will reject all requests.');
}

const bot = new Telegraf(config.botToken);
registerHandlers(bot);

const app = express();
app.use(express.json());

// The random secret in the path means only Telegram (who we register
// this URL with) can realistically guess where to POST updates.
const WEBHOOK_PATH = `/telegram/webhook/${config.webhookSecret || 'hook'}`;

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(bot.webhookCallback(WEBHOOK_PATH));
app.use('/api', buildCallbackRouter(bot));

app.listen(config.port, async () => {
  console.log(`KOURSE.IO feedback bot listening on port ${config.port}`);

  if (config.publicUrl) {
    const webhookUrl = `${config.publicUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`;
    try {
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`Telegram webhook registered: ${webhookUrl}`);
    } catch (err) {
      console.error('Failed to register Telegram webhook:', err.message);
    }
  } else {
    console.warn('PUBLIC_URL not set — skipping automatic webhook registration.');
  }
});
