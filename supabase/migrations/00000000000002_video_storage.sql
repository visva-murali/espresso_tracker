-- supabase/migrations/00000000000002_video_storage.sql

insert into storage.buckets (id, name, public)
values ('pour-videos', 'pour-videos', false)
on conflict (id) do nothing;

create policy "pour_videos_select_own" on storage.objects
for select using (
  bucket_id = 'pour-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "pour_videos_insert_own" on storage.objects
for insert with check (
  bucket_id = 'pour-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "pour_videos_delete_own" on storage.objects
for delete using (
  bucket_id = 'pour-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
