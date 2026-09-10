// tests/integration/supabaseTestClient.ts
import { createClient } from '@supabase/supabase-js';

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!;

export async function createTestUserClient(email: string) {
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
