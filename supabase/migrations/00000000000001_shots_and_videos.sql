-- supabase/migrations/00000000000001_shots_and_videos.sql

create table shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grind_setting text not null,
  dose_g numeric not null,
  yield_g numeric not null,
  pull_time_s numeric not null,
  bean_name text,
  roast_date date,
  rating smallint,
  tasting_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shots_user_id_created_at_idx on shots (user_id, created_at desc);

alter table shots enable row level security;

create policy "shots_select_own" on shots for select using (auth.uid() = user_id);
create policy "shots_insert_own" on shots for insert with check (auth.uid() = user_id);
create policy "shots_update_own" on shots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "shots_delete_own" on shots for delete using (auth.uid() = user_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shots_set_updated_at
before update on shots
for each row execute function set_updated_at();

create table videos (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null unique references shots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null default now()
);

create index videos_user_id_idx on videos (user_id);

alter table videos enable row level security;

create policy "videos_select_own" on videos for select using (auth.uid() = user_id);
create policy "videos_insert_own" on videos for insert with check (auth.uid() = user_id);
create policy "videos_update_own" on videos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "videos_delete_own" on videos for delete using (auth.uid() = user_id);
