// ═══════════════════════════════════════════════════════════════════════════
// data-marketplace.service.ts — Data Product Marketplace
// ═══════════════════════════════════════════════════════════════════════════
// Cho phép tenant publish/buy/sell data products với consent management.
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DataMarketplaceService {
  private readonly logger = new Logger(DataMarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  DATA PRODUCTS — CRUD
  // ═════════════════════════════════════════════════════════════════════

  async listPublishedProducts(options: {
    category?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  } = {}) {
    const { category, search, minPrice, maxPrice, limit = 20, offset = 0 } = options;
    const where: any = { isPublished: true };

    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    const [total, items] = await Promise.all([
      this.prisma.dataProduct.count({ where }),
      this.prisma.dataProduct.findMany({
        where,
        orderBy: [{ downloads: 'desc' }, { rating: 'desc' }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          tenantId: true,
          name: true,
          description: true,
          category: true,
          tags: true,
          format: true,
          price: true,
          currency: true,
          sampleData: true,
          schema: true,
          rowCount: true,
          sizeBytes: true,
          downloads: true,
          rating: true,
          createdAt: true,
        },
      }),
    ]);

    return { total, items };
  }

  async getProductById(id: string) {
    return this.prisma.dataProduct.findUnique({ where: { id } });
  }

  async getMyProducts(tenantId: string) {
    return this.prisma.dataProduct.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProduct(
    tenantId: string,
    data: {
      name: string;
      description?: string;
      category?: string;
      tags?: string[];
      format?: string;
      price?: number;
      currency?: string;
      sampleData?: any;
      schema?: any;
      rowCount?: number;
      sizeBytes?: number;
    },
  ) {
    const product = await this.prisma.dataProduct.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description ?? null,
        category: data.category ?? null,
        tags: data.tags ?? [],
        format: data.format ?? 'json',
        price: data.price ?? 0,
        currency: data.currency ?? 'USD',
        sampleData: data.sampleData ?? null,
        schema: data.schema ?? null,
        rowCount: data.rowCount ?? 0,
        sizeBytes: BigInt(data.sizeBytes ?? 0),
      },
    });
    this.logger.log(`Data product created: ${product.id} by tenant ${tenantId}`);
    return product;
  }

  async updateProduct(
    productId: string,
    tenantId: string,
    data: {
      name?: string;
      description?: string | null;
      category?: string | null;
      tags?: string[];
      format?: string;
      price?: number;
      currency?: string;
      sampleData?: any;
      schema?: any;
      rowCount?: number;
      sizeBytes?: number;
      isPublished?: boolean;
    },
  ) {
    const existing = await this.prisma.dataProduct.findUnique({ where: { id: productId } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Product not found or access denied');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.format !== undefined) updateData.format = data.format;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.sampleData !== undefined) updateData.sampleData = data.sampleData;
    if (data.schema !== undefined) updateData.schema = data.schema;
    if (data.rowCount !== undefined) updateData.rowCount = data.rowCount;
    if (data.sizeBytes !== undefined) updateData.sizeBytes = BigInt(data.sizeBytes);
    if (data.isPublished !== undefined) updateData.isPublished = data.isPublished;

    return this.prisma.dataProduct.update({ where: { id: productId }, data: updateData });
  }

  async publishProduct(productId: string, tenantId: string) {
    return this.updateProduct(productId, tenantId, { isPublished: true });
  }

  async unpublishProduct(productId: string, tenantId: string) {
    return this.updateProduct(productId, tenantId, { isPublished: false });
  }

  async deleteProduct(productId: string, tenantId: string) {
    const existing = await this.prisma.dataProduct.findUnique({ where: { id: productId } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Product not found or access denied');
    }
    await this.prisma.dataProduct.delete({ where: { id: productId } });
    return { deleted: true };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  PURCHASE
  // ═════════════════════════════════════════════════════════════════════

  async purchaseProduct(productId: string, buyerTenantId: string) {
    const product = await this.prisma.dataProduct.findUnique({
      where: { id: productId },
    });
    if (!product) throw new Error('Product not found');
    if (!product.isPublished) throw new Error('Product is not available');
    if (product.tenantId === buyerTenantId) throw new Error('Cannot purchase your own product');

    // Check existing purchase
    const existing = await this.prisma.dataProductPurchase.findUnique({
      where: { productId_buyerTenantId: { productId, buyerTenantId } },
    });
    if (existing) {
      if (existing.status === 'completed') throw new Error('Already purchased');
      return existing; // return pending purchase
    }

    const purchase = await this.prisma.dataProductPurchase.create({
      data: {
        productId,
        buyerTenantId,
        price: product.price,
        currency: product.currency,
        status: product.price > 0 ? 'pending' : 'completed', // Free products auto-complete
        downloadedAt: product.price > 0 ? null : new Date(),
      },
    });

    // If free, increment download count
    if (product.price === 0) {
      await this.prisma.dataProduct.update({
        where: { id: productId },
        data: { downloads: { increment: 1 } },
      });
    }

    this.logger.log(`Data product purchased: ${productId} by ${buyerTenantId}`);
    return purchase;
  }

  async confirmPurchase(purchaseId: string) {
    const purchase = await this.prisma.dataProductPurchase.findUnique({
      where: { id: purchaseId },
    });
    if (!purchase) throw new Error('Purchase not found');

    const updated = await this.prisma.dataProductPurchase.update({
      where: { id: purchaseId },
      data: {
        status: 'completed',
        downloadedAt: new Date(),
      },
    });

    // Increment download
    await this.prisma.dataProduct.update({
      where: { id: purchase.productId },
      data: { downloads: { increment: 1 } },
    });

    return updated;
  }

  async getMyPurchases(buyerTenantId: string) {
    return this.prisma.dataProductPurchase.findMany({
      where: { buyerTenantId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            format: true,
            schema: true,
            rowCount: true,
            sizeBytes: true,
          },
        },
      },
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  CONSENT MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════

  async setConsent(
    tenantId: string,
    purpose: string,
    scope: string,
    isActive: boolean = true,
    expiresAt?: Date,
  ) {
    return this.prisma.dataConsent.upsert({
      where: {
        tenantId_purpose_scope: { tenantId, purpose, scope },
      },
      create: {
        tenantId, purpose, scope, isActive,
        expiresAt: expiresAt ?? null,
      },
      update: {
        isActive,
        revokedAt: isActive ? null : new Date(),
        expiresAt: expiresAt ?? null,
      },
    });
  }

  async getConsents(tenantId: string) {
    return this.prisma.dataConsent.findMany({
      where: { tenantId },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async revokeConsent(consentId: string, tenantId: string) {
    const consent = await this.prisma.dataConsent.findUnique({
      where: { id: consentId },
    });
    if (!consent || consent.tenantId !== tenantId) {
      throw new Error('Consent not found or access denied');
    }

    return this.prisma.dataConsent.update({
      where: { id: consentId },
      data: { isActive: false, revokedAt: new Date() },
    });
  }
}
