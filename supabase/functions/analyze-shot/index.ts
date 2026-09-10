// supabase/functions/analyze-shot/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { runAnalysis } from './orchestrator.ts';
import { GroqError } from './types.ts';
import type { GroqMessages, GroqResult, ShotRow } from './types.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GROQ_BASE_URL = Deno.env.get('GROQ_BASE_URL') ?? 'https://api.groq.com/openai/v1';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function callGroq(messages: GroqMessages): Promise<GroqResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (_err) {
    throw new GroqError(502, 'Groq request failed or timed out');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new GroqError(429, 'Groq rate limited');
  if (!res.ok) throw new GroqError(502, `Groq responded ${res.status}`);

  const completion = await res.json();
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new GroqError(502, 'Groq response had no content');
  try {
    return JSON.parse(content) as GroqResult;
  } catch (_err) {
    throw new GroqError(502, 'Groq content was not JSON');
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Not signed in.' });

  let shotId: unknown;
  try {
    const body = await req.json();
    shotId = body?.shot_id;
  } catch (_err) {
    return json(400, { error: 'Invalid request body.' });
  }
  if (typeof shotId !== 'string' || !UUID_RE.test(shotId)) {
    return json(400, { error: 'shot_id must be a uuid.' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { status, body } = await runAnalysis(
    {
      model: GROQ_MODEL,
      getShot: async (id) => {
        const { data } = await supabase.from('shots').select('*').eq('id', id).maybeSingle();
        return (data as ShotRow | null) ?? null;
      },
      getPriorShots: async (shot, { mixedBeans }) => {
        let query = supabase
          .from('shots')
          .select('*')
          .lt('created_at', shot.created_at)
          .order('created_at', { ascending: false })
          .limit(8);
        if (!mixedBeans) {
          query =
            shot.bean_name == null
              ? query.is('bean_name', null)
              : query.eq('bean_name', shot.bean_name);
          query =
            shot.roast_date == null
              ? query.is('roast_date', null)
              : query.eq('roast_date', shot.roast_date);
        }
        const { data } = await query;
        return (data as ShotRow[] | null) ?? [];
      },
      callGroq,
      saveAnalysis: async (row) => {
        const { data, error } = await supabase
          .from('shot_analyses')
          .upsert(row, { onConflict: 'shot_id' })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Record<string, unknown>;
      },
    },
    { shotId }
  );

  return json(status, body);
});
