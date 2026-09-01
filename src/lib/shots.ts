import { supabase } from './supabaseClient';

export type Shot = {
  id: string;
  user_id: string;
  grind_setting: string;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
  bean_name: string | null;
  roast_date: string | null;
  rating: number | null;
  tasting_note: string | null;
  created_at: string;
  updated_at: string;
};

export type NewShotInput = {
  grind_setting: string;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
  bean_name?: string | null;
  roast_date?: string | null;
  rating?: number | null;
  tasting_note?: string | null;
};

export type UpdateShotInput = Partial<NewShotInput>;

export async function createShot(input: NewShotInput): Promise<Shot> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('shots')
    .insert({ ...input, user_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listShots(): Promise<Shot[]> {
  const { data, error } = await supabase
    .from('shots')
    .select()
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getShot(id: string): Promise<Shot | null> {
  const { data, error } = await supabase.from('shots').select().eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateShot(id: string, input: UpdateShotInput): Promise<Shot> {
  const { data, error } = await supabase
    .from('shots')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShot(id: string): Promise<void> {
  const { error } = await supabase.from('shots').delete().eq('id', id);
  if (error) throw error;
}
