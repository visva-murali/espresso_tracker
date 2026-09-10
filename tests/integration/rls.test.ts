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
