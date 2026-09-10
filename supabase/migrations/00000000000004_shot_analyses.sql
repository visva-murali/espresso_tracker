-- supabase/migrations/00000000000004_shot_analyses.sql

create table shot_analyses (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null unique references shots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  diagnosis text not null,
  adjustment text not null,
  model text not null,
  history_count smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shot_analyses_user_id_idx on shot_analyses (user_id);

alter table shot_analyses enable row level security;

create policy "shot_analyses_select_own" on shot_analyses
  for select using (auth.uid() = user_id);

create policy "shot_analyses_insert_own" on shot_analyses
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from shots s where s.id = shot_id and s.user_id = auth.uid())
  );

create policy "shot_analyses_update_own" on shot_analyses
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from shots s where s.id = shot_id and s.user_id = auth.uid())
  );

create policy "shot_analyses_delete_own" on shot_analyses
  for delete using (auth.uid() = user_id);

create trigger shot_analyses_set_updated_at
before update on shot_analyses
for each row execute function set_updated_at();
