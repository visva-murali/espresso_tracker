import { describe, it, expect } from 'vitest';
import { createTestUserClient } from './supabaseTestClient';

async function insertShot(client: Awaited<ReturnType<typeof createTestUserClient>>['client'], userId: string) {
  const { data, error } = await client
    .from('shots')
    .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: userId })
    .select()
    .single();
  expect(error).toBeNull();
  return data!;
}

describe('shot_analyses RLS isolation', () => {
  it('user B cannot select user A\'s analysis row', async () => {
    const a = await createTestUserClient(`ana-a-${Date.now()}@test.local`);
    const b = await createTestUserClient(`ana-b-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const { data: analysis, error: insertError } = await a.client
      .from('shot_analyses')
      .insert({
        shot_id: shot.id,
        user_id: a.userId,
        diagnosis: 'running fast',
        adjustment: 'grind finer',
        model: 'test-model',
        history_count: 0,
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByB } = await b.client
      .from('shot_analyses')
      .select()
      .eq('id', analysis!.id);
    expect(seenByB).toEqual([]);
  });

  it('user B cannot update or delete user A\'s analysis row', async () => {
    const a = await createTestUserClient(`ana-c-${Date.now()}@test.local`);
    const b = await createTestUserClient(`ana-d-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const { data: analysis } = await a.client
      .from('shot_analyses')
      .insert({
        shot_id: shot.id,
        user_id: a.userId,
        diagnosis: 'd',
        adjustment: 'x',
        model: 'test-model',
        history_count: 0,
      })
      .select()
      .single();

    const { data: updated } = await b.client
      .from('shot_analyses')
      .update({ diagnosis: 'tampered' })
      .eq('id', analysis!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await b.client
      .from('shot_analyses')
      .delete()
      .eq('id', analysis!.id)
      .select();
    expect(deleted).toEqual([]);
  });

  it('user B cannot insert an analysis referencing user A\'s shot', async () => {
    const a = await createTestUserClient(`ana-e-${Date.now()}@test.local`);
    const b = await createTestUserClient(`ana-f-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const { error } = await b.client.from('shot_analyses').insert({
      shot_id: shot.id,
      user_id: b.userId,
      diagnosis: 'd',
      adjustment: 'x',
      model: 'test-model',
      history_count: 0,
    });
    expect(error).not.toBeNull();
  });

  it('re-analyzing the same shot overwrites via the unique shot_id', async () => {
    const a = await createTestUserClient(`ana-g-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const row = {
      shot_id: shot.id,
      user_id: a.userId,
      diagnosis: 'first',
      adjustment: 'x',
      model: 'test-model',
      history_count: 0,
    };
    await a.client.from('shot_analyses').upsert(row, { onConflict: 'shot_id' });
    await a.client
      .from('shot_analyses')
      .upsert({ ...row, diagnosis: 'second' }, { onConflict: 'shot_id' });

    const { data } = await a.client.from('shot_analyses').select().eq('shot_id', shot.id);
    expect(data).toHaveLength(1);
    expect(data![0].diagnosis).toBe('second');
  });
});
