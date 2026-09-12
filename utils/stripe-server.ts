import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error('Missing env.STRIPE_SECRET_KEY');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(apiKey);
  }

  return stripeClient;
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('Missing env.STRIPE_WEBHOOK_SECRET');
  }

  return webhookSecret;
}
