import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy.module';
import { PrismaService } from '../prisma.service';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';

@Module({
  imports: [TenancyModule],
  controllers: [AffiliateController],
  providers: [AffiliateService, PrismaService],
  exports: [AffiliateService],
})
export class AffiliateModule {}
