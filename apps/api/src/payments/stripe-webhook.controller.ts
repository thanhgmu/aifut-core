import { Controller, Post, Req, Body, Headers, HttpCode, Logger, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsWebhookService } from './payments-webhook.service';

/**
 * StripeWebhookController
 *
 * Exposes asynchronous payment confirmation endpoints under `/payments/webhook`:
 *  - POST /payments/webhook/stripe : signed Stripe webhook events
 *  - POST /payments/webhook/momo   : MoMo IPN callback
 *
 * Stripe signature verification requires the RAW request body. The Nest app must
 * be bootstrapped with `NestFactory.create(AppModule, { rawBody: true })` so that
 * `req.rawBody` is available. We fall back to the parsed body only when no
 * webhook secret is configured (dev/test).
 */
@Controller('payments/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly webhooks: PaymentsWebhookService) {}

  /**
   * Stripe webhook receiver. Always respond 200 quickly once received & verified
   * so Stripe does not retry; activation outcome is included for observability.
   */
  @Post('stripe')
  @HttpCode(200)
  async stripe(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
    @Body() body: Record<string, any>,
  ) {
    // Prefer the raw body for signature verification; fall back to a stable
    // re-serialization only when no secret is configured (dev mode).
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});

    const verified = this.webhooks.verifyStripeSignature(rawBody, signature);
    if (!verified) {
      this.logger.warn('Stripe webhook signature verification failed');
      throw new BadRequestException('Invalid Stripe signature');
    }

    let event: Record<string, any>;
    try {
      event = req.rawBody ? JSON.parse(rawBody) : body;
    } catch {
      throw new BadRequestException('Invalid Stripe payload');
    }

    const result = await this.webhooks.handleStripeEvent(event);
    return { received: result.received, activated: result.activated, type: result.type };
  }

  /**
   * MoMo IPN receiver (alternate canonical path that activates quota via the
   * shared activator). The legacy `/payments/momo/ipn` route remains for
   * backwards compatibility.
   */
  @Post('momo')
  @HttpCode(200)
  async momo(@Body() body: Record<string, any>) {
    const result = await this.webhooks.handleMomoIpn(body);
    // MoMo expects { status, message } shaped acknowledgement.
    return {
      status: result.success ? 0 : 1,
      message: result.success ? 'Success' : result.errorMessage,
      activated: result.activated ?? false,
    };
  }
}
