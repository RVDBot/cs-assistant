# CS Assistant — Setup Guide

WhatsApp-based customer service tool with AI assistance, automatic translation, and a self-learning knowledge base.

---

## Prerequisites

- [Node.js 20+](https://nodejs.org) — required to run the app
- A [Twilio account](https://twilio.com) with WhatsApp enabled
- An [Anthropic API key](https://console.anthropic.com)

---

## Quick Start (Local)

```bash
# 1. Install dependencies
cd cs-assistant
npm install

# 2. Copy and edit environment file
cp .env.example .env.local
# Edit .env.local and add your API keys (optional — you can also set them in the Settings UI)

# 3. Start the app
npm run dev

# 4. Open http://localhost:3000
```

---

## Quick Start (Docker)

```bash
# Build and run
docker compose up -d

# Open http://localhost:3000
```

---

## First-Time Configuration

1. Open the app at `http://localhost:3000`
2. Click the **Settings** icon (gear) in the top-left
3. Fill in:
   - **Twilio Account SID** and **Auth Token** (from [console.twilio.com](https://console.twilio.com))
   - **WhatsApp Number** (e.g. `whatsapp:+14155238886`)
   - **Anthropic API Key** (from [console.anthropic.com](https://console.anthropic.com))
   - **Claude Model** (Opus = best quality, Haiku = fastest/cheapest)
4. Copy the **Webhook URL** shown in settings
5. Paste that URL into Twilio → Messaging → WhatsApp Sandbox (or active number) → "A message comes in" field

---

## Twilio WhatsApp Setup

### Sandbox (testing, free)
1. Go to [Twilio Console → Messaging → Try it out → Send a WhatsApp message](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
2. Follow the sandbox join instructions
3. Set webhook URL to: `https://your-domain.com/api/twilio/webhook`

### Production (real number)
1. Apply for a WhatsApp Business number in Twilio
2. Set the webhook URL for incoming messages

> **Tip:** Use [ngrok](https://ngrok.com) for local testing:
> `ngrok http 3000` → use the HTTPS URL as your webhook

---

## Features

### Left Panel — Conversations
- All WhatsApp conversations listed by most recent
- Shows customer phone, detected language, and unread count
- Search conversations
- Click customer name to rename

### Middle Panel — Chat
- Full conversation history
- Inbound messages show original language + Dutch translation toggle
- Outbound messages show delivery status

### Right Panel — AI Assistant
- **Generate answer** — AI creates a response using all context
- Switch between Dutch (for CS employee) and customer language view
- **Improve answer** — tell the AI how to change the response
- **Send to customer** — sends via WhatsApp and triggers knowledge base update

### Top Icons (left panel)
- 📄 **Context** — Upload files, add web links, set tone of voice
- 📚 **Knowledge base** — View and edit the 22 topic files
- ⚙️ **Settings** — API keys and model selection

---

## Knowledge Base

The app maintains 22 Markdown files in the `/knowledge` folder:

| File | Topic |
|------|-------|
| `returns.md` | Return instructions |
| `product-information.md` | Product information |
| `shipping-delivery.md` | Shipping & delivery |
| `warranty-repairs.md` | Warranty & repairs |
| `order-tracking.md` | Order status & tracking |
| `order-changes.md` | Order changes & cancellations |
| `payment-refunds.md` | Payment issues & refunds |
| `account-help.md` | Account help |
| `password-reset.md` | Password reset |
| `subscription.md` | Subscription management |
| `troubleshooting.md` | Troubleshooting & FAQs |
| `compatibility.md` | Compatibility questions |
| `product-comparisons.md` | Product comparisons |
| `discounts-vouchers.md` | Discount codes & vouchers |
| `price-matching.md` | Price matching |
| `loyalty-program.md` | Loyalty program |
| `opening-hours.md` | Opening hours |
| `escalation.md` | Escalation |
| `complaints.md` | Complaint handling |
| `spare-parts.md` | Spare parts |
| `installation-support.md` | Installation support |
| `recycling-disposal.md` | Recycling & disposal |

After each sent answer, the AI automatically adds any new information to the relevant topic file. You can also manually edit them in the Knowledge Base panel.

---

## Context Sources

The AI uses these sources when generating answers (in order of priority):

1. **Knowledge base** — the 22 auto-learning topic files
2. **Uploaded files** — product guides, manuals, policies, etc.
3. **Web links** — content fetched from URLs you provide
4. **Tone of voice** — your communication style instructions
5. **Conversation history** — the current and past exchanges

---

## Translation Flow

```
Customer sends message (any language)
        ↓
Twilio webhook → app detects language
        ↓
Message shown in original + Dutch toggle
        ↓
CS employee clicks "Generate answer"
        ↓
AI generates: Dutch answer (for CS) + Customer-language version
        ↓
CS employee reviews, optionally improves
        ↓
Clicks "Send" → message sent in customer's language via WhatsApp
```
