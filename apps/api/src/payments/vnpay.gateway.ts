import { Injectable, OnModuleInit } from '@nestjs/common';
import { PaymentRequest, PaymentResponse, IpnPayload, IpnResult, PaymentCapabilities, PaymentGateway } from './payments.types';
import * as crypto from 'crypto';

/**
 * VNPay payment gateway integration.
 *
 * VNPay is the most widely used payment gateway in Vietnam,
 * supporting QR, card, bank transfer, and wallet payments.
 *
 * Specification: https://sandbox.vnpayment.vn/apis/docs/
 */

export interface VnpayConfig {
  vnp_TmnCode: string;
  vnp_HashSecret: string;
  vnp_Url: string;          // https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
  vnp_ReturnUrl: string;
  vnp_IpnUrl: string;
}

@Injectable()
export class VnpayGateway implements OnModuleInit {
  private config: VnpayConfig | null = null;

  onModuleInit() {
    const tmnCode = process.env['VNPAY_TMN_CODE'];    const hashSecret = process.env['VNPAY_HASH_SECRET'];
    if (tmnCode && hashSecret) {
      this.configure({
        vnp_TmnCode: tmnCode,
        vnp_HashSecret: hashSecret,
        vnp_Url: process.env['VNPAY_URL'] || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        vnp_ReturnUrl: process.env['VNPAY_RETURN_URL'] || 'http://localhost:3000/payment/return',
        vnp_IpnUrl: process.env['VNPAY_IPN_URL'] || 'http://localhost:3002/payments/vnpay/ipn',
      });
    }
  }

  /** Configure the gateway with credentials */
  configure(config: VnpayConfig) {
    this.config = config;
  }

  get isConfigured(): boolean {
    return this.config !== null && this.config.vnp_TmnCode.length > 0;
  }

  get capabilities(): PaymentCapabilities {
    return {
      gateway: 'vnpay',
      name: 'VNPay',
      supportedCurrencies: ['VND'],
      paymentMethods: ['qr', 'card', 'bank', 'wallet'],
    };
  }

  /**
   * Create a VNPay payment URL.
   * User is redirected to this URL to complete payment.
   */
  async createPayment(req: PaymentRequest): Promise<PaymentResponse> {
    if (!this.config) {
      return {
        success: false,
        gateway: 'vnpay',
        errorMessage: 'VNPay gateway not configured. Set VNPAY_TMN_CODE and VNPAY_HASH_SECRET env vars.',
      };
    }

    const { config } = this;
    const date = new Date();

    // VNPay required parameters
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: config.vnp_TmnCode,
      vnp_Amount: String(Math.round(req.amount * 100)), // VND * 100
      vnp_CurrCode: 'VND',
      vnp_TxnRef: req.orderId,
      vnp_OrderInfo: req.description.slice(0, 100),
      vnp_OrderType: '190000', // other
      vnp_Locale: 'vn',
      vnp_ReturnUrl: config.vnp_ReturnUrl,
      vnp_IpnUrl: config.vnp_IpnUrl,
      vnp_CreateDate: this.formatDate(date),
      vnp_ExpireDate: this.formatDate(new Date(date.getTime() + 15 * 60 * 1000)), // 15 min expiry
      vnp_IpAddr: req.metadata?.ipAddress as string || '127.0.0.1',
      vnp_UserAgent: req.metadata?.userAgent as string || 'unknown',
    };

    // Sort params by key for hash generation
    const sortedKeys = Object.keys(params).sort();
    const hashData = sortedKeys.map((key) => `${key}=${encodeURIComponent(params[key])}`).join('&');
    const secureHash = crypto.createHmac('sha512', config.vnp_HashSecret).update(hashData).digest('hex');

    const queryString = sortedKeys.map((key) => `${key}=${encodeURIComponent(params[key])}`).join('&');
    const paymentUrl = `${config.vnp_Url}?${queryString}&vnp_SecureHash=${secureHash}`;

    return {
      success: true,
      paymentUrl,
      transactionId: req.orderId,
      gateway: 'vnpay',
    };
  }

  /**
   * Handle VNPay IPN (Instant Payment Notification).
   * Called by VNPay server after payment completes.
   */
  async handleIpn(payload: IpnPayload): Promise<IpnResult> {
    if (!this.config) {
      return { success: false, status: 'failed', errorMessage: 'VNPay not configured' };
    }

    const raw = payload.raw;

    // Verify secure hash
    const receivedHash = raw['vnp_SecureHash'] as string;
    if (!receivedHash) {
      return { success: false, status: 'failed', errorMessage: 'Missing vnp_SecureHash' };
    }

    const params = { ...raw };
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];

    const sortedKeys = Object.keys(params).sort();
    const hashData = sortedKeys.map((key) => `${key}=${encodeURIComponent(String(params[key]))}`).join('&');
    const computedHash = crypto.createHmac('sha512', this.config.vnp_HashSecret).update(hashData).digest('hex');

    if (computedHash !== receivedHash) {
      return { success: false, status: 'failed', errorMessage: 'Invalid signature' };
    }

    const responseCode = raw['vnp_ResponseCode'] as string;
    const transactionNo = raw['vnp_TransactionNo'] as string;
    const amount = parseInt(raw['vnp_Amount'] as string || '0', 10) / 100;
    const orderId = raw['vnp_TxnRef'] as string;

    if (responseCode === '00') {
      return {
        success: true,
        gatewayTxId: transactionNo,
        amount,
        status: 'success',
      };
    }

    return {
      success: false,
      gatewayTxId: transactionNo,
      amount,
      status: 'failed',
      errorMessage: `VNPay response code: ${responseCode}`,
    };
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}${h}${mi}${s}`;
  }
}
