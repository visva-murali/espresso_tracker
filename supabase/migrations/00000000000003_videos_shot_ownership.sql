-- supabase/migrations/00000000000003_videos_shot_ownership.sql

drop policy "videos_insert_own" on videos;
create policy "videos_insert_own" on videos for insert with check (
  auth.uid() = user_id
  and exists (select 1 from shots s where s.id = shot_id and s.user_id = auth.uid())
);

drop policy "videos_update_own" on videos;
create policy "videos_update_own" on videos for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from shots s where s.id = shot_id and s.user_id = auth.uid())
);
