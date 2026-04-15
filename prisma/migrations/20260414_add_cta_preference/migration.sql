-- CreateEnum
CREATE TYPE "CtaPreference" AS ENUM ('sms', 'whatsapp', 'messenger');

-- AlterTable
ALTER TABLE "Dealer" ADD COLUMN "ctaPreference" "CtaPreference";
