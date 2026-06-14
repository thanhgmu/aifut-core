import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ResellerService {
  constructor(private readonly prisma: PrismaService) {}

  async registerReseller(tenantId: string, commissionRate = 0.2, discountRate = 0.3) {
    const existing = await this.prisma.resellerAccount.findUnique({ where: { tenantId } });
    if (existing) throw new ConflictException('Tenant already registered as reseller');
    return this.prisma.resellerAccount.create({
      data: { tenantId, commissionRate, discountRate },
    });
  }

  async getReseller(tenantId: string) {
    const r = await this.prisma.resellerAccount.findUnique({
      where: { tenantId },
      include: { subTenants: true },
    });
    if (!r) throw new NotFoundException('Not a reseller account');
    return r;
  }

  async onboardSubTenant(resellerTenantId: string, input: { slug: string; name: string; subscriptionKey?: string }) {
    const reseller = await this.getReseller(resellerTenantId);
    const sub = await this.prisma.resellerSubTenant.create({
      data: {
        resellerId: reseller.id,
        subTenantSlug: input.slug,
        subTenantName: input.name,
        subscriptionKey: input.subscriptionKey,
      },
    });
    // Increment count
    await this.prisma.resellerAccount.update({
      where: { id: reseller.id },
      data: { subTenantCount: { increment: 1 } },
    });
    return sub;
  }

  async listSubTenants(resellerTenantId: string) {
    const reseller = await this.getReseller(resellerTenantId);
    return reseller.subTenants;
  }
}
