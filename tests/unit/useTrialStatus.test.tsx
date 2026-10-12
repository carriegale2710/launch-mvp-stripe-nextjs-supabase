// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { fromByTable, queryBuilder } from '../helpers';

const from = vi.fn();
let authUser: { id: string } | null = { id: 'u1' };

vi.mock('@/utils/supabase', () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }));

import { useTrialStatus } from '@/hooks/useTrialStatus';

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function run() {
  const hook = renderHook(() => useTrialStatus());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook.result.current;
}

describe('useTrialStatus', () => {
  beforeEach(() => {
    from.mockReset();
    authUser = { id: 'u1' };
  });

  it('is not in trial without a user', async () => {
    authUser = null;
    expect(await run()).toEqual({ isInTrial: false, trialEndTime: null, isLoading: false });
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['active', 'trialing'])('is not in trial with a %s subscription', async (status) => {
    from.mockImplementation(fromByTable({ subscriptions: [queryBuilder({ data: { status } })] }));
    const r = await run();
    expect(r.isInTrial).toBe(false);
    expect(from).not.toHaveBeenCalledWith('user_trials');
  });

  it('is in trial with an unexpired, unused trial', async () => {
    const end = hours(10);
    from.mockImplementation(
      fromByTable({
        subscriptions: [queryBuilder({ data: null })],
        user_trials: [queryBuilder({ data: { trial_end_time: end, is_trial_used: false } })],
      })
    );
    expect(await run()).toMatchObject({ isInTrial: true, trialEndTime: end });
  });

  it('is not in trial when expired or already used', async () => {
    from.mockImplementation(
      fromByTable({
        subscriptions: [queryBuilder({ data: null })],
        user_trials: [queryBuilder({ data: { trial_end_time: hours(-1), is_trial_used: false } })],
      })
    );
    expect((await run()).isInTrial).toBe(false);

    from.mockImplementation(
      fromByTable({
        subscriptions: [queryBuilder({ data: null })],
        user_trials: [queryBuilder({ data: { trial_end_time: hours(10), is_trial_used: true } })],
      })
    );
    expect((await run()).isInTrial).toBe(false);
  });

  it('creates a 48 hour trial when none exists', async () => {
    const upsert = queryBuilder({ data: { trial_end_time: 'created-end' } });
    from.mockImplementation(
      fromByTable({
        subscriptions: [queryBuilder({ data: null })],
        user_trials: [queryBuilder({ data: null }), upsert],
      })
    );
    const before = Date.now();
    const r = await run();
    expect(r).toMatchObject({ isInTrial: true, trialEndTime: 'created-end' });
    const arg = upsert.upsert.mock.calls[0][0] as { user_id: string; trial_end_time: string; is_trial_used: boolean };
    expect(arg.user_id).toBe('u1');
    expect(arg.is_trial_used).toBe(false);
    const delta = new Date(arg.trial_end_time).getTime() - before;
    expect(Math.abs(delta - 48 * 3_600_000)).toBeLessThan(60_000);
  });

  it('falls back safely on query or insert errors', async () => {
    from.mockImplementation(
      fromByTable({
        subscriptions: [queryBuilder({ data: null })],
        user_trials: [queryBuilder({ data: null, error: { code: 'XX', message: 'db' } })],
      })
    );
    expect(await run()).toEqual({ isInTrial: false, trialEndTime: null, isLoading: false });

    from.mockImplementation(
      fromByTable({
        subscriptions: [queryBuilder({ data: null })],
        user_trials: [queryBuilder({ data: null }), queryBuilder({ data: null, error: { message: 'ins' } })],
      })
    );
    expect((await run()).isInTrial).toBe(false);
  });
});
