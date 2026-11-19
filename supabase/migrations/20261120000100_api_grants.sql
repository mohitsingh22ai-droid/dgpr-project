-- =============================================================================
-- API role grants (Phase 1)
--
-- Newer Supabase projects do not grant the Data API roles access to tables
-- created in the SQL editor. The server uses service_role; anon/authenticated
-- may only read the catalogue (row-level security still applies on top).
-- Idempotent.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on public.divisions, public.products to anon, authenticated;
grant select on public.profiles to authenticated;

-- Future objects created by the migration owner get the same service_role access.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

notify pgrst, 'reload schema';
