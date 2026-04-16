import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditEventsService } from './audit-events.service';
import { TenancyModule } from './tenancy.module';

@Module({
  imports: [TenancyModule],
  controllers: [AuditController],
  providers: [AuditEventsService],
})
export class AuditModule {}
