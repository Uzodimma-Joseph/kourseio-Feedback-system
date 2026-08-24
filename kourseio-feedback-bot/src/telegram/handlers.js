const { forwardToN8n } = require('../services/n8n');

const WELCOME_MESSAGE = `Hi 👋 I'm KOURSE.IO's automated feedback assistant. I'm here to hear what you think—whether you've had a great experience, encountered a problem, found something confusing, or have an idea that could make KOURSE.IO better.

You can send me a review, complaint, suggestion, or even a screenshot. I'll help understand what happened and make sure meaningful feedback reaches the KOURSE.IO team.`;

const GRACEFUL_TEXT_FALLBACK =
  "I'm having a little trouble processing that message right now. Please try sending it again in a moment.";

const GRACEFUL_IMAGE_FALLBACK =
  "I received the image, but I wasn't able to process it properly. Could you describe what you'd like me to look at?";

const UNSUPPORTED_TYPE_MESSAGE =
  "I can read text messages and images (screenshots) right now. Could you describe what's going on, or send a screenshot?";

function buildCustomer(ctx) {
  const from = ctx.from || {};
  return {
    telegram_id: from.id,
    username: from.username || null,
    first_name: from.first_name || null,
    last_name: from.last_name || null,
    chat_id: ctx.chat.id,
    language_code: from.language_code || null,
  };
}

function registerHandlers(bot) {
  // Static welcome — no AI/n8n round trip needed for this one.
  bot.start(async (ctx) => {
    await ctx.reply(WELCOME_MESSAGE);
  });

  bot.on('text', async (ctx) => {
    const payload = {
      message_type: 'text',
      text: ctx.message.text,
      customer: buildCustomer(ctx),
      message_id: ctx.message.message_id,
      timestamp: new Date(ctx.message.date * 1000).toISOString(),
    };

    try {
      await forwardToN8n(payload);
      // n8n owns the actual reply; it arrives later via
      // POST /api/telegram/send. Nothing more to do here.
    } catch (err) {
      console.error('Failed to forward text message to n8n:', err.message);
      await ctx.reply(GRACEFUL_TEXT_FALLBACK);
    }
  });

  bot.on('photo', async (ctx) => {
    const photos = ctx.message.photo;
    // Telegram sends the same photo at several sizes, smallest first.
    const largest = photos[photos.length - 1];

    const payload = {
      message_type: 'image',
      caption: ctx.message.caption || null,
      image: {
        file_id: largest.file_id,
        width: largest.width,
        height: largest.height,
      },
      customer: buildCustomer(ctx),
      message_id: ctx.message.message_id,
      timestamp: new Date(ctx.message.date * 1000).toISOString(),
    };

    try {
      await forwardToN8n(payload);
    } catch (err) {
      console.error('Failed to forward image to n8n:', err.message);
      await ctx.reply(GRACEFUL_IMAGE_FALLBACK);
    }
  });

  // Anything else (voice notes, video, documents, stickers...) — the
  // spec only asks for text + image support, so we say so rather than
  // silently dropping the message or guessing at handling it.
  bot.on(['voice', 'video', 'document', 'sticker', 'audio', 'video_note'], async (ctx) => {
    await ctx.reply(UNSUPPORTED_TYPE_MESSAGE);
  });
}

module.exports = { registerHandlers };
