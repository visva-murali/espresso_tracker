import { supabase } from './supabaseClient';

export type BagTarget = {
  id: string;
  user_id: string;
  bean_name: string | null;
  roast_date: string | null;
  target_ratio: number | null;
  target_pull_time_low_s: number | null;
  target_pull_time_high_s: number | null;
  created_at: string;
  updated_at: string;
};

type BagRef = { bean_name: string | null; roast_date: string | null };
type BagTargetValues = { targetRatio: number | null; pullTime: [number, number] | null };

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

export async function setBagTarget(bag: BagRef, values: BagTargetValues): Promise<void> {
  const existingId = await findTargetId(bag);
  const row = {
    target_ratio: values.targetRatio,
    target_pull_time_low_s: values.pullTime ? values.pullTime[0] : null,
    target_pull_time_high_s: values.pullTime ? values.pullTime[1] : null,
  };
  const empty = row.target_ratio == null && row.target_pull_time_low_s == null;

  if (empty) {
    if (!existingId) return;
    const { error } = await supabase.from('bag_targets').delete().eq('id', existingId);
    if (error) throw error;
    return;
  }

  if (existingId) {
    const { error } = await supabase.from('bag_targets').update(row).eq('id', existingId);
    if (error) throw error;
    return;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('bag_targets').insert({
    user_id: userData.user.id,
    bean_name: bag.bean_name,
    roast_date: bag.roast_date,
    ...row,
  });
  if (error) throw error;
}
