import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!;

async function createTestUserClient(email: string) {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  });
  if (error) throw error;

  // persistSession is disabled because jsdom's shared window.localStorage
  // would otherwise make every client created in this test process resolve
  // to the same storage key, overwriting each other's session and making
  // all "clients" act as whichever user signed in last. Each createClient
  // call keeps its session in memory only, so users a and b stay isolated.
  const client = createClient(LOCAL_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: 'test-password-123',
  });
  if (signInError) throw signInError;

  return { client, userId: data.user!.id };
}

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
