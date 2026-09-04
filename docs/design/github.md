repo: visva-murali/espresso_tracker
branch: main

## Last sync

date: 2026-09-04T15:06:43Z

### Updated in this project

- Created the front-end design schema page from the live v1 source (tokens, components, layout rules, four screens).
- Grounded shot row, bag heading and nudge row in the real `shots` / `videos` schema — no migrations required.
- Recorded the derived-state decisions (bag grouping, dial-in state, reference shot) as client-side only.

## Screen map

| Project screen | Repo files |
| --- | --- |
| Schema — shot list | src/pages/ShotListPage.tsx, src/lib/shots.ts |
| Schema — log a shot | src/pages/NewShotPage.tsx, src/components/ShotForm.tsx, src/lib/videos.ts |
| Schema — shot detail | src/pages/ShotDetailPage.tsx, src/lib/videos.ts |
| Schema — trends | (new route, no repo file yet) |
| Schema — tokens & type | src/index.css, supabase/migrations/00000000000001_shots_and_videos.sql |
