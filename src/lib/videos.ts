import { supabase } from './supabaseClient';

export type Video = {
  id: string;
  shot_id: string;
  user_id: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_DURATION_S = 180;
export const VIDEO_BUCKET = 'pour-videos';

export function validateVideoSize(file: File): { valid: true } | { valid: false; reason: string } {
  if (file.size > MAX_VIDEO_BYTES) {
    return { valid: false, reason: 'Video is larger than 500MB' };
  }
  return { valid: true };
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error('Could not read video metadata'));
    video.src = URL.createObjectURL(file);
  });
}

export async function validateVideoFile(
  file: File
): Promise<{ valid: true } | { valid: false; reason: string }> {
  const sizeCheck = validateVideoSize(file);
  if (!sizeCheck.valid) return sizeCheck;

  const duration = await getVideoDuration(file);
  if (duration > MAX_VIDEO_DURATION_S) {
    return { valid: false, reason: 'Video is longer than 3 minutes' };
  }
  return { valid: true };
}

export async function uploadShotVideo(shotId: string, file: File): Promise<Video> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'mp4';
  const storageKey = `${userData.user.id}/${shotId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(storageKey, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('videos')
    .insert({
      shot_id: shotId,
      user_id: userData.user.id,
      storage_key: storageKey,
      content_type: file.type,
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getVideoForShot(shotId: string): Promise<Video | null> {
  const { data, error } = await supabase.from('videos').select().eq('shot_id', shotId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getVideoPlaybackUrl(video: Video): Promise<string> {
  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(video.storage_key, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
