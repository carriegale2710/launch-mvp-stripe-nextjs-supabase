import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }));

describe('supabase env validation', () => {
  beforeEach(() => vi.resetModules());

  it('client requires URL and anon key', async () => {
    const { validateSupabaseEnv } = await import('@/utils/supabase');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => validateSupabaseEnv()).toThrow('Missing env.NEXT_PUBLIC_SUPABASE_URL');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(() => validateSupabaseEnv()).toThrow('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('admin requires URL and service role key, lazily', async () => {
    const { validateSupabaseAdminEnv, supabaseAdmin } = await import('@/utils/supabase-admin');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(() => validateSupabaseAdminEnv()).toThrow('Missing env.SUPABASE_SERVICE_ROLE_KEY');
    expect(() => supabaseAdmin.from).toThrow('Missing env.SUPABASE_SERVICE_ROLE_KEY');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srk');
    expect(() => supabaseAdmin.from('t')).not.toThrow();
  });
});
