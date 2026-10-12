import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('stripe', () => ({
  default: vi.fn(function (this: Record<string, unknown>, key: string) {
    this.key = key;
  }),
}));

describe('stripe-server', () => {
  beforeEach(() => vi.resetModules());

  it('throws when STRIPE_SECRET_KEY is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { getStripeClient } = await import('@/utils/stripe-server');
    expect(() => getStripeClient()).toThrow('Missing env.STRIPE_SECRET_KEY');
  });

  it('creates the client once and reuses it', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const { getStripeClient } = await import('@/utils/stripe-server');
    const a = getStripeClient();
    expect(getStripeClient()).toBe(a);
    expect((a as unknown as { key: string }).key).toBe('sk_test_123');
  });

  it('validates the webhook secret', async () => {
    const { getStripeWebhookSecret } = await import('@/utils/stripe-server');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect(() => getStripeWebhookSecret()).toThrow('Missing env.STRIPE_WEBHOOK_SECRET');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_1');
    expect(getStripeWebhookSecret()).toBe('whsec_1');
  });
});
