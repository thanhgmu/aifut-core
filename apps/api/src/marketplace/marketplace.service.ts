import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async createListing(input: {
    tenantId?: string; type: string; key: string; name: string;
    description?: string; category?: string; industry?: string;
    price?: number; authorName?: string; config?: any; tags?: string[];
  }) {
    const existing = await this.prisma.marketplaceListing.findUnique({ where: { key: input.key } });
    if (existing) throw new ConflictException(`Listing '${input.key}' already exists`);
    return this.prisma.marketplaceListing.create({ data: input as any });
  }

  async listListings(type?: string, category?: string, industry?: string) {
    const where: any = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (industry) where.industry = industry;
    return this.prisma.marketplaceListing.findMany({
      where, orderBy: { downloads: 'desc' }, take: 50,
    });
  }

  async getListing(key: string) {
    const item = await this.prisma.marketplaceListing.findUnique({ where: { key } });
    if (!item) throw new NotFoundException(`Listing '${key}' not found`);
    return item;
  }

  async installListing(tenantId: string, listingKey: string) {
    const listing = await this.getListing(listingKey);
    // Increment download count
    await this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { downloads: { increment: 1 } },
    });

    // For templates: auto-create from listing config
    let result: any = { installed: true, listingKey };
    if (listing.type === 'template' || listing.config) {
      const tpl = await this.prisma.workflowTemplate.create({
        data: {
          tenantId,
          key: `tpl_${listing.key}`,
          name: listing.name,
          description: listing.description,
          category: listing.category,
          industry: listing.industry,
          source: 'marketplace',
          status: 'DRAFT',
        } as any,
      });
      result.template = { id: tpl.id, key: tpl.key };
    }
    return result;
  }

  async deleteListing(key: string) {
    const item = await this.getListing(key);
    await this.prisma.marketplaceListing.delete({ where: { id: item.id } });
    return { deleted: true };
  }
}
