# SMS Agent Setup Runbook

**Document owner:** Luis Delgado
**Last reviewed:** May 16, 2026
**Status:** Code shipped; awaiting Twilio number provisioning + env vars to activate

---

## What this is

CIA Feeds has an **inbound-first SMS agent**. Dealers text our Twilio number; we reply. We never proactively text dealers (no opt-in marketing, no nudges, no broadcast). This deliberately avoids TCPA marketing rules and US carrier A2P 10DLC brand-registration burdens.

### What the agent can do

| Dealer texts | We reply |
|---|---|
| A URL from their website | Confirm import, then run Firecrawl scrape + add to catalog |
| `STOP` (or `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`) | One-final-confirm SMS, then silence until opt-in |
| `START` (or `UNSTOP`, `YES`) | Welcome-back message, lift opt-out |
| `HELP` (or `INFO`) | Explanation of what they can do |
| A free-form question | Polite "I can help with listings — text a URL" reply |

### What the agent will NOT do

- Send any SMS to a number that hasn't texted us first
- Send any SMS to a number that has opted out (until they `START`)
- Send proactive nudges (low-inventory alerts, onboarding follow-ups, etc.)
- Process inbound SMS without a valid Twilio signature

---

## Setup steps

### 1. Provision a Twilio number

You need a US local or toll-free number. Toll-free is faster (no A2P 10DLC because toll-free uses a separate verification flow).

