import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromByTable, queryBuilder } from '../helpers';

const from = vi.fn();
const stripe = {
  webhooks: { constructEvent: vi.fn() },
  subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
};

vi.mock('@/utils/supabase-admin', () => ({ supabaseAdmin: { from: (...a: unknown[]) => from(...a) } }));
vi.mock('@/utils/stripe-server', () => ({
  getStripeClient: () => stripe,
  getStripeWebhookSecret: () => 'whsec_test',
}));

import { POST } from '@/app/api/stripe/webhook/route';

const hook = (headers: Record<string, string> = { 'stripe-signature': 'sig' }) =>
  POST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{}', headers }) as any);

const PERIOD_END = 1_900_000_000;
const sub = (over = {}) => ({
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  cancel_at_period_end: false,
  current_period_end: PERIOD_END,
  items: { data: [{ price: { id: 'price_1' } }] },
  ...over,
});
const event = (type: string, object: unknown) => stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_1', type, data: { object } });
const session = (over = {}) => ({ id: 'cs_1', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1', ...over });

beforeEach(() => {
  from.mockReset();
  stripe.webhooks.constructEvent.mockReset();
  stripe.subscriptions.retrieve.mockReset();
  stripe.subscriptions.cancel.mockReset();
});

describe('POST /api/stripe/webhook', () => {
  it('400s without a stripe-signature header', async () => {
    const res = await hook({});
    expect(res.status).toBe(400);
    expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it('400s on invalid signatures', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    expect((await hook()).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('acknowledges unhandled event types', async () => {
    event('invoice.paid', {});
    expect(await (await hook()).json()).toEqual({ received: true });
  });

  it('checkout.session.completed inserts a subscription', async () => {
    const insert = queryBuilder({ data: { id: 'row1' } });
    from.mockImplementation(
      fromByTable({
        subscriptions: [
          queryBuilder({ data: null, error: { code: 'PGRST116' } }), // duplicate check
          queryBuilder({ data: null, error: { code: 'PGRST116' } }), // existing check
          insert,
        ],
      })
    );
    event('checkout.session.completed', session());
    stripe.subscriptions.retrieve.mockResolvedValue(sub());
    expect(await (await hook()).json()).toEqual({ received: true });
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', price_id: 'price_1' })
    );
  });

  it('checkout.session.completed updates an existing row', async () => {
    const update = queryBuilder({ data: { id: 'row1' } });
    from.mockImplementation(
      fromByTable({
        subscriptions: [
          queryBuilder({ data: null }),
          queryBuilder({ data: { id: 'row1', stripe_subscription_id: 'sub_1' } }),
          update,
        ],
      })
    );
    event('checkout.session.completed', session());
    stripe.subscriptions.retrieve.mockResolvedValue(sub());
    expect((await hook()).status).toBe(200);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('blocks a duplicate active subscription and cancels the new one', async () => {
    const insert = queryBuilder();
    from.mockImplementation(fromByTable({ subscriptions: [queryBuilder({ data: { id: 'existing' } }), insert] }));
    event('checkout.session.completed', session());
    const res = await hook();
    expect(await res.json()).toMatchObject({ status: 'blocked' });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
    expect(insert.insert).not.toHaveBeenCalled();
  });

  it('400s on incomplete checkout sessions', async () => {
    from.mockImplementation(fromByTable({ subscriptions: [queryBuilder({ data: null })] }));
    event('checkout.session.completed', session({ client_reference_id: null }));
    expect((await hook()).status).toBe(400);
  });

  it('400s when creating the subscription fails', async () => {
    from.mockImplementation(
      fromByTable({ subscriptions: [queryBuilder({ data: null }), queryBuilder({ data: null }), queryBuilder({ error: { message: 'insert failed' } })] })
    );
    event('checkout.session.completed', session());
    stripe.subscriptions.retrieve.mockResolvedValue(sub());
    expect((await hook()).status).toBe(400);
  });

  it('customer.subscription.created is acknowledged without writing', async () => {
    event('customer.subscription.created', sub());
    expect(await (await hook()).json()).toEqual({ received: true });
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['customer.subscription.updated', 'customer.subscription.deleted'])(
    '%s syncs status to the DB',
    async (type) => {
      const update = queryBuilder();
      from.mockImplementation(fromByTable({ subscriptions: [update] }));
      event(type, sub({ status: type.endsWith('deleted') ? 'canceled' : 'past_due', cancel_at_period_end: true }));
      expect((await hook()).status).toBe(200);
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: type.endsWith('deleted') ? 'canceled' : 'past_due',
          cancel_at_period_end: true,
          current_period_end: new Date(PERIOD_END * 1000).toISOString(),
        })
      );
      expect(update.eq).toHaveBeenCalledWith('stripe_subscription_id', 'sub_1');
    }
  );
});
