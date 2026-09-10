import { supabase } from './supabaseClient';

export type BagTarget = {
  id: string;
  user_id: string;
  bean_name: string | null;
  roast_date: string | null;
  target_ratio: number;
  created_at: string;
  updated_at: string;
};

type BagRef = { bean_name: string | null; roast_date: string | null };

export async function listBagTargets(): Promise<BagTarget[]> {
  const { data, error } = await supabase.from('bag_targets').select();
  if (error) throw error;
  return data ?? [];
}

async function findTargetId(bag: BagRef): Promise<string | null> {
  let query = supabase.from('bag_targets').select('id');
  query = bag.bean_name === null
    ? query.is('bean_name', null)
    : query.eq('bean_name', bag.bean_name);
  query = bag.roast_date === null
    ? query.is('roast_date', null)
    : query.eq('roast_date', bag.roast_date);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function setBagTarget(bag: BagRef, targetRatio: number | null): Promise<void> {
  const existingId = await findTargetId(bag);

  if (targetRatio === null) {
    if (!existingId) return;
    const { error } = await supabase.from('bag_targets').delete().eq('id', existingId);
    if (error) throw error;
    return;
  }

  if (existingId) {
    const { error } = await supabase
      .from('bag_targets')
      .update({ target_ratio: targetRatio })
      .eq('id', existingId);
    if (error) throw error;
    return;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('bag_targets').insert({
    user_id: userData.user.id,
    bean_name: bag.bean_name,
    roast_date: bag.roast_date,
    target_ratio: targetRatio,
  });
  if (error) throw error;
}
