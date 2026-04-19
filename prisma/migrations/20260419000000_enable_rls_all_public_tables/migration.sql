-- Enable Row Level Security on every ordinary table in `public`.
-- Satisfies Supabase database linter 0013 (rls_disabled_in_public) and helps 0023
-- (sensitive_columns_exposed) by ensuring RLS is enabled before policies.
-- Uses a loop so it stays correct whether the DB matches this repo (Dealer, Vehicle, …)
-- or includes additional tables (e.g. from another app on the same project).
-- PostgREST `anon` / `authenticated` still need policies to read/write; server-side Prisma
-- commonly uses the table owner role which bypasses RLS unless FORCE RLS is set.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
  END LOOP;
END $$;
