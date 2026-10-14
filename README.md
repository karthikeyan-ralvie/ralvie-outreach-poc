# Switchboard

Outbound AI voice agents. Create an agent, attach a knowledge base, upload contacts, and run Twilio campaigns that pitch, support, or collect intake answers — then fire email workflows from the conversation.

## Stack

- Next.js 15 (App Router) dashboard + APIs
- Auth.js credentials (email / password), one workspace per user
- SQLite + Prisma (swap `DATABASE_URL` to Postgres if you prefer)
- Redis + BullMQ worker for dialing, crawls, and email
- DeepSeek (conversation), ElevenLabs (voice), Twilio (calls)
- Twilio `<Gather>` speech for caller transcription (no extra STT vendor)

## Local setup

1. Install Node 20+. Redis is required for live campaigns (`docker compose up -d` starts Redis; Postgres in compose is optional).
2. Copy env and install:

```bash
copy .env.example .env
npm install
npx prisma db push
```

3. Run the app and the worker (two terminals):

```bash
npm run dev
npm run worker
```

4. Open [http://localhost:3000](http://localhost:3000), sign up, and add API keys in **Settings**.

## Real phone calls

Twilio webhooks must be publicly reachable. Start a tunnel (ngrok or Cloudflare) to port 3000 and set `TWILIO_WEBHOOK_BASE_URL` to that HTTPS origin (no trailing slash). You also need:

- DeepSeek API key
- ElevenLabs API key (voices load in the agent editor)
- Twilio Account SID, Auth Token, and a voice-enabled from-number
- SMTP host/user/pass if you want post-call emails

## Product flow

1. **Knowledge** — FAQs, pasted text, or sync a website.
2. **Intake** — ordered questions the agent should ask on the call.
3. **Agents** — behavior prompt, ElevenLabs voice, attach KBs + an intake form.
4. **Contacts** — CSV/XLSX upload with auto-mapped columns.
5. **Campaigns** — pick agent + list, start / pause / stop.
6. **Calls** — transcript, intake answers, outcome.
7. **Workflows** — if outcome or scenario matches, send an email (`{{name}}`, `{{answers.field}}`, `{{summary}}`).