1. Sign in to [console.twilio.com](https://console.twilio.com).
2. **Phone Numbers → Buy a number**.
3. For toll-free: filter Capability = SMS, Type = Toll-Free. Buy.
4. For local 10DLC: filter Capability = SMS, Type = Local. Buy. Then start [A2P 10DLC brand + campaign registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) (1-3 weeks of carrier approval).

For an inbound-only use case, **toll-free verification** is the path of least resistance — apply for [toll-free verification](https://www.twilio.com/docs/messaging/compliance/toll-free-message-verification) which typically returns approval in 1-3 business days. Without verification you're capped at very low daily message volumes (sufficient for early testing, not for scale).

### 2. Set environment variables

In Vercel project settings, add to **Production**:

| Variable | Required | What it's for |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID, starts with `AC` |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token — used for both REST API auth AND webhook signature verification |
| `TWILIO_PHONE_NUMBER` | One of | The E.164 number you bought (e.g. `+18005550100`) |
| `TWILIO_MESSAGING_SERVICE_SID` | One of | A Messaging Service SID if you set one up (preferred for production scale — handles failover) |
| `NEXT_PUBLIC_SMS_NUMBER` | Yes | Same number as `TWILIO_PHONE_NUMBER`; surfaced to the client for click-to-SMS buttons. Must be E.164. |

If both `TWILIO_PHONE_NUMBER` and `TWILIO_MESSAGING_SERVICE_SID` are set, `MESSAGING_SERVICE_SID` wins.

### 3. Configure Twilio webhook

In the Twilio console:

1. **Phone Numbers → Manage → Active Numbers → click your number**.
2. Under **Messaging Configuration**:
   - **A MESSAGE COMES IN**: Webhook → `https://www.ciafeed.com/api/sms/inbound`
   - **HTTP Method**: POST
3. Save.

Twilio will POST to that URL with `application/x-www-form-urlencoded` body and an `X-Twilio-Signature` header. The webhook verifies the signature using `TWILIO_AUTH_TOKEN`; missing or invalid signatures get 403.

### 4. Wire dealer phone numbers

The agent matches inbound SMS by E.164 phone number to `Dealer.phone`. Dealers must have their phone number on file in normalized E.164 form (`+15555550100`).

The `lib/twilio.ts:normalizePhoneE164()` helper does the conversion, but the dealer settings page currently saves whatever the dealer typed. Two options:

- **Quick win:** add a server-side normalize call when saving `Dealer.phone` so any future updates are E.164. Existing rows can be backfilled with a one-time SQL: `UPDATE "Dealer" SET phone = ... WHERE phone IS NOT NULL` after running them through the normalize function.
- **Polish:** add a "Verify your phone number" SMS verification flow using Twilio Verify (separate code path, not yet built).

For initial rollout, just manually update mahon-motors' phone column to E.164 and test from that number.

### 5. Test end-to-end

1. Set env vars and deploy.
2. Update one dealer's `phone` to your own personal phone (E.164).
3. From your phone, text the Twilio number: `HELP`. You should receive the help text within ~5 seconds.
4. Text it a real listing URL from any dealer site. You should receive "Importing now…" within ~5 seconds, and the listing should appear in the dealer's dashboard within ~60 seconds.
5. Text `STOP`. You should receive the opt-out confirmation. Text anything else; you should receive nothing.
6. Text `START`. You should receive the welcome-back. Text a URL again to confirm flow resumed.

---

## How the code is structured

| File | Purpose |
|---|---|
| `prisma/migrations/20260516210000_add_sms_conversation_tables/migration.sql` | Idempotent DDL for the two new tables (already applied to production) |
| `lib/twilio.ts` | Signature verification + outbound SMS sender (circuit-breakered) |
| `lib/smsIntent.ts` | Rule-based + Gemini-fallback intent classifier |
| `app/api/sms/inbound/route.ts` | The webhook handler |
| `app/dashboard/components/SmsCtaCard.tsx` | Click-to-SMS card in the dashboard |
| `lib/email.ts:sendWelcomeEmail` | Includes click-to-SMS link in the welcome email |

---

## Monitoring

- Inbound messages are logged in `SmsMessage` with `direction='inbound'`, `status='received'`
- Outbound messages are logged in `SmsMessage` with `direction='outbound'`, `status` cycles `queued → sent` (or `failed` with `errorMessage`)
- Conversation state is in `SmsConversation`
- All Twilio API failures are wrapped by the `twilio.sendSms` circuit breaker (`lib/circuitBreaker.ts`); opening the breaker fails-fast for 30s

Query a dealer's recent conversation:

```sql
SELECT m.direction, m."createdAt", m.status, m.body, m."errorMessage"
FROM "SmsMessage" m
JOIN "SmsConversation" c ON c.id = m."conversationId"
WHERE c."dealerId" = '<dealer-uuid>'
ORDER BY m."createdAt" DESC
LIMIT 20;
```

---

## Compliance notes

- **TCPA:** We are inbound-first. The dealer initiates every conversation. This is "transactional/relationship messaging," not "marketing." TCPA's prior-express-written-consent rule does not apply.
- **CTIA / carriers:** Even for transactional messaging we honor `STOP / UNSUBSCRIBE / CANCEL / END / QUIT` per the [CTIA Short Code Monitoring Handbook](https://www.ctia.org/the-wireless-industry/industry-commitments/messaging-interoperability-sms-mms) — our handler enforces this regardless of vendor.
- **Logging:** Every inbound and outbound message is persisted in `SmsMessage` for audit. RLS is enabled on both SMS tables; only `DATABASE_URL` (which bypasses RLS) can read them.
- **Data retention:** SMS messages contain user PII (the dealer's phone number, occasionally a URL containing personal data). Existing GDPR delete cron should be extended to clear `SmsMessage` rows older than 90 days — current cron only clears `Lead` and `Vehicle`. Tracked as a future enhancement.

---

## Out of scope (intentionally NOT built)

These were considered and deferred:

- **Proactive outbound nudges** (low-inventory, onboarding follow-up). Requires A2P 10DLC or toll-free verification *and* explicit opt-in records. Re-evaluate after first paying enterprise customer asks for it.
- **MMS image uploads.** Twilio supports inbound MMS; we'd need to download the attached image from Twilio's API, validate it, and attach to the listing. Defer until dealers ask.
- **Multi-language support.** Currently English-only keyword matching.
- **Phone verification on signup.** Currently any phone string is accepted; a dealer typing wrong digits won't be matched. Twilio Verify can be added later as a separate flow.
- **Per-dealer Twilio numbers.** Currently one shared number. White-label per-dealer numbers would require a Messaging Service per dealer + DID provisioning UI — significant scope.
