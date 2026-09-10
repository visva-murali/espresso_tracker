// supabase/functions/analyze-shot/cors.ts
//
// CORS header construction for the analyze-shot Edge Function.
//
// The browser calls this function through supabase.functions.invoke, whose
// preflight asks for authorization, apikey, x-client-info and content-type.
// The allow-list must reflect whatever the preflight requests, so the
// browser does not reject the response. Allow-Origin stays '*' on purpose:
// there is no credentials mode here and the token travels in a header, not
// a cookie.

const CANONICAL_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

// Pure, unit-testable resolution: echo the requested header list when the
// preflight provides one, otherwise fall back to the canonical Supabase set.
export function resolveAllowHeaders(requestedHeaders: string | null): string {
  return requestedHeaders ?? CANONICAL_ALLOW_HEADERS;
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': resolveAllowHeaders(
      req.headers.get('Access-Control-Request-Headers')
    ),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}
