// ═══════════════════════════════════════════════════════════════════════════
// licensing.module.ts — On-Premise License Management Module
// ═══════════════════════════════════════════════════════════════════════════
// Cung cấp:
//   - Generate / Activate / Validate / Revoke license keys
//   - Feature entitlement by tier
//   - Trial key auto-generation cho tenant mới
//   - Middleware guard cho on-premise deployment
// ═══════════════════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { LicensingController } from './licensing.controller';
import { LicensingService } from './licensing.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [LicensingController],
  providers: [LicensingService, PrismaService],
  exports: [LicensingService],
})
export class LicensingModule {}
