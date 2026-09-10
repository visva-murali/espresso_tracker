-- supabase/migrations/00000000000006_bag_target_pull_time.sql

alter table bag_targets
  alter column target_ratio drop not null,
  add column target_pull_time_low_s  smallint,
  add column target_pull_time_high_s smallint,
  add constraint bag_targets_pull_time_range check (
    (target_pull_time_low_s is null) = (target_pull_time_high_s is null)
    and (
      target_pull_time_low_s is null
      or (target_pull_time_low_s >= 5
          and target_pull_time_high_s <= 120
          and target_pull_time_low_s < target_pull_time_high_s)
    )
  ),
  add constraint bag_targets_not_empty check (
    target_ratio is not null or target_pull_time_low_s is not null
  );
