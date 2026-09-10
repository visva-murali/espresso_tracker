// supabase/functions/analyze-shot/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from './cors.ts';
import { runAnalysis } from './orchestrator.ts';
import { GroqError } from './types.ts';
import type { GroqMessages, GroqResult, ShotRow } from './types.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GROQ_BASE_URL = Deno.env.get('GROQ_BASE_URL') ?? 'https://api.groq.com/openai/v1';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? 'openai/gpt-oss-120b';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';

function json(status: number, body: unknown, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
        // gpt-oss models are reasoning models: without a low effort cap they
        // spend the whole token budget on hidden reasoning and return an empty
        // completion, which then fails json_object validation. "low" keeps
        // reasoning to a few dozen tokens. Harmless for non-reasoning models.
        reasoning_effort: 'low',
        // Diagnosis + adjustment run ~100 tokens; 512 leaves headroom for a
        // long tasting note plus the low-effort reasoning tokens.
        max_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (_err) {
    console.error('Groq call failed:', 'request failed or timed out');
    throw new GroqError(502, 'Groq request failed or timed out');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    console.error('Groq call failed:', 429);
    throw new GroqError(429, 'Groq rate limited');
  }
  if (!res.ok) {
    console.error('Groq call failed:', res.status);
    throw new GroqError(502, `Groq responded ${res.status}`);
  }

  const completion = await res.json();
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    console.error('Groq call failed:', 'response had no content');
    throw new GroqError(502, 'Groq response had no content');
  }
  try {
    return JSON.parse(content) as GroqResult;
  } catch (_err) {
    console.error('Groq call failed:', 'content was not JSON');
    throw new GroqError(502, 'Groq content was not JSON');
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, req);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Not signed in.' }, req);

  let shotId: unknown;
  try {
    const body = await req.json();
    shotId = body?.shot_id;
  } catch (_err) {
    return json(400, { error: 'Invalid request body.' }, req);
  }
  if (typeof shotId !== 'string' || !UUID_RE.test(shotId)) {
    return json(400, { error: 'shot_id must be a uuid.' }, req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { status, body } = await runAnalysis(
      {
        model: GROQ_MODEL,
        getShot: async (id) => {
          const { data, error } = await supabase
            .from('shots')
            .select('*')
            .eq('id', id)
            .maybeSingle();
          if (error) throw new Error(error.message);
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
          const { data, error } = await query;
          if (error) throw new Error(error.message);
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

    return json(status, body, req);
  } catch (err) {
    console.error('analyze-shot failed:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'The assistant is unavailable right now. Try again.' }, req);
  }
});
