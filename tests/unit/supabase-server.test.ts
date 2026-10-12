import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const getAll = vi.fn(() => []);
const set = vi.fn();
const headerGet = vi.fn();
let cookieConfig: any;

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: unknown) => {
    cookieConfig = opts;
    return { auth: { getUser } };
  }),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll, set })),
  headers: vi.fn(async () => ({ get: headerGet })),
}));

import { createSupabaseServerClient, getAuthenticatedUser } from '@/utils/supabase-server';

const u = (id: string) => ({ data: { user: { id } } });
const none = { data: { user: null } };

describe('supabase-server', () => {
  beforeEach(() => {
    getUser.mockReset();
    headerGet.mockReset();
  });

  it('bridges cookies to the Next cookie store', async () => {
    await createSupabaseServerClient();
    cookieConfig.cookies.getAll();
    cookieConfig.cookies.setAll([{ name: 'a', value: 'b', options: { path: '/' } }]);
    expect(getAll).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith('a', 'b', { path: '/' });
  });

  it('uses cookie auth only by default', async () => {
    getUser.mockResolvedValue(u('c1'));
    headerGet.mockReturnValue('Bearer tok');
    expect(await getAuthenticatedUser()).toEqual({ id: 'c1' });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('falls back to cookie user when no bearer header', async () => {
    getUser.mockResolvedValue(u('c1'));
    headerGet.mockReturnValue(null);
    expect(await getAuthenticatedUser({ allowBearerToken: true })).toEqual({ id: 'c1' });
  });

  it('accepts bearer-only auth', async () => {
    getUser.mockResolvedValueOnce(none).mockResolvedValueOnce(u('b1'));
    headerGet.mockReturnValue('bearer tok');
    expect(await getAuthenticatedUser({ allowBearerToken: true })).toEqual({ id: 'b1' });
    expect(getUser).toHaveBeenLastCalledWith('tok');
  });

  it('accepts matching cookie + bearer', async () => {
    getUser.mockResolvedValueOnce(u('x')).mockResolvedValueOnce(u('x'));
    headerGet.mockReturnValue('Bearer tok');
    expect(await getAuthenticatedUser({ allowBearerToken: true })).toEqual({ id: 'x' });
  });

  it('rejects mismatching cookie + bearer', async () => {
    getUser.mockResolvedValueOnce(u('x')).mockResolvedValueOnce(u('y'));
    headerGet.mockReturnValue('Bearer tok');
    expect(await getAuthenticatedUser({ allowBearerToken: true })).toBeNull();
  });

  it('rejects an invalid bearer token', async () => {
    getUser.mockResolvedValueOnce(u('x')).mockResolvedValueOnce(none);
    headerGet.mockReturnValue('Bearer tok');
    expect(await getAuthenticatedUser({ allowBearerToken: true })).toBeNull();
  });
});
