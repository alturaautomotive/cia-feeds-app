-- Drop the unused parallel Supabase Auth artifacts (SECURITY_AUDIT.md F-1.1).
--
-- These were leftover from an initial scaffold. The production app uses
-- NextAuth + Prisma Dealer/TeamUser, not Supabase Auth. Verified empty
-- before drop: auth.users=0, profiles=0, dealerships=0.
--
-- Security drivers (all four resolved by this drop):
--   - anon_security_definer_function_executable
--   - authenticated_security_definer_function_executable
--   - function_search_path_mutable
--   - auth_rls_initplan (on profiles + dealerships policies)
--
-- handle_new_user was a SECURITY DEFINER trigger reachable via PostgREST
-- RPC by both anon and authenticated roles; an unauthenticated attacker
-- could have called it to forge rows in public.profiles. Eliminating the
-- function + tables removes the entire attack surface.

BEGIN;

-- 1. Drop trigger on auth.users (must come before function drop)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop the SECURITY DEFINER function
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 3. Drop unused tables (their RLS policies drop automatically with them)
DROP TABLE IF EXISTS public.dealerships;
DROP TABLE IF EXISTS public.profiles;

COMMIT;
