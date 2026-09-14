-- Minimal etterligning av Supabase-plattformen, slik at skjemaet kan
-- testes i en vanlig PostgreSQL uten Supabase. Brukes BARE av testene.
create schema if not exists auth;
create schema if not exists storage;

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin;  exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- I Supabase leser auth.uid() brukeren ut av JWT-en. I testen later vi
-- som, ved hjelp av en sesjonsvariabel.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text
);
alter table storage.objects enable row level security;

do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
