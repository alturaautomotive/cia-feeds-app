-- Add covering indexes for foreign keys flagged by Supabase performance
-- advisor (SECURITY_AUDIT.md F-3.4). Without these, FK reverse-lookups and
-- cascade deletes do full table scans at scale.

CREATE INDEX IF NOT EXISTS "Lead_dealerId_idx"  ON public."Lead" ("dealerId");
CREATE INDEX IF NOT EXISTS "Lead_vehicleId_idx" ON public."Lead" ("vehicleId");

CREATE INDEX IF NOT EXISTS "TeamInvite_dealerId_idx"     ON public."TeamInvite" ("dealerId");
CREATE INDEX IF NOT EXISTS "TeamInvite_subAccountId_idx" ON public."TeamInvite" ("subAccountId");
