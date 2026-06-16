import { Injectable, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentRequest, PaymentResponse, IpnPayload, IpnResult, PaymentCapabilities } from './payments.types';

/**
 * Stripe payment gateway integration.
 *
 * Supports PaymentIntents, webhook verification, subscriptions,
 * refunds, and multi-currency payments.
 *
 * Docs: https://stripe.com/docs/api
 *
 * NOTE: Stripe object shapes are typed via minimal local interfaces below
 * to avoid namespace-resolution issues (Stripe.PaymentIntent) that can occur
 * when the default import is inferred as the constructor type only.
 */

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

// ── Minimal Stripe object shapes (only the fields we actually read) ──────────

interface StripePaymentIntentShape {
  id: string;
  amount: number;
  amount_received: number;
  currency: string;
  status: string;
  last_payment_error?: { message?: string } | null;
}

interface StripeChargeShape {
  id: string;
  payment_intent: string | { id: string } | null;
  amount_refunded: number;
}

interface StripeInvoiceShape {
  id: string;
  payment_intent: string | { id: string } | null;
  amount_paid: number;
  amount_due: number;
}

/** Safely normalize a Stripe expandable reference to its string id. */
function toId(ref: string | { id: string } | null | undefined): string | undefined {
  if (!ref) return undefined;
  return typeof ref === 'string' ? ref : ref.id;
}

@Injectable()
export class StripeService implements OnModuleInit {
  private config: StripeConfig | null = null;
  private client: any = null;

