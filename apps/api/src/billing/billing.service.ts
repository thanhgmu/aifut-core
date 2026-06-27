import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { SUPPORTED_CURRENCIES, Currency, EXCHANGE_RATES } from "./billing.constants";
@Injectable()
export class BillingService {
  private memoryAccounts: any[] = [];
  private memoryInvoices: any[] = [];
  constructor(private readonly prisma: PrismaService) {}
  getFxRate(from: Currency, to: Currency) {
    if (from === to) return { from, to, rate: 1 };
    const fromRate = from === "VND" ? 1 : (1 / (EXCHANGE_RATES[from] || 1));
    const toRate = to === "VND" ? 1 : (1 / (EXCHANGE_RATES[to] || 1));
    return { from, to, rate: Number((fromRate / toRate).toFixed(6)) };
  }
  async getOrCreateAccount(tenantId: string, preferredCurrency?: Currency) {
    if (tenantId === "playground") {
      let acct = this.memoryAccounts.find(a => a.tenantId === tenantId);
      if (!acct) { acct = { id: `mem-acct-${Date.now()}`, tenantId, currency: preferredCurrency || "VND" }; this.memoryAccounts.push(acct); }
      return acct;
    }
    try { return await this.prisma.billingAccount.findUnique({ where: { tenantId } }) || await this.prisma.billingAccount.create({ data: { tenantId, currency: preferredCurrency || "VND", billingPeriod: "monthly" } }); }
    catch { return this.getOrCreateAccount("playground", preferredCurrency); }
  }
  async getInvoices(tenantId: string) {
    if (tenantId === "playground") return this.memoryInvoices;
    try { return await this.prisma.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }); }
    catch { return this.memoryInvoices; }
  }
  async subscribeAndPay(tenantId: string, planKey: string, gateway = "vnpay") {
    const orderId = `AIFUT-${Date.now()}`;
    if (tenantId === "playground") { const inv = { id: `mem-inv-${Date.now()}`, number: `INV-${Date.now()}`, amount: 490000, status: "pending" }; this.memoryInvoices.push(inv); return { requiresPayment: true, orderId, invoiceId: inv.id }; }
    try { return { requiresPayment: true, orderId, invoiceId: "db-inv-id" }; }
    catch { return this.subscribeAndPay("playground", planKey, gateway); }
  }
  async recordUsage(input: any) {
    return { id: `mem-usage-${Date.now()}`, ...input, recordedAt: new Date() };
  }
}
