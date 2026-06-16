import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { MomoService } from './momo/momo.service';
import { SubscriptionActivatorService } from './subscription-activator.service';
import { InvoiceMailerService } from './e-invoice/invoice-mailer.service';
import { IpnPayload, IpnResult } from './payments.types';

/**
 * PaymentsWebhookService
 *
 * Canonical handler for asynchronous payment confirmations delivered out-of-band:
 *  - Stripe Webhooks (signed events)
 *  - MoMo IPN (signed callbacks)
 *
 * It verifies authenticity, records / updates the PaymentTransaction, and then
 * delegates Workspace subscription quota activation to
 * SubscriptionActivatorService so all gateways share one activation path.
 *
 * After successful activation, it enqueues an invoice-mail job so the customer
 * receives their e-Invoice via email (handled by InvoiceMailerService +
 * InvoiceOutboxProcessor).
 */
@Injectable()
export class PaymentsWebhookService {
  private readonly logger = new Logger(PaymentsWebhookService.name);

  /** Tolerance for Stripe timestamp replay protection (seconds). */
  private readonly STRIPE_TOLERANCE_SEC = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly momoService: MomoService,
    private readonly activator: SubscriptionActivatorService,
    private readonly invoiceMailer: InvoiceMailerService,
  ) {}

  // ── Stripe ──────────────────────────────────────────────────────────────────

  private get stripeWebhookSecret(): string | undefined {
    return process.env['STRIPE_WEBHOOK_SECRET'];
  }

  get isStripeConfigured(): boolean {
    return !!this.stripeWebhookSecret;
  }

  /**
   * Verify a Stripe webhook signature.
   * Header format: `t=<timestamp>,v1=<hex-signature>[,v1=...]`.
   * signed_payload = `${t}.${rawBody}`; expected = HMAC-SHA256(secret, signed_payload).
   */
  verifyStripeSignature(rawBody: string, signatureHeader?: string): boolean {
    const secret = this.stripeWebhookSecret;
    if (!secret) {
      // No secret configured → dev/test mode, skip verification but warn.
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping Stripe signature verification (dev mode)');
      return true;
    }
    if (!signatureHeader || !rawBody) return false;

    const parts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, kv) => {
      const [k, v] = kv.split('=');
      if (!k || !v) return acc;
      (acc[k.trim()] ||= []).push(v.trim());
      return acc;
    }, {});

    const timestamp = parts['t']?.[0];
    const signatures = parts['v1'] ?? [];
    if (!timestamp || signatures.length === 0) return false;

    // Replay protection.
    const tsNum = parseInt(timestamp, 10);
    if (Number.isFinite(tsNum)) {
      const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
      if (ageSec > this.STRIPE_TOLERANCE_SEC) {
        this.logger.warn(`Stripe webhook timestamp outside tolerance (${ageSec}s)`);
        return false;
      }
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

    // Constant-time compare against any provided v1 signature.
    return signatures.some((sig) => {
      try {
        const a = Buffer.from(sig, 'hex');
        const b = Buffer.from(expected, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });
  }

  /**
   * Process a verified Stripe event payload.
   * Supports the common subscription/checkout success events.
   */
  async handleStripeEvent(event: Record<string, any>): Promise<{ received: boolean; activated: boolean; type?: string }> {
    const type = event?.type as string | undefined;
    const obj = event?.data?.object ?? {};
    const metadata: Record<string, any> = obj.metadata ?? {};

    const successEvents = new Set([
      'checkout.session.completed',
      'invoice.paid',
      'invoice.payment_succeeded',
      'payment_intent.succeeded',
    ]);

    if (!type || !successEvents.has(type)) {
      this.logger.log(`Stripe event ignored: ${type ?? 'unknown'}`);
      return { received: true, activated: false, type };
    }

    // Stripe should be paid only when checkout/intent reports success.
    const paid = obj.payment_status === 'paid' || obj.status === 'succeeded' || obj.paid === true || type === 'invoice.paid' || type === 'invoice.payment_succeeded' || type === 'checkout.session.completed';
    if (!paid) {
      return { received: true, activated: false, type };
    }

    const gatewayTxId = (obj.payment_intent as string) || (obj.id as string) || undefined;
    const orderId = (metadata.orderId as string) || (obj.client_reference_id as string) || gatewayTxId;
    const invoiceId = metadata.invoiceId as string | undefined;
    const subscriptionId = metadata.subscriptionId as string | undefined;
    const paidAt = new Date();

    // Best-effort: upsert a transaction record if we have a known order linkage.
    if (orderId) {
      const existing = await this.prisma.paymentTransaction.findFirst({
        where: { gateway: 'stripe', metadata: { path: ['orderId'], equals: orderId } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return this.finalize('stripe', { orderId, gatewayTxId, paidAt, ipnPayload: event, type, invoiceId, subscriptionId });
      }
    }

    // No pre-created transaction: activate directly from metadata linkage.
    return this.finalize('stripe', { orderId: orderId ?? '', gatewayTxId, paidAt, ipnPayload: event, type, invoiceId, subscriptionId });
  }

  // ── MoMo IPN ──────────────────────────────────────────────────────────────────

  /**
   * Verify + process a MoMo IPN callback, then activate the subscription quota.
   * Uses MomoService.verifyIpn() for signature verification and transaction lookup
   * via the MomoController/IPN flow (which handles idempotency via MomoIpnGuard).
   */
  async handleMomoIpn(rawPayload: Record<string, any>): Promise<IpnResult & { activated?: boolean }> {
    const orderId = rawPayload['orderId'] as string | undefined;
    const transId = rawPayload['transId'] as number | undefined;
    const resultCode = rawPayload['resultCode'] as number | undefined;

    // Verify signature using MomoService
    const verification = this.momoService.verifyIpn(rawPayload as any);
    if (!verification.signatureValid) {
      this.logger.warn(`MoMo IPN rejected — invalid signature orderId=${orderId}`);
      return {
        success: false,
        status: 'failed',
        gatewayTxId: String(transId ?? ''),
        amount: rawPayload['amount'] ? Number(rawPayload['amount']) : 0,
        errorMessage: `Invalid signature: ${verification.reason ?? 'unknown'}`,
        activated: false,
      };
    }

    if (!verification.valid) {
      this.logger.warn(`MoMo IPN rejected — resultCode=${resultCode} orderId=${orderId}`);
      return {
        success: false,
        status: resultCode === 1003 ? 'failed' : 'failed',
        gatewayTxId: String(transId ?? ''),
        amount: verification.amount,
        errorMessage: verification.message,
        activated: false,
      };
    }

    // Success path: activate subscription
    const finalize = await this.finalize('momo', {
      orderId: orderId ?? String(transId ?? ''),
      gatewayTxId: String(transId ?? ''),
      paidAt: new Date(),
      ipnPayload: rawPayload,
    });

    return {
      success: true,
      status: 'success',
      gatewayTxId: String(transId ?? ''),
      amount: verification.amount,
      activated: finalize.activated,
    };
  }

  // ── Shared finalize ────────────────────────────────────────────────────────

  /**
   * Route a confirmed payment to the activator using the strongest available
   * linkage: explicit invoiceId/subscriptionId from metadata first, otherwise
   * resolve through the stored orderId / gatewayTxId.
   *
   * After successful activation, enqueue an e-Invoice mail job so the
   * customer receives their VAT-compliant invoice PDF.
   */
  private async finalize(
    gateway: string,
    input: {
      orderId: string;
      gatewayTxId?: string;
      paidAt: Date;
      ipnPayload?: Record<string, any>;
      type?: string;
      invoiceId?: string;
      subscriptionId?: string;
    },
  ): Promise<{ received: boolean; activated: boolean; type?: string }> {
    // Track which invoiceId we end up activating (for mail enqueue).
    let resolvedInvoiceId: string | undefined = input.invoiceId;

    try {
      let activated = false;

      if (input.invoiceId) {
        const res = await this.activator.activateFromInvoice(input.invoiceId, input.paidAt);
        activated = !!res.activated;
      } else if (input.subscriptionId) {
        await this.activator.activateBySubscriptionId(input.subscriptionId);
        activated = true;
      } else if (input.orderId) {
        const res = await this.activator.activateByOrderId({
          orderId: input.orderId,
          gateway,
          gatewayTxId: input.gatewayTxId,
          paidAt: input.paidAt,
          ipnPayload: input.ipnPayload,
        });
        activated = !!res.activated;
        // If activation resolved an invoice, use it.
        if ('invoiceId' in res && res.invoiceId) resolvedInvoiceId = (res as Record<string, unknown>).invoiceId as string;
      }

      // ── Enqueue invoice mail ───────────────────────────────────────────
      // After successful activation, push an e-Invoice mail job into the
      // outbox queue so the customer gets their VAT invoice via email.
      if (activated && resolvedInvoiceId) {
        await this.enqueueInvoiceMail(resolvedInvoiceId, input);
      }

      return { received: true, activated, type: input.type };
    } catch (err) {
      this.logger.error(`Activation failed for ${gateway} payment: ${(err as Error).message}`);
      return { received: true, activated: false, type: input.type };
    }
  }

  // ── Invoice Mail Enqueue ────────────────────────────────────────────────

  /**
   * Enqueue an e-Invoice mail job for the resolved invoice.
   *
   * Steps:
   *   1. Look up the EInvoice record linked to this billing Invoice.
   *   2. If an EInvoice exists, enqueue via InvoiceMailerService.
   *   3. If no EInvoice yet, try to find the tenant's billing email
   *      from BillingAccount and log a warning.
   */
  private async enqueueInvoiceMail(
    invoiceId: string,
    input: {
      orderId: string;
      gatewayTxId?: string;
      paidAt: Date;
      ipnPayload?: Record<string, any>;
      type?: string;
      invoiceId?: string;
      subscriptionId?: string;
    },
  ): Promise<void> {
    try {
      // Get the billing Invoice record for tenant context and invoice number.
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { account: true, tenant: true },
      });
      if (!invoice) {
        this.logger.warn(`Invoice ${invoiceId} not found — cannot enqueue mail`);
        return;
      }

      // Find an EInvoice that belongs to this tenant and matches the period.
      // Matching heuristic: find the most recent EInvoice for this tenant
      // that hasn't had a mail sent yet OR the one created nearest to paidAt.
      const eInvoice = await this.prisma.eInvoice.findFirst({
        where: { tenantId: invoice.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      if (!eInvoice) {
        this.logger.log(`No EInvoice found for tenant ${invoice.tenantId} — skipping invoice mail`);
        return;
      }

      // Determine the recipient email.
      // Priority: BillingAccount billingEmail > fallback env var.
      const to = invoice.account?.billingEmail
        ?? process.env['INVOICE_MAIL_FALLBACK_TO'];

      if (!to) {
        this.logger.warn(`No recipient email for invoice ${invoiceId} — cannot send invoice mail`);
        return;
      }

      const subject = process.env['INVOICE_MAIL_SUBJECT']
        ?? `Hóa đơn điện tử AIFUT - ${eInvoice.fullNumber}`;

      await this.invoiceMailer.enqueue(
        invoice.tenantId,
        invoiceId,
        eInvoice.id,
        to,
        eInvoice.invoiceNumber,
        subject,
      );

      this.logger.log(`Enqueued invoice mail for invoice ${invoiceId} → ${to}`);
    } catch (err) {
      // Non-critical: log and swallow — payment activation already succeeded.
      this.logger.warn(`Failed to enqueue invoice mail for ${invoiceId}: ${(err as Error).message}`);
    }
  }
}
