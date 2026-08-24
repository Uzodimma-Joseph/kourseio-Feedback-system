# KOURSE.IO Feedback Bot — Telegram Interface

A deliberately thin Telegram front-end for the KOURSE.IO AI feedback assistant.
This service does **one job**: move messages between Telegram and n8n. It holds
no database, no AI logic, no memory, and no business rules — all of that lives
in your n8n workflow, per the architecture:

```
CUSTOMER → TELEGRAM → THIS BOT → n8n → AI MODEL → n8n → THIS BOT → CUSTOMER
                                          ↓
                                 YOUR MAIN TELEGRAM (admin)
```

## What this bot does

- Receives Telegram updates (text, photos, `/start`) via webhook.
- Normalizes each message into a small JSON payload and POSTs it to your
  n8n webhook.
- Exposes one generic endpoint, `POST /api/telegram/send`, that n8n calls
  to push a message to *any* chat — used both for the AI's reply to the
  customer and for the admin notification. One endpoint, two uses, no
  second Telegram credential needed on the n8n side.
- Sends a static welcome message on `/start` (no AI round trip needed).
- Falls back to a generic "having trouble, try again" reply if n8n is
  unreachable or times out — it never exposes technical errors to the
  customer, and it never tells the customer their feedback was sent
  unless n8n actually confirms that by calling the send endpoint.

## What this bot deliberately does NOT do

No database, no CRM, no payment/Paystack integration, no course delivery,
no customer accounts, no conversation memory, no AI calls, no admin-message
formatting. All of that belongs in n8n, exactly as specified.

## Environment variables

See `.env.example`. In short:

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random string used as an unguessable path segment for the Telegram webhook |
| `PUBLIC_URL` | This bot's public HTTPS URL (e.g. your Railway domain) — used to auto-register the webhook on boot |
| `N8N_WEBHOOK_URL` | Your n8n Webhook node's URL, which receives customer messages |
| `BOT_CALLBACK_SECRET` | Shared secret n8n must send as `X-Bot-Callback-Secret` when calling `/api/telegram/send` |
| `N8N_TIMEOUT_MS` | How long to wait for n8n to *accept* a forwarded message before falling back (default 10s) — not how long n8n has to finish the AI reply |

## Deploying (Railway)

Same pattern as your existing Phase 1 bot: push this repo to GitHub, connect
it to a Railway service, set the environment variables above (Railway gives
you the public domain to use for `PUBLIC_URL`), and deploy. On boot the bot
registers its own Telegram webhook automatically — no manual `setWebhook`
call needed.

---

## The contract with n8n

### 1. Bot → n8n (incoming customer message)

`POST {N8N_WEBHOOK_URL}`, `Content-Type: application/json`.

**Text message:**

```json
{
  "message_type": "text",
  "text": "Honestly I didn't like the course",
  "customer": {
    "telegram_id": 123456789,
    "username": "john123",
    "first_name": "John",
    "last_name": "Doe",
    "chat_id": 123456789,
    "language_code": "en"
  },
  "message_id": 456,
  "timestamp": "2026-08-24T10:00:00.000Z"
}
```

**Image message:**

```json
{
  "message_type": "image",
  "caption": "See what happens when I try to open the course",
  "image": {
    "file_id": "AgACAgIAAxk...",
    "width": 1280,
    "height": 720
  },
  "customer": { "...": "same shape as above" },
  "message_id": 457,
  "timestamp": "2026-08-24T10:01:12.000Z"
}
```

Notes on images: the bot sends Telegram's `file_id`, not a raw download
URL. Telegram's temporary file-download URLs embed your bot token in the
path, so we deliberately don't hand that around — instead, let n8n's
Telegram node/credential resolve `file_id` → file bytes via the standard
`getFile` call. That keeps the token out of logs, payloads, and (later)
out of any admin message that might reference the attachment.

`chat_id` doubles as `telegram_id` for private chats — it's included
explicitly so n8n never has to guess which field to reply to.

### 2. n8n → Bot (deliver a message to a chat)

`POST {this bot's public URL}/api/telegram/send`

Headers: `X-Bot-Callback-Secret: <BOT_CALLBACK_SECRET>`

```json
{
  "chat_id": 123456789,
  "text": "Thanks for being honest. Was it the content, structure, or something else?",
  "parse_mode": "Markdown"
}
```

Use this same endpoint for:
- **Customer replies** — `chat_id` = the customer's `chat_id` from the incoming payload.
- **Admin notifications** — `chat_id` = your personal Telegram account's chat ID, `text` = the formatted feedback summary n8n builds (see below).

The bot only confirms delivery was attempted (`{"ok": true}` on success,
`4xx/5xx` on failure) — it does not retry. Handle retries/error branches
in n8n if delivery fails.

### 3. Suggested structured output your AI step should produce

So n8n has something consistent to branch and format on:

```json
{
  "feedback_detected": true,
  "category": "Course Quality",
  "sentiment": "Negative",
  "priority": "Medium",
  "summary": "Customer feels the course lessons are too short and don't explain concepts deeply enough.",
  "customer_expectation": "More detailed explanations and practical examples.",
  "customer_feedback": "The videos were too short and didn't explain things properly.",
  "requires_admin_attention": true
}
```

n8n formats this however you like (e.g. the emoji-labelled summary block
from your spec) and calls `/api/telegram/send` with your admin `chat_id`.

### 4. Conversation memory

Lives entirely in n8n (e.g. a Memory node keyed on `customer.telegram_id`
or `customer.chat_id`). This bot is stateless — it never stores a
message once it's forwarded.

---

## Suggested n8n workflow shape

```
Webhook (receives payload from this bot)
   → Switch on message_type (text / image)
   → [image] Telegram node: getFile(file_id) → download
   → Memory lookup/append (keyed on telegram_id)
   → AI Agent (system prompt = KOURSE.IO persona + rules from the spec)
   → Structured output parser
   → HTTP Request → POST /api/telegram/send (reply to customer)
   → IF requires_admin_attention
        → HTTP Request → POST /api/telegram/send (chat_id = admin, text = formatted summary)
```

## Security notes

- The bot token and `BOT_CALLBACK_SECRET` never reach the customer or
  appear in any message this bot sends.
- Prompt-injection resistance, "don't invent prices/refunds/policies,"
  and tone rules all belong in the n8n AI system prompt — this bot has
  no AI logic to protect, it's a pure relay.
- Rotate `BOT_CALLBACK_SECRET` and `TELEGRAM_WEBHOOK_SECRET` if this repo
  or your n8n credentials are ever exposed.