  onModuleInit() {
    const secretKey = process.env['STRIPE_SECRET_KEY'];
    const publishableKey = process.env['STRIPE_PUBLISHABLE_KEY'];
    if (secretKey && publishableKey) {
      this.configure({
        secretKey,
        publishableKey,
        webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] || '',
      });
    }
  }

  /** Configure the gateway with Stripe credentials */
  configure(config: StripeConfig) {
    this.config = config;
    this.client = new Stripe(config.secretKey, {
      apiVersion: '2026-05-27.dahlia',
      typescript: true,
    });
  }

  get isConfigured(): boolean {
    return this.client !== null && this.config !== null;
  }

  get capabilities(): PaymentCapabilities {
    return {
      gateway: 'stripe',
      name: 'Stripe',
      supportedCurrencies: [
        'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD', 'HKD',
        'VND', 'THB', 'MYR', 'IDR', 'PHP', 'KRW', 'INR',
      ],
      paymentMethods: ['card', 'wallet', 'bank_transfer', 'paynow', 'grabpay'],
    };
  }

  /**
   * Create a Stripe PaymentIntent.
   * Returns a client_secret for frontend confirmation.
   */
  async createPayment(req: PaymentRequest): Promise<PaymentResponse> {
    if (!this.client || !this.config) {
      return {
        success: false,
        gateway: 'stripe',
        errorMessage:
          'Stripe gateway not configured. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY env vars.',
      };
    }

    try {
      const amountInCents = Math.round(req.amount * 100); // Stripe uses smallest currency unit

      const paymentIntent = await this.client.paymentIntents.create({
        amount: amountInCents,
        currency: req.currency.toLowerCase(),
        description: req.description.slice(0, 200),
        metadata: {
          orderId: req.orderId,
          invoiceId: req.invoiceId || '',
          ...(req.metadata as Record<string, string>),
        },
        ...(req.returnUrl ? { return_url: req.returnUrl } : {}),
      });

      return {
        success: true,
        paymentUrl: paymentIntent.next_action?.redirect_to_url?.url || undefined,
        transactionId: paymentIntent.id,
        gateway: 'stripe',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Stripe error';
      return {
        success: false,
        gateway: 'stripe',
        errorMessage: message,
      };
    }
  }

  /**
   * Handle Stripe webhook event.
   * Verify signature and process the event payload.
   */
  async handleIpn(payload: IpnPayload): Promise<IpnResult> {
    if (!this.client || !this.config) {
      return { success: false, status: 'failed', errorMessage: 'Stripe not configured' };
    }

    try {
      const raw = payload.raw;
      const signature = raw['stripe_signature'] as string;

      // Verify webhook signature
      if (this.config.webhookSecret && signature) {
        const event = this.client.webhooks.constructEvent(
          typeof raw['body'] === 'string' ? raw['body'] : JSON.stringify(raw['body'] || raw),
          signature,
          this.config.webhookSecret,
        );

        switch (event.type) {
          case 'payment_intent.succeeded': {
            const pi = event.data.object as unknown as StripePaymentIntentShape;
            return {
              success: true,
              gatewayTxId: pi.id,
              amount: pi.amount_received / 100,
              status: 'success',
            };
          }

          case 'payment_intent.payment_failed': {
            const pi = event.data.object as unknown as StripePaymentIntentShape;
            return {
              success: false,
              gatewayTxId: pi.id,
              amount: pi.amount / 100,
              status: 'failed',
              errorMessage: pi.last_payment_error?.message || 'Payment failed',
            };
          }

          case 'charge.refunded': {
            const charge = event.data.object as unknown as StripeChargeShape;
            return {
              success: true,
              gatewayTxId: toId(charge.payment_intent),
              amount: charge.amount_refunded / 100,
              status: 'refunded',
            };
          }

          case 'invoice.paid': {
            const invoice = event.data.object as unknown as StripeInvoiceShape;
            return {
              success: true,
              gatewayTxId: toId(invoice.payment_intent),
              amount: invoice.amount_paid / 100,
              status: 'success',
            };
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as unknown as StripeInvoiceShape;
            return {
              success: false,
              gatewayTxId: toId(invoice.payment_intent),
              amount: invoice.amount_due / 100,
              status: 'failed',
              errorMessage: 'Invoice payment failed',
            };
          }

          default:
            return { success: false, status: 'failed', errorMessage: `Unhandled event: ${event.type}` };
        }
      }

      // Fallback: no webhook secret configured — trust raw payload
      const obj = (raw['data'] as Record<string, any> | undefined)?.['object'] as Record<string, any> | undefined;
      const piId = obj?.['id'] as string | undefined;
      const amount = obj?.['amount'] as number | undefined;
      const status = raw['type'] === 'payment_intent.succeeded' ? 'success' : 'failed';

      return {
        success: status === 'success',
        gatewayTxId: piId,
        amount: amount ? amount / 100 : undefined,
        status: status as 'success' | 'failed',
        errorMessage: status === 'failed' ? (obj?.['last_payment_error']?.['message'] as string | undefined) : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook verification failed';
      return { success: false, status: 'failed', errorMessage: message };
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Refund a Stripe PaymentIntent (full or partial).
   */
  async refund(paymentIntentId: string, amount?: number): Promise<PaymentResponse> {
    if (!this.client) {
      return {
        success: false,
        gateway: 'stripe',
        errorMessage: 'Stripe not configured',
      };
    }

    try {
      const refund = await this.client.refunds.create({
        payment_intent: paymentIntentId,
        ...(amount ? { amount: Math.round(amount * 100) } : {}),
      });

      return {
        success: refund.status === 'succeeded',
        transactionId: refund.id,
        gateway: 'stripe',
        errorMessage: refund.status !== 'succeeded' ? `Refund status: ${refund.status}` : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refund failed';
      return { success: false, gateway: 'stripe', errorMessage: message };
    }
  }

  /**
   * Create a Stripe Checkout Session for one-time or subscription payments.
   */
  async createCheckoutSession(params: {
    mode: 'payment' | 'subscription';
    amount: number;
    currency: string;
    productName: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentResponse> {
    if (!this.client) {
      return { success: false, gateway: 'stripe', errorMessage: 'Stripe not configured' };
    }

    try {
      const session = await this.client.checkout.sessions.create({
        mode: params.mode,
        line_items: [
          {
            price_data: {
              currency: params.currency.toLowerCase(),
              product_data: { name: params.productName },
              unit_amount: Math.round(params.amount * 100),
            },
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        customer_email: params.customerEmail,
        metadata: params.metadata,
      });

      return {
        success: true,
        paymentUrl: session.url || undefined,
        transactionId: session.id,
        gateway: 'stripe',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout session creation failed';
      return { success: false, gateway: 'stripe', errorMessage: message };
    }
  }

  /**
   * Retrieve a PaymentIntent status from Stripe.
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    amount: number;
    currency: string;
  } | null> {
    if (!this.client) return null;

    try {
      const pi = await this.client.paymentIntents.retrieve(paymentIntentId);
      return {
        status: pi.status,
        amount: pi.amount / 100,
        currency: pi.currency.toUpperCase(),
      };
    } catch {
      return null;
    }
  }

  /**
   * List recent Stripe payments for reconciliation.
   */
  async listRecentPayments(limit = 20): Promise<StripePaymentIntentShape[]> {
    if (!this.client) return [];
    const result = await this.client.paymentIntents.list({ limit });
    return result.data as unknown as StripePaymentIntentShape[];
  }
}
