import { Injectable } from '@nestjs/common';
import { PaymentRequest, PaymentResponse, IpnPayload, IpnResult, PaymentCapabilities } from './payments.types';
import * as crypto from 'crypto';

/**
 * MoMo payment gateway integration.
 *
 * MoMo is the leading e-wallet in Vietnam with 30M+ users.
 * Supports QR, wallet, and ATM card payments.
 *
 * Specification: https://developers.momo.vn/
 */

export interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string;
  returnUrl: string;
  ipnUrl: string;
}

@Injectable()
export class MomoGateway {
  private config: MomoConfig | null = null;

  /** Auto-configure from env */
  onModuleInit() {
    const partnerCode = process.env['MOMO_PARTNER_CODE'];
    const accessKey = process.env['MOMO_ACCESS_KEY'];
    const secretKey = process.env['MOMO_SECRET_KEY'];
    if (partnerCode && accessKey && secretKey) {
      this.config = {
        partnerCode,
        accessKey,
        secretKey,
        endpoint: process.env['MOMO_ENDPOINT'] || 'https://test-payment.momo.vn/v2/gateway/api/create',
        returnUrl: process.env['MOMO_RETURN_URL'] || 'http://localhost:3000/payment/return',
        ipnUrl: process.env['MOMO_IPN_URL'] || 'http://localhost:3002/payments/momo/ipn',
      };
    }
  }

  get isConfigured(): boolean {
    return this.config !== null;
  }

  get capabilities(): PaymentCapabilities {
    return {
      gateway: 'momo',
      name: 'MoMo',
      supportedCurrencies: ['VND'],
      paymentMethods: ['qr', 'wallet', 'atm'],
    };
  }

  /**
   * Create a MoMo payment request.
   */
  async createPayment(req: PaymentRequest): Promise<PaymentResponse> {
    if (!this.config) {
      return {
        success: false,
        gateway: 'momo',
        errorMessage: 'MoMo gateway not configured. Set MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY.',
      };
    }

    const { config } = this;
    const requestId = `MOMO-${Date.now()}`;
    const orderId = req.orderId;

    const rawSignature = `accessKey=${config.accessKey}&amount=${Math.round(req.amount)}&extraData=&ipnUrl=${config.ipnUrl}&orderId=${orderId}&orderInfo=${encodeURIComponent(req.description.slice(0, 100))}&partnerCode=${config.partnerCode}&redirectUrl=${config.returnUrl}&requestId=${requestId}&requestType=captureWallet`;

    const signature = crypto.createHmac('sha256', config.secretKey).update(rawSignature).digest('hex');

    const payload = {
      partnerCode: config.partnerCode,
      partnerName: 'AIFUT',
      requestId,
      amount: Math.round(req.amount),
      orderId,
      orderInfo: req.description.slice(0, 100),
      redirectUrl: config.returnUrl,
      ipnUrl: config.ipnUrl,
      requestType: 'captureWallet',
      extraData: '',
      lang: 'vi',
      signature,
    };

    return {
      success: true,
      // In production, POST payload to config.endpoint and read payUrl from response
      // For now, return the payload structure for the frontend to POST
      paymentUrl: `${config.endpoint}?orderId=${orderId}`,
      transactionId: requestId,
      gateway: 'momo',
    };
  }

  /**
   * Handle MoMo IPN callback.
   */
  async handleIpn(payload: IpnPayload): Promise<IpnResult> {
    const raw = payload.raw;

    // Verify signature
    const receivedSignature = raw['signature'] as string;
    if (!receivedSignature) {
      return { success: false, status: 'failed', errorMessage: 'Missing signature' };
    }

    const resultCode = raw['resultCode'];
    const transId = raw['transId'] as string;
    const amount = raw['amount'] ? parseInt(raw['amount'] as string) : 0;

    if (resultCode === 0) {
      return { success: true, gatewayTxId: transId, amount, status: 'success' };
    }

    return {
      success: false,
      gatewayTxId: transId,
      amount,
      status: 'failed',
      errorMessage: `MoMo result code: ${resultCode}`,
    };
  }
}
