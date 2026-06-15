import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { CertificationService } from './certification.service';

@Controller('certification')
export class CertificationController {
  constructor(private readonly cert: CertificationService) {}

  /** Get the certification checklist (public). */
  @Get('checklist')
  getChecklist() {
    return {
      standard: 'AIS',
      version: '0.1.0',
      items: this.cert.getChecklist(),
      total: this.cert.getChecklist().length,
      required: this.cert.getChecklist().filter((i) => i.required).length,
    };
  }

  /** Submit a connector for certification. */
  @Post('submit')
  submit(
    @Body() body: {
      tenantId: string;
      connectorKey: string;
      connectorName: string;
      version?: string;
      developerEmail?: string;
      developerName?: string;
      checklistResults?: any[];
    },
  ) {
    return this.cert.submit(body.tenantId, body);
  }

  /** Start review of a certification. */
  @Patch(':id/start-review')
  startReview(@Param('id') id: string, @Body('reviewerId') reviewerId: string) {
    return this.cert.startReview(id, reviewerId);
  }

  /** Approve a certification. */
  @Patch(':id/approve')
  approve(@Param('id') id: string, @Body('reviewerId') reviewerId: string, @Body('notes') notes?: string) {
    return this.cert.review(id, reviewerId, 'approve', notes);
  }

  /** Reject a certification. */
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('reviewerId') reviewerId: string, @Body('notes') notes?: string) {
    return this.cert.review(id, reviewerId, 'reject', notes);
  }

  /** List all certifications (admin). */
  @Get()
  list(@Query('status') status?: string, @Query('tenantId') tenantId?: string) {
    return this.cert.list(status, tenantId);
  }

  /** Get certification by tenant. */
  @Get('tenant/:tenantId')
  getByTenant(@Param('tenantId') tenantId: string) {
    return this.cert.getByTenant(tenantId);
  }

  /** Get a single certification. */
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.cert.getById(id);
  }

  /** Get certification statistics. */
  @Get('stats/summary')
  getStats() {
    return this.cert.getStats();
  }
}
