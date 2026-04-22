-- Part A: Enable RLS on all 7 public tables (idempotent, no-op if already enabled)
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OAuthState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CrawlSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CrawlJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Dealer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Listing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Vehicle" ENABLE ROW LEVEL SECURITY;

-- Part B: Add RESTRICTIVE deny-all policies for anon role
DO $$ BEGIN
  CREATE POLICY "deny_anon" ON public."_prisma_migrations" AS RESTRICTIVE FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon" ON public."OAuthState" AS RESTRICTIVE FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon" ON public."CrawlSnapshot" AS RESTRICTIVE FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon" ON public."CrawlJob" AS RESTRICTIVE FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon" ON public."Dealer" AS RESTRICTIVE FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon" ON public."Listing" AS RESTRICTIVE FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon" ON public."Vehicle" AS RESTRICTIVE FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Part C: Add RESTRICTIVE deny-all policies for authenticated role
DO $$ BEGIN
  CREATE POLICY "deny_authenticated" ON public."_prisma_migrations" AS RESTRICTIVE FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_authenticated" ON public."OAuthState" AS RESTRICTIVE FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_authenticated" ON public."CrawlSnapshot" AS RESTRICTIVE FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_authenticated" ON public."CrawlJob" AS RESTRICTIVE FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_authenticated" ON public."Dealer" AS RESTRICTIVE FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_authenticated" ON public."Listing" AS RESTRICTIVE FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "deny_authenticated" ON public."Vehicle" AS RESTRICTIVE FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
