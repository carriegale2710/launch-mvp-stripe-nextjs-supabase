import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(function (this: any) {
    this.emails = { send };
  }),
}));
vi.mock('@react-email/components', () => ({ render: vi.fn(async () => '<html/>') }));
vi.mock('@/emails/templates', () => ({
  WelcomeEmail: vi.fn(() => null),
  BillingConfirmationEmail: vi.fn(() => null),
  CancellationConfirmationEmail: vi.fn(() => null),
}));

async function load() {
  return import('@/services/emailService');
}

describe('emailService', () => {
  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    vi.stubEnv('RESEND_API_KEY', 're_test');
  });

  it('returns a controlled error when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const { sendWelcomeEmail } = await load();
    const res = await sendWelcomeEmail('a@b.co', {} as any);
    expect(res).toEqual({
      success: false,
      error: 'RESEND_API_KEY environment variable is not configured',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the welcome email', async () => {
    send.mockResolvedValue({ data: { id: 'e1' }, error: null });
    const { sendWelcomeEmail } = await load();
    expect(await sendWelcomeEmail('a@b.co', {} as any)).toEqual({ success: true, emailId: 'e1' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['a@b.co'], html: '<html/>', subject: expect.stringContaining('Welcome') })
    );
  });

  it('sends the billing confirmation email', async () => {
    send.mockResolvedValue({ data: { id: 'e2' }, error: null });
    const { sendBillingConfirmationEmail } = await load();
    const res = await sendBillingConfirmationEmail('a@b.co', {} as any);
    expect(res.emailId).toBe('e2');
    expect(send.mock.calls[0][0].subject).toContain('Billing setup complete');
  });

  it('picks the cancellation subject by isAccountDeletion', async () => {
    send.mockResolvedValue({ data: { id: 'e3' }, error: null });
    const { sendCancellationEmail } = await load();
    await sendCancellationEmail('a@b.co', { isAccountDeletion: true } as any);
    await sendCancellationEmail('a@b.co', { isAccountDeletion: false } as any);
    expect(send.mock.calls[0][0].subject).toBe('Your account has been deleted');
    expect(send.mock.calls[1][0].subject).toBe('Your subscription has been cancelled');
  });

  it('reports Resend API errors and thrown errors', async () => {
    const { sendWelcomeEmail, sendBillingConfirmationEmail, sendCancellationEmail } = await load();
    send.mockResolvedValue({ data: null, error: { message: 'bad' } });
    expect(await sendWelcomeEmail('a@b.co', {} as any)).toEqual({ success: false, error: 'bad' });
    expect(await sendBillingConfirmationEmail('a@b.co', {} as any)).toEqual({ success: false, error: 'bad' });
    expect(await sendCancellationEmail('a@b.co', {} as any)).toEqual({ success: false, error: 'bad' });
    send.mockRejectedValue(new Error('network'));
    expect(await sendWelcomeEmail('a@b.co', {} as any)).toEqual({ success: false, error: 'network' });
  });

  it('routes sendTransactionalEmail by type and rejects unknown types', async () => {
    send.mockResolvedValue({ data: { id: 'x' }, error: null });
    const { sendTransactionalEmail } = await load();
    await sendTransactionalEmail('welcome', 'a@b.co', {});
    await sendTransactionalEmail('billing_confirmation', 'a@b.co', {});
    await sendTransactionalEmail('cancellation', 'a@b.co', {});
    expect(send.mock.calls.map((c) => c[0].subject)).toEqual([
      expect.stringContaining('Welcome'),
      expect.stringContaining('Billing'),
      expect.stringContaining('cancelled'),
    ]);
    expect(await sendTransactionalEmail('nope' as any, 'a@b.co', {})).toEqual({
      success: false,
      error: 'Unknown email type: nope',
    });
  });
});
