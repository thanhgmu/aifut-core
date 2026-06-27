import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { MemoryDatabaseStore } from '../database/memory-fallback.adapter';
import { EXCHANGE_RATES, SUPPORTED_CURRENCIES, Currency } from './billing.constants';

export interface FxRateResponse {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  inverseRate: number;
  updatedAt: Date;
}

@Injectable()
export class FxRateService {
  constructor(private readonly prisma: PrismaService) {}

  async getExchangeRate(
    baseCurrency: string,
    targetCurrency: string,
    tenantId?: string,
  ): Promise<FxRateResponse> {
    const base = baseCurrency.toUpperCase();
    const target = targetCurrency.toUpperCase();

    if (base === target) {
      return this.makeResponse(base, target, 1, new Date());
    }

    const store = MemoryDatabaseStore.getInstance();
    if (MemoryDatabaseStore.shouldFallback()) {
      return this.resolveFromMemory(store, base, target);
    }

    try {
      const dbRate = await this.prisma.$queryRaw<
        Array<{ rate: number; updatedAt: Date }>
      >`SELECT "rate", "updatedAt" FROM "FxRate"
        WHERE "baseCurrency" = ${base}
          AND "targetCurrency" = ${target}
          AND "isActive" = true
        ORDER BY "updatedAt" DESC
        LIMIT 1`;

      if (dbRate.length > 0) {
        return this.makeResponse(base, target, Number(dbRate[0].rate), dbRate[0].updatedAt);
      }
    } catch {
      return this.resolveFromMemory(store, base, target);
    }

    return this.resolveFromConstants(base, target);
  }

  async estimateCost(input: {
    baseCurrency: string;
    targetCurrency: string;
    amount: number;
    tenantId?: string;
  }) {
    const fx = await this.getExchangeRate(input.baseCurrency, input.targetCurrency, input.tenantId);
    const convertedAmount = input.amount * fx.rate;
    const estimatedCost = convertedAmount * 0.02;

    if (input.tenantId) {
      this.recordUsageForFxLookup(input.tenantId).catch(() => undefined);
    }

    return {
      baseCurrency: fx.baseCurrency,
      targetCurrency: fx.targetCurrency,
      originalAmount: input.amount,
      convertedAmount: Number(convertedAmount.toFixed(4)),
      rate: fx.rate,
      estimatedCost: Number(estimatedCost.toFixed(4)),
      updatedAt: fx.updatedAt,
    };
  }

  async listRates(tenantId?: string): Promise<FxRateResponse[]> {
    const store = MemoryDatabaseStore.getInstance();
    if (MemoryDatabaseStore.shouldFallback()) {
      return store.getFxRatesByTenant(tenantId ?? '__system__').map((rate) =>
        this.makeResponse(rate.baseCurrency, rate.targetCurrency, rate.rate, rate.updatedAt),
      );
    }

    return SUPPORTED_CURRENCIES.filter((currency) => currency !== 'USD').map((currency) =>
      this.resolveFromConstants('USD', currency),
    );
  }

  async upsertRate(input: {
    baseCurrency: string;
    targetCurrency: string;
    rate: number;
    tenantId?: string;
  }): Promise<FxRateResponse> {
    const store = MemoryDatabaseStore.getInstance();
    const base = input.baseCurrency.toUpperCase();
    const target = input.targetCurrency.toUpperCase();

    store.setFxRate({
      id: randomUUID(),
      tenantId: input.tenantId ?? null,
      baseCurrency: base,
      targetCurrency: target,
      rate: input.rate,
      updatedAt: new Date(),
    });

    return this.makeResponse(base, target, input.rate, new Date());
  }

  private resolveFromMemory(
    store: MemoryDatabaseStore,
    base: string,
    target: string,
  ): FxRateResponse {
    const memoryRate = store.getFxRate(base, target);
    if (memoryRate) {
      return this.makeResponse(base, target, memoryRate.rate, memoryRate.updatedAt);
    }

    return this.resolveFromConstants(base, target);
  }

  private resolveFromConstants(base: string, target: string): FxRateResponse {
    if (base === 'USD' && this.isCurrency(target)) {
      return this.makeResponse(base, target, EXCHANGE_RATES[target] ?? 1, new Date());
    }

    if (target === 'USD' && this.isCurrency(base)) {
      const baseRate = EXCHANGE_RATES[base] ?? 1;
      return this.makeResponse(base, target, baseRate !== 0 ? 1 / baseRate : 1, new Date());
    }

    if (this.isCurrency(base) && this.isCurrency(target)) {
      const baseRate = EXCHANGE_RATES[base] ?? 1;
      const targetRate = EXCHANGE_RATES[target] ?? 1;
      return this.makeResponse(base, target, targetRate / baseRate, new Date());
    }

    return this.makeResponse(base, target, 1, new Date());
  }

  private makeResponse(
    baseCurrency: string,
    targetCurrency: string,
    rate: number,
    updatedAt: Date,
  ): FxRateResponse {
    return {
      baseCurrency,
      targetCurrency,
      rate,
      inverseRate: rate !== 0 ? 1 / rate : 0,
      updatedAt,
    };
  }

  private isCurrency(value: string): value is Currency {
    return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
  }

  private async recordUsageForFxLookup(_tenantId: string): Promise<void> {
    return undefined;
  }
}
