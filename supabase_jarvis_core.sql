-- J.A.R.V.I.S. Personal OS persistent state layer
-- Applied to Nova Business Suite Supabase project on 2026-08-17.

create extension if not exists pgcrypto;

create table if not exists public.jarvis_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'general',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  source text not null default 'jarvis',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','failed','expired')),
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  summary text not null,
  status text not null default 'info',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jarvis_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  voice_enabled boolean not null default true,
  proactive_enabled boolean not null default true,
  weather_enabled boolean not null default true,
  require_approval_external_writes boolean not null default true,
  preferred_name text,
  home_timezone text not null default 'America/New_York',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jarvis_memories enable row level security;
alter table public.jarvis_tasks enable row level security;
alter table public.jarvis_pending_actions enable row level security;
alter table public.jarvis_activity enable row level security;
alter table public.jarvis_preferences enable row level security;

create policy "jarvis_memories_select_own" on public.jarvis_memories for select to authenticated using ((select auth.uid()) = user_id);
create policy "jarvis_memories_insert_own" on public.jarvis_memories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "jarvis_memories_update_own" on public.jarvis_memories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "jarvis_memories_delete_own" on public.jarvis_memories for delete to authenticated using ((select auth.uid()) = user_id);

create policy "jarvis_tasks_select_own" on public.jarvis_tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "jarvis_tasks_insert_own" on public.jarvis_tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "jarvis_tasks_update_own" on public.jarvis_tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "jarvis_tasks_delete_own" on public.jarvis_tasks for delete to authenticated using ((select auth.uid()) = user_id);

create policy "jarvis_actions_select_own" on public.jarvis_pending_actions for select to authenticated using ((select auth.uid()) = user_id);
create policy "jarvis_actions_insert_own" on public.jarvis_pending_actions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "jarvis_actions_update_own" on public.jarvis_pending_actions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "jarvis_actions_delete_own" on public.jarvis_pending_actions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "jarvis_activity_select_own" on public.jarvis_activity for select to authenticated using ((select auth.uid()) = user_id);
create policy "jarvis_activity_insert_own" on public.jarvis_activity for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "jarvis_preferences_select_own" on public.jarvis_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "jarvis_preferences_insert_own" on public.jarvis_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "jarvis_preferences_update_own" on public.jarvis_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "jarvis_preferences_delete_own" on public.jarvis_preferences for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists jarvis_memories_user_created_idx on public.jarvis_memories(user_id, created_at desc);
create index if not exists jarvis_tasks_user_status_due_idx on public.jarvis_tasks(user_id, status, due_at);
create index if not exists jarvis_actions_user_status_created_idx on public.jarvis_pending_actions(user_id, status, created_at desc);
create index if not exists jarvis_activity_user_created_idx on public.jarvis_activity(user_id, created_at desc);

revoke all on table public.jarvis_memories from anon;
revoke all on table public.jarvis_tasks from anon;
revoke all on table public.jarvis_pending_actions from anon;
revoke all on table public.jarvis_activity from anon;
revoke all on table public.jarvis_preferences from anon;

grant select, insert, update, delete on table public.jarvis_memories to authenticated;
grant select, insert, update, delete on table public.jarvis_tasks to authenticated;
grant select, insert, update, delete on table public.jarvis_pending_actions to authenticated;
grant select, insert on table public.jarvis_activity to authenticated;
grant select, insert, update, delete on table public.jarvis_preferences to authenticated;