# Mailgun Email Integration Plan

Goals
- Add transactional email with Mailgun without breaking existing flows; keep current inserts/purchases intact.
- Keep secrets server-side; use edge functions with service role for all sends.
- Reuse existing shared helpers (CORS, retry, error handling) and standard `{ ok: boolean, error?: string }` responses.

Shared Foundations
- Create `supabase/functions/_shared/email.ts`: Mailgun client using `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`, `MAILGUN_FROM` (+ optional `MAILGUN_REGION`, `MAILGUN_TEST_MODE`). Use `fetch` + `FormData`, wrap with `retryWithBackoff`, return structured result (`id`, `message`, `status`), log failures.
- Create `supabase/functions/_shared/email-templates.ts`: `renderEmail(kind, data)` producing `{ subject, text, html, tags?, replyTo? }`. Start with:
  - `waitlist-confirm`
  - `waitlist-spot-open`
  - `ticket-receipt` (include event title/date, tx hash/explorer URL when available)

Backend Hooks (Additive, Non-blocking)
- Ticket issuance emails: in `paystack-webhook`, `gasless-purchase`, and `paystack-grant-keys`, after successful issuance and when `user_email` exists, call the mail helper for “ticket issued”; failures log only (do not affect response).
- Waitlist confirmation:
  - Keep current client insert to `event_waitlist`.
  - Add edge function `waitlist-email` that accepts `{ event_id, email, wallet_address? }`, validates via `EMAIL_REGEX`, optionally inserts (or no-op if already present), and sends confirmation. Client can *optionally* call this after the existing insert for immediate delivery; can also be triggered manually/cron for retries.
  - Optionally add a small dispatcher/cron-friendly function that scans recent waitlist rows and sends confirmations for ones not yet emailed (backend-owned, no client contract change).
- Notify waitlist:
  - Add `notify-waitlist` edge function with Privy-auth + event ownership/manager check. Pull non-notified rows, send “spot open” emails in chunks (e.g., 50) with simple rate limiting, mark `notified/notified_at`, return counts. UI can later add a “Notify waitlist” button; function can also be run manually/cron.

Observability & Safety
- Optional `email_events` table to log sends/status/metadata for audit/replay.
- Support `MAILGUN_TEST_MODE` (`o:testmode=yes`) for staging; include tags for filtering.
- Reuse existing shared error/CORS helpers; consistent JSON envelopes.

Config & Secrets
- Supabase function secrets: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM`, optional `MAILGUN_REGION`, `MAILGUN_TEST_MODE`.
- Keep secrets out of client env; all sends happen server-side with service role.

Deploy & Rollout
- Deploy updated/new functions with Supabase CLI: `paystack-webhook`, `gasless-purchase`, `paystack-grant-keys`, `waitlist-email`, `notify-waitlist` (plus any dispatcher/cron helper).
- Rollout order: ship shared helpers → wire ticket issuance emails (non-blocking) → add waitlist-email function (optional client call / cron) → add notify-waitlist function → optionally add UI hooks.
- Add a short operator note in docs on Mailgun test mode and key rotation once secrets are set.***
