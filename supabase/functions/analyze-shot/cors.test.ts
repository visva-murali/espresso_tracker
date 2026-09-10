import { describe, it, expect } from 'vitest';
import { resolveAllowHeaders, corsHeaders } from './cors';

describe('resolveAllowHeaders', () => {
  it('reflects a provided Access-Control-Request-Headers value verbatim', () => {
    expect(resolveAllowHeaders('authorization, apikey, x-client-info, content-type')).toBe(
      'authorization, apikey, x-client-info, content-type'
    );
  });

  it('reflects an unusual requested header list verbatim', () => {
    expect(resolveAllowHeaders('x-custom-thing')).toBe('x-custom-thing');
  });

  it('falls back to the canonical Supabase list when null', () => {
    expect(resolveAllowHeaders(null)).toBe('authorization, x-client-info, apikey, content-type');
  });
});

describe('corsHeaders', () => {
  it('echoes the preflight requested headers into Access-Control-Allow-Headers', () => {
    const req = new Request('https://example.test', {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Headers': 'authorization, apikey, x-client-info, content-type' },
    });
    const headers = corsHeaders(req);
    expect(headers['Access-Control-Allow-Headers']).toBe(
      'authorization, apikey, x-client-info, content-type'
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
  });

  it('falls back to the canonical list when the request has no requested-headers', () => {
    const req = new Request('https://example.test', { method: 'POST' });
    expect(corsHeaders(req)['Access-Control-Allow-Headers']).toBe(
      'authorization, x-client-info, apikey, content-type'
    );
  });
});
