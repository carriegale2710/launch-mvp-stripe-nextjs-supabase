import { describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { withCors } from '@/utils/cors';

function req(method: string, origin?: string) {
  return new Request('http://localhost:3000/api/x', {
    method,
    headers: origin ? { origin } : {},
  }) as unknown as import('next/server').NextRequest;
}

describe('withCors', () => {
  it('answers preflight without calling the handler', async () => {
    const handler = vi.fn();
    const res = await withCors(handler)(req('OPTIONS', 'http://localhost:3000'));
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('echoes allowed origins, including NEXT_PUBLIC_APP_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withCors(handler)(req('POST', 'https://app.example.com'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('omits Allow-Origin for disallowed or missing origins', async () => {
    const handler = vi.fn(async () => NextResponse.json({}));
    const bad = await withCors(handler)(req('POST', 'https://evil.example'));
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const none = await withCors(handler)(req('POST'));
    expect(none.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(none.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
});
