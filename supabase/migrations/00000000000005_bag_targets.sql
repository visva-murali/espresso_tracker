-- supabase/migrations/00000000000005_bag_targets.sql

create table bag_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bean_name text,
  roast_date date,
  target_ratio numeric not null check (target_ratio > 0.5 and target_ratio < 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bag_targets_bag_idx
  on bag_targets (user_id, bean_name, roast_date) nulls not distinct;

create index bag_targets_user_id_idx on bag_targets (user_id);

alter table bag_targets enable row level security;

create policy "bag_targets_select_own" on bag_targets
  for select using (auth.uid() = user_id);
create policy "bag_targets_insert_own" on bag_targets
  for insert with check (auth.uid() = user_id);
create policy "bag_targets_update_own" on bag_targets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bag_targets_delete_own" on bag_targets
  for delete using (auth.uid() = user_id);

create trigger bag_targets_set_updated_at
before update on bag_targets
for each row execute function set_updated_at();
