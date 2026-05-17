-- SMS conversation state for the Twilio-backed inbound SMS agent.
-- Inbound-first model: dealers text us, we respond. No proactive
-- marketing SMS means no TCPA opt-in record required, but we still
-- honor STOP via the optedOutAt column.

-- Idempotent: re-runnable using IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "SmsConversation" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT,
  "phoneNumber" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'idle',
  "pendingPayload" JSONB,
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "optedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmsConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsConversation_phoneNumber_key"
  ON "SmsConversation"("phoneNumber");

CREATE INDEX IF NOT EXISTS "SmsConversation_dealerId_idx"
  ON "SmsConversation"("dealerId");

DO $$ BEGIN
  ALTER TABLE "SmsConversation"
    ADD CONSTRAINT "SmsConversation_dealerId_fkey"
    FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SmsMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "twilioMessageSid" TEXT,
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsMessage_twilioMessageSid_key"
  ON "SmsMessage"("twilioMessageSid");

CREATE INDEX IF NOT EXISTS "SmsMessage_conversationId_createdAt_idx"
  ON "SmsMessage"("conversationId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "SmsMessage"
    ADD CONSTRAINT "SmsMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "SmsConversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable RLS on both tables. These are server-only resources; the app
-- accesses them via DATABASE_URL (Prisma) which bypasses RLS. Anon/auth
-- clients should not be able to read SMS content even via PostgREST.
ALTER TABLE "SmsConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SmsMessage" ENABLE ROW LEVEL SECURITY;
