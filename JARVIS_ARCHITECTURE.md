# J.A.R.V.I.S. Personal OS

## Purpose

JARVIS is the personal AI operating system layered on top of the existing Legacy Jewelry / Nova Business Suite stack. It is designed as an action-oriented command center rather than a themed chatbot.

## Current architecture

- **Frontend:** React + Vite command center, responsive desktop/mobile UI
- **Hosting:** Vercel preview/production deployments
- **Business data:** Existing Supabase Legacy Jewelry tables and realtime updates
- **JARVIS state:** Supabase `jarvis_*` tables with user-owned RLS
- **AI:** Server-side OpenAI Responses API via `/api/jarvis`
- **Weather:** Browser geolocation + Open-Meteo fallback
- **Voice:** Browser SpeechRecognition + speechSynthesis
- **Google:** Google Identity Services OAuth, Calendar API, Gmail API, Contacts scope
- **Safety:** external writes are proposed by the model and require explicit client approval

## JARVIS database layer

The Nova Business Suite Supabase project contains:

- `jarvis_memories` — persistent memories and structured metadata
- `jarvis_tasks` — personal/business tasks and due dates
- `jarvis_pending_actions` — proposed external actions awaiting approval
- `jarvis_activity` — auditable action history
- `jarvis_preferences` — voice, proactive mode, timezone, approval preferences

All JARVIS tables have RLS enabled. Policies limit access to the signed-in owner, and direct `anon` table grants are revoked.

## Current command capabilities

JARVIS can reason over a context snapshot containing:

- current Legacy Jewelry monthly revenue and estimated gross profit
- inventory quantity, cost basis, retail potential, and low-stock status
- open orders and pending revenue
- customer count
- current weather and rain probability
- upcoming Google Calendar items when connected
- Gmail inbox summaries when connected

Supported structured actions:

- `calendar_create`
- `calendar_search`
- `gmail_search`
- `gmail_draft`
- `business_refresh`

Calendar creation and Gmail draft creation require approval in the UI before execution.

## Connection requirements

### OpenAI

Set `OPENAI_API_KEY` as a server-only Vercel environment variable. Optional: set `OPENAI_MODEL`; otherwise JARVIS uses the GPT-5.6 alias.

### Google

Set `VITE_GOOGLE_CLIENT_ID` to a Google OAuth 2.0 Web Client ID whose authorized JavaScript origins include the JARVIS deployment/domain. The user then authorizes Calendar, Gmail, Contacts, profile, and email scopes from the Integrations screen.

### Supabase

The existing variables remain:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never expose the Supabase service-role key to the browser.

## Safety model

- Read-only context may be loaded automatically after authentication.
- Calendar writes and Gmail draft creation are approval-gated.
- JARVIS does not implement money transfers, purchases, destructive email actions, or destructive database actions.
- The AI endpoint must never claim an external action completed until the client has actually executed it.
- Activity should remain auditable.

## Next integration families

The architecture is intended to grow through adapters rather than one monolithic agent:

- ecommerce/store adapters
- package tracking
- richer finance and cash-flow analysis
- proactive briefings and alert jobs
- Home Assistant
- desktop/computer-control companion
- vision/receipt/product recognition
- realtime speech for lower-latency full-duplex voice
- dedicated mobile/PWA notification layer

Production should only be promoted after preview validation and required credentials are configured.