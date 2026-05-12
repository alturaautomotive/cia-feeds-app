-- Enterprise features (SECURITY_AUDIT.md month-tier work).
--
-- Adds fields needed for:
--   F-2.6  Conversions API HMAC auth         -> Dealer.trackingSecret
--   F-2.7  Meta-token expiration tracking    -> Dealer.metaTokenInvalidAt
--          (separate from metaTokenExpiresAt: this is "we tried to refresh
--           and it failed", so the dealer needs to reconnect.)
--   F-4.2  Trial-ending notification         -> Dealer.trialEndingNotifiedAt
--          (prevents sending the email twice for the same trial.)
--   F-8.3  GDPR soft-delete                  -> Dealer.deletedAt
--          (account deletion enters a 30-day grace period before hard
--           delete; deletedAt-not-null means "in grace, no logins allowed".)

ALTER TABLE public."Dealer"
  ADD COLUMN IF NOT EXISTS "trackingSecret"          TEXT,
  ADD COLUMN IF NOT EXISTS "metaTokenInvalidAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialEndingNotifiedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedAt"               TIMESTAMP(3);

-- Index for the data-retention cron that selects rows by deletedAt.
CREATE INDEX IF NOT EXISTS "Dealer_deletedAt_idx" ON public."Dealer" ("deletedAt") WHERE "deletedAt" IS NOT NULL;
