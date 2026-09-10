import { describe, it, expect } from 'vitest';
import { createTestUserClient } from './supabaseTestClient';

// FIX 5: exercises the null-aware same-bag filter that getPriorShots in
// supabase/functions/analyze-shot/index.ts builds. That query shape lives
// only in the edge function, so this test rebuilds it against real Postgres
// (local Supabase) to prove that a null roast_date is matched with .is(),
// not .eq(), and a decoy bag with the same bean_name but a real roast_date
// is excluded.
type Client = Awaited<ReturnType<typeof createTestUserClient>>['client'];

async function insertShot(
  client: Client,
  userId: string,
  fields: { bean_name: string | null; roast_date: string | null; grind_setting: string; created_at: string }
) {
  const { data, error } = await client
    .from('shots')
    .insert({
      user_id: userId,
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
      ...fields,
    })
    .select()
    .single();
  expect(error).toBeNull();
  return data!;
}

describe('analyze-shot same-bag prior-shot filter', () => {
  it('matches a null roast_date with .is() and excludes a same-name decoy bag', async () => {
    const a = await createTestUserClient(`filter-a-${Date.now()}@test.local`);
    const bean = `Ethiopia Guji ${Date.now()}`;

    // Target bag: bean_name set, roast_date null. Two prior shots.
    await insertShot(a.client, a.userId, {
      bean_name: bean,
      roast_date: null,
      grind_setting: 'target-1',
      created_at: '2026-09-01T08:00:00Z',
    });
    await insertShot(a.client, a.userId, {
      bean_name: bean,
      roast_date: null,
      grind_setting: 'target-2',
      created_at: '2026-09-02T08:00:00Z',
    });

    // Decoy bag: same bean_name, but a real roast_date. Must be excluded.
    await insertShot(a.client, a.userId, {
      bean_name: bean,
      roast_date: '2026-08-20',
      grind_setting: 'decoy',
      created_at: '2026-09-03T08:00:00Z',
    });

    // The "current" shot is later than all three; rebuild getPriorShots' query.
    const currentCreatedAt = '2026-09-04T08:00:00Z';
    const { data, error } = await a.client
      .from('shots')
      .select('*')
      .lt('created_at', currentCreatedAt)
      .order('created_at', { ascending: false })
      .limit(8)
      .eq('bean_name', bean)
      .is('roast_date', null);

    expect(error).toBeNull();
    const grinds = (data ?? []).map((r) => r.grind_setting).sort();
    expect(grinds).toEqual(['target-1', 'target-2']);
  });
});
