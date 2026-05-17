-- SMS proactive notification opt-in + multi-turn confirmation expiry.
-- Idempotent: re-runnable.

ALTER TABLE "SmsConversation"
  ADD COLUMN IF NOT EXISTS "pendingExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "optedInProactiveAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
