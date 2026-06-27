import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import type { Currency } from './billing.constants';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('fx-rate')
  getFxRate(@Query('from') from: Currency, @Query('to') to: Currency) {
    return this.billingService.getFxRate(from || 'VND', to || 'VND');
  }

  @Post('account')
  async getOrCreateAccount(
    @Body('tenantId') tenantId: string,
    @Body('preferredCurrency') preferredCurrency?: Currency,
  ) {
    return this.billingService.getOrCreateAccount(tenantId, preferredCurrency);
  }

  @Get('invoices')
  async getInvoices(@Query('tenantId') tenantId: string) {
    return this.billingService.getInvoices(tenantId || 'playground');
  }

  @Post('subscribe-pay')
  async subscribeAndPay(
    @Body('tenantId') tenantId: string,
    @Body('planKey') planKey: string,
    @Body('gateway') gateway?: string,
  ) {
    return this.billingService.subscribeAndPay(tenantId, planKey, gateway || 'vnpay');
  }
}
