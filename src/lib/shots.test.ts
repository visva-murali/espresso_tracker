import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { File as NodeFile } from 'node:buffer';
import { supabase } from './supabaseClient';
import { createShot, listShots, getShot, updateShot, deleteShot } from './shots';
import { uploadShotVideo, VIDEO_BUCKET } from './videos';

// Built with Node's native File (from node:buffer) rather than jsdom's global
// File. jsdom's File/FormData classes are not the ones the real fetch
// implementation recognizes, so a real network upload through jsdom's File
// hangs in this test environment. The uploaded bytes and shape are the same
// as a browser File; only the constructor used in this test differs.
function makeVideoFile(sizeBytes: number, name = 'pour.mp4', type = 'video/mp4'): File {
  return new NodeFile([new Uint8Array(sizeBytes)], name, { type }) as unknown as File;
}

const LOCAL_URL = 'http://127.0.0.1:54321';
const TEST_EMAIL = `shots-crud-${Date.now()}@test.local`;
const TEST_PASSWORD = 'test-password-123';

beforeAll(async () => {
  const admin = createClient(LOCAL_URL, process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!);
  await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw error;
});

afterAll(async () => {
  await supabase.auth.signOut();
});

describe('shots data access', () => {
  it('creates and fetches a shot', async () => {
    const created = await createShot({
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
    });
    expect(created.id).toBeTruthy();
    expect(created.dose_g).toBe(18);

    const fetched = await getShot(created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('lists shots newest first', async () => {
    const first = await createShot({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 });
    const second = await createShot({ grind_setting: '19', dose_g: 18, yield_g: 36, pull_time_s: 30 });

    const shots = await listShots();
    const firstIndex = shots.findIndex((s) => s.id === first.id);
    const secondIndex = shots.findIndex((s) => s.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);
  });

  it('updates a shot', async () => {
    const created = await createShot({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 });
    const updated = await updateShot(created.id, { grind_setting: '20' });
    expect(updated.grind_setting).toBe('20');
  });

  it('deletes a shot', async () => {
    const created = await createShot({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 });
    await deleteShot(created.id);
    const fetched = await getShot(created.id);
    expect(fetched).toBeNull();
  });

  it('removes the video storage object when its shot is deleted', async () => {
    const created = await createShot({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 });
    const video = await uploadShotVideo(created.id, makeVideoFile(1024));

    await deleteShot(created.id);

    const folder = video.storage_key.substring(0, video.storage_key.lastIndexOf('/'));
    const fileName = video.storage_key.substring(video.storage_key.lastIndexOf('/') + 1);
    const { data: remaining, error } = await supabase.storage.from(VIDEO_BUCKET).list(folder);
    expect(error).toBeNull();
    expect(remaining?.some((f) => f.name === fileName)).toBe(false);
  });
});
