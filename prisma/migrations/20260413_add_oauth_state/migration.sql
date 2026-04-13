CREATE TABLE "OAuthState" (
  "id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");
CREATE INDEX "OAuthState_state_idx" ON "OAuthState"("state");
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");
