import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { listBagTargets, setBagTarget } from './bagTargets';

const LOCAL_URL = 'http://127.0.0.1:54321';
const TEST_EMAIL = `bag-targets-${Date.now()}@test.local`;
const TEST_PASSWORD = 'test-password-123';

const kenya = { bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' };
const unlabeled = { bean_name: null, roast_date: null };

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

describe('bagTargets', () => {
  it('sets a ratio target and lists it back', async () => {
    await setBagTarget(kenya, { targetRatio: 2, pullTime: null });
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(Number(match!.target_ratio)).toBe(2);
    expect(match!.target_pull_time_low_s).toBeNull();
  });

  it('sets a pull-time range with no ratio target', async () => {
    await setBagTarget(kenya, { targetRatio: null, pullTime: [26, 31] });
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(match!.target_ratio).toBeNull();
    expect(match!.target_pull_time_low_s).toBe(26);
    expect(match!.target_pull_time_high_s).toBe(31);
  });

  it('overwrites the row rather than adding a second', async () => {
    await setBagTarget(kenya, { targetRatio: 2, pullTime: null });
    await setBagTarget(kenya, { targetRatio: 2.5, pullTime: [25, 30] });
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].target_ratio)).toBe(2.5);
    expect(matches[0].target_pull_time_low_s).toBe(25);
  });

  it('deletes the row when every field is cleared', async () => {
    await setBagTarget(kenya, { targetRatio: 2, pullTime: [26, 31] });
    await setBagTarget(kenya, { targetRatio: null, pullTime: null });
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(0);
  });

  it('is a no-op when clearing a bag that has no row', async () => {
    await expect(
      setBagTarget(unlabeled, { targetRatio: null, pullTime: null })
    ).resolves.toBeUndefined();
  });

  it('handles the null-keyed (unlabeled) bag', async () => {
    await setBagTarget(unlabeled, { targetRatio: 3, pullTime: null });
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === null && t.roast_date === null
    );
    expect(Number(match?.target_ratio)).toBe(3);
    await setBagTarget(unlabeled, { targetRatio: null, pullTime: null });
  });
});
