import { describe, it, expect } from 'vitest';
import { createTestUserClient } from './supabaseTestClient';

describe('shots RLS isolation', () => {
  it('user cannot select another user\'s shot', async () => {
    const a = await createTestUserClient(`rls-a-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-b-${Date.now()}@test.local`);

    const { data: shot, error: insertError } = await a.client
      .from('shots')
      .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: a.userId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByB, error: selectError } = await b.client
      .from('shots')
      .select()
      .eq('id', shot!.id);

    expect(selectError).toBeNull();
    expect(seenByB).toEqual([]);
  });

  it('user cannot update or delete another user\'s shot', async () => {
    const a = await createTestUserClient(`rls-c-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-d-${Date.now()}@test.local`);

    const { data: shot } = await a.client
      .from('shots')
      .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: a.userId })
      .select()
      .single();

    const { data: updated } = await b.client
      .from('shots')
      .update({ grind_setting: '99' })
      .eq('id', shot!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await b.client
      .from('shots')
      .delete()
      .eq('id', shot!.id)
      .select();
    expect(deleted).toEqual([]);

    const { data: stillThere } = await a.client
      .from('shots')
      .select()
      .eq('id', shot!.id)
      .single();
    expect(stillThere?.grind_setting).toBe('18');
  });
});

describe('videos RLS isolation', () => {
  it('user cannot select another user\'s video row', async () => {
    const a = await createTestUserClient(`rls-e-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-f-${Date.now()}@test.local`);

    const { data: shot } = await a.client
      .from('shots')
      .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: a.userId })
      .select()
      .single();

    const { data: video, error: videoInsertError } = await a.client
      .from('videos')
      .insert({
        shot_id: shot!.id,
        user_id: a.userId,
        storage_key: `${a.userId}/${shot!.id}/test.mp4`,
        content_type: 'video/mp4',
        size_bytes: 1000,
      })
      .select()
      .single();
    expect(videoInsertError).toBeNull();

    const { data: seenByB } = await b.client
      .from('videos')
      .select()
      .eq('id', video!.id);
    expect(seenByB).toEqual([]);
  });
});

describe('bag_targets RLS isolation', () => {
  it("user cannot select, update, or delete another user's bag target", async () => {
    const a = await createTestUserClient(`rls-bt-a-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-bt-b-${Date.now()}@test.local`);

    const { data: target, error: insertError } = await a.client
      .from('bag_targets')
      .insert({ user_id: a.userId, bean_name: 'Kenya', roast_date: '2026-08-23', target_ratio: 2 })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByB } = await b.client
      .from('bag_targets')
      .select()
      .eq('id', target!.id);
    expect(seenByB).toEqual([]);

    const { data: updated } = await b.client
      .from('bag_targets')
      .update({ target_ratio: 9 })
      .eq('id', target!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await b.client
      .from('bag_targets')
      .delete()
      .eq('id', target!.id)
      .select();
    expect(deleted).toEqual([]);

    const { data: stillThere } = await a.client
      .from('bag_targets')
      .select()
      .eq('id', target!.id)
      .single();
    expect(Number(stillThere?.target_ratio)).toBe(2);
  });

  it('rejects a second target row for the same bag key, including a null-keyed bag', async () => {
    const a = await createTestUserClient(`rls-bt-c-${Date.now()}@test.local`);

    const first = await a.client
      .from('bag_targets')
      .insert({ user_id: a.userId, bean_name: null, roast_date: null, target_ratio: 2 })
      .select()
      .single();
    expect(first.error).toBeNull();

    const second = await a.client
      .from('bag_targets')
      .insert({ user_id: a.userId, bean_name: null, roast_date: null, target_ratio: 3 })
      .select()
      .single();
    expect(second.error).not.toBeNull();
  });

  it('allows a row with a pull-time range and no ratio target', async () => {
    const a = await createTestUserClient(`rls-bt-pt-${Date.now()}@test.local`);
    const { error } = await a.client
      .from('bag_targets')
      .insert({
        user_id: a.userId,
        bean_name: 'Ethiopia',
        roast_date: '2026-09-01',
        target_ratio: null,
        target_pull_time_low_s: 26,
        target_pull_time_high_s: 31,
      });
    expect(error).toBeNull();
  });

  it('rejects a half-set range and an inverted range', async () => {
    const a = await createTestUserClient(`rls-bt-pt2-${Date.now()}@test.local`);

    const half = await a.client
      .from('bag_targets')
      .insert({ user_id: a.userId, bean_name: 'A', roast_date: null, target_pull_time_low_s: 26 });
    expect(half.error).not.toBeNull();

    const inverted = await a.client
      .from('bag_targets')
      .insert({
        user_id: a.userId,
        bean_name: 'B',
        roast_date: null,
        target_pull_time_low_s: 31,
        target_pull_time_high_s: 26,
      });
    expect(inverted.error).not.toBeNull();
  });
});
