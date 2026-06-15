import { Controller, Get, Post, Body, Headers, Query, Param, BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('capabilities')
  capabilities() {
    return this.payments.getCapabilities();
  }

  /**
   * Create a payment. Returns a redirect URL.
   */
  @Post('create')
  async createPayment(
    @Body() body: {
      invoiceId?: string;
      tenantId: string;
      accountId: string;
      amount: number;
      currency?: string;
      description?: string;
      gateway?: string;
      returnUrl: string;
    },
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!body.tenantId || !body.accountId || !body.amount || !body.returnUrl) {
      throw new BadRequestException('Missing required fields: tenantId, accountId, amount, returnUrl');
    }

    return this.payments.createPayment({
      invoiceId: body.invoiceId,
      tenantId: body.tenantId,
      accountId: body.accountId,
      amount: body.amount,
      currency: body.currency || 'VND',
      description: body.description || 'AIFUT payment',
      gateway: body.gateway,
      returnUrl: body.returnUrl,
      ipAddress: forwardedFor,
      userAgent,
    });
  }

  /**
   * VNPay IPN endpoint (called by VNPay server after payment).
   * Must respond quickly with a simple confirmation.
   */
  @Post('vnpay/ipn')
  async vnpayIpn(@Body() body: Record<string, any>) {
    const result = await this.payments.handleVnpayIpn(body);

    // VNPay expects specific IPN response format
    const rspCode = result.success ? '00' : '99';
    return {
      RspCode: rspCode,
      Message: result.success ? 'Confirm Success' : (result.errorMessage || 'Payment failed'),
    };
  }

  /**
   * VNPay return URL (user is redirected here after payment).
   */
  @Get('vnpay/return')
  async vnpayReturn(@Query() query: Record<string, any>) {
    const result = await this.payments.handleVnpayIpn(query);

    // Redirect user based on payment result
    if (result.success) {
      return { status: 'success', message: 'Payment completed successfully', transactionId: result.gatewayTxId };
    }
    return { status: 'failed', message: result.errorMessage || 'Payment failed' };
  }

  /**
   * MoMo IPN endpoint (called by MoMo server after payment).
   */
  @Post('momo/ipn')
  async momoIpn(@Body() body: Record<string, any>) {
    const result = await this.payments.handleMomoIpn(body);
    return { status: result.success ? 0 : 1, message: result.success ? 'Success' : result.errorMessage };
  }

  /**
   * MoMo return URL (user is redirected here after payment).
   */
  @Get('momo/return')
  async momoReturn(@Query() query: Record<string, any>) {
    const result = await this.payments.handleMomoIpn(query);
    if (result.success) {
      return { status: 'success', message: 'Payment completed successfully', transactionId: result.gatewayTxId };
    }
    return { status: 'failed', message: result.errorMessage || 'Payment failed' };
  }

  /**
   * Get payment history for a tenant.
   */
  @Get('history/:tenantId')
  async history(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return this.payments.getPaymentHistory(tenantId, Number(limit) || 20, Number(offset) || 0);
  }
}
