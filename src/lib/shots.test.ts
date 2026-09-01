import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { createShot, listShots, getShot, updateShot, deleteShot } from './shots';

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
});
