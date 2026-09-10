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
  it('sets a target and lists it back', async () => {
    await setBagTarget(kenya, 2);
    const targets = await listBagTargets();
    const match = targets.find(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(match).toBeTruthy();
    expect(Number(match!.target_ratio)).toBe(2);
  });

  it('overwrites the existing row instead of creating a second one', async () => {
    await setBagTarget(kenya, 2);
    await setBagTarget(kenya, 2.5);
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].target_ratio)).toBe(2.5);
  });

  it('clears a target when passed null', async () => {
    await setBagTarget(kenya, 2.5);
    await setBagTarget(kenya, null);
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(0);
  });

  it('is a no-op when clearing a bag that has no target', async () => {
    await expect(setBagTarget(unlabeled, null)).resolves.toBeUndefined();
  });

  it('handles the null-keyed (unlabeled) bag', async () => {
    await setBagTarget(unlabeled, 3);
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === null && t.roast_date === null
    );
    expect(Number(match?.target_ratio)).toBe(3);
    await setBagTarget(unlabeled, null);
  });
});
