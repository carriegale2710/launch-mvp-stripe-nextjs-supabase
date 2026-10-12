// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fromByTable, queryBuilder } from '../helpers';

const from = vi.fn();
const auth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
};
vi.mock('@/utils/supabase', () => ({
  supabase: { from: (...a: unknown[]) => from(...a), get auth() { return auth; } },
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();
const session = { user: { id: 'u1' }, access_token: 't' };
let authCb: (event: string, s: unknown) => Promise<void>;
const unsubscribe = vi.fn();

async function mount() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  from.mockReset();
  Object.values(auth).forEach((f) => f.mockReset());
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockImplementation((cb) => {
    authCb = cb;
    return { data: { subscription: { unsubscribe } } };
  });
});

describe('AuthProvider', () => {
  it('initialises as signed-out with no session', async () => {
    const { result } = await mount();
    expect(result.current.user).toBeNull();
    expect(result.current.isSubscriber).toBe(false);
  });

  it('stops loading when getSession errors', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('x') });
    const { result } = await mount();
    expect(result.current.user).toBeNull();
    expect(auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('loads the session and flags active subscribers', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    from.mockImplementation(fromByTable({ subscriptions: [queryBuilder({ data: { status: 'active', current_period_end: future() } })] }));
    const { result } = await mount();
    expect(result.current.user).toEqual(session.user);
    expect(result.current.session).toEqual(session);
    expect(result.current.isSubscriber).toBe(true);
  });

  it('does not flag expired periods or query errors', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    from.mockImplementation(fromByTable({ subscriptions: [queryBuilder({ data: { status: 'active', current_period_end: past() } })] }));
    expect((await mount()).result.current.isSubscriber).toBe(false);

    from.mockImplementation(fromByTable({ subscriptions: [queryBuilder({ data: null, error: { message: 'x' } })] }));
    expect((await mount()).result.current.isSubscriber).toBe(false);
  });

  it('reacts to auth state changes, including logout', async () => {
    from.mockImplementation(fromByTable({ subscriptions: [queryBuilder({ data: { status: 'trialing', current_period_end: future() } })] }));
    const { result } = await mount();
    await act(async () => authCb('SIGNED_IN', session));
    expect(result.current.user).toEqual(session.user);
    expect(result.current.isSubscriber).toBe(true);
    await act(async () => authCb('SIGNED_OUT', null));
    expect(result.current.user).toBeNull();
    expect(result.current.isSubscriber).toBe(false);
  });

  it('signs in with Google using the callback redirect', async () => {
    const { result } = await mount();
    await result.current.signInWithGoogle();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  });

  it('email sign-in returns auth data and throws on error', async () => {
    const { result } = await mount();
    const data = { user: { id: 'u1' }, session };
    auth.signInWithPassword.mockResolvedValue({ data, error: null });
    from.mockImplementation(fromByTable({ users: [queryBuilder({ data: { is_deleted: false } })] }));
    expect(await result.current.signInWithEmail('a@b.co', 'pw')).toEqual(data);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });

    auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('bad creds') });
    await expect(result.current.signInWithEmail('a@b.co', 'x')).rejects.toThrow('bad creds');
  });

  it('reactivates soft-deleted users on sign-in', async () => {
    const { result } = await mount();
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const update = queryBuilder();
    from.mockImplementation(fromByTable({ users: [queryBuilder({ data: { is_deleted: true } }), update] }));
    await result.current.signInWithEmail('a@b.co', 'pw');
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ is_deleted: false, deleted_at: null }));
    expect(update.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('signs up, updates credentials and resets password via Supabase', async () => {
    const { result } = await mount();
    auth.signUp.mockResolvedValue({ data: { user: null }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await result.current.signUpWithEmail('a@b.co', 'pw');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'pw',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    await result.current.updatePassword('new');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new' });
    await result.current.updateEmail('n@b.co');
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'n@b.co' });
    await result.current.resetPassword('a@b.co');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', {
      redirectTo: `${window.location.origin}/update-password`,
    });

    auth.updateUser.mockResolvedValue({ error: new Error('nope') });
    await expect(result.current.updatePassword('x')).rejects.toThrow('nope');
    auth.resetPasswordForEmail.mockResolvedValue({ error: new Error('rate') });
    await expect(result.current.resetPassword('a@b.co')).rejects.toThrow('rate');
  });

  it('signOut dispatches cleanup, signs out and redirects to /login', async () => {
    const { result } = await mount();
    const cleanup = vi.fn();
    window.addEventListener('cleanup-before-logout', cleanup);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign, origin: 'http://localhost:3000' } as Location);
    auth.signOut.mockResolvedValue({});
    await result.current.signOut();
    window.removeEventListener('cleanup-before-logout', cleanup);
    expect(cleanup).toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('/login');
  });
});
