import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg(connectionString) })
  : new PrismaClient();

/**
 * Connector Certification Program service.
 * Manages the lifecycle of connector certification:
 * Submit → In Review → Approved / Rejected
 */
@Injectable()
export class CertificationService {
  /**
   * The certification checklist that every connector must pass.
   */
  getChecklist() {
    return [
      { id: 'ais-discovery', name: 'Implement AIS discovery endpoint', required: true, category: 'discovery' },
      { id: 'auth-oauth', name: 'OAuth 2.0 or API Key authentication', required: true, category: 'auth' },
      { id: 'actions', name: 'Define all connector actions', required: true, category: 'actions' },
      { id: 'triggers', name: 'Define event triggers (if applicable)', required: false, category: 'triggers' },
      { id: 'webhooks', name: 'Implement webhook receiver', required: false, category: 'webhooks' },
      { id: 'rate-limits', name: 'Declare rate limits in discovery', required: true, category: 'reliability' },
      { id: 'error-handling', name: 'Standard error responses (RFC 7807)', required: true, category: 'reliability' },
      { id: 'test-suite', name: 'Pass AIFUT connector test suite', required: true, category: 'testing' },
      { id: 'docs', name: 'Integration guide for AIFUT operators', required: true, category: 'docs' },
      { id: 'idempotency', name: 'Idempotency keys for write operations', required: false, category: 'reliability' },
      { id: 'health', name: 'Health check endpoint (/health)', required: true, category: 'reliability' },
      { id: 'https', name: 'HTTPS exclusively (no plain HTTP)', required: true, category: 'security' },
    ];
  }

  /**
   * Submit a connector for certification.
   */
  async submit(tenantId: string, data: {
    connectorKey: string;
    connectorName: string;
    version?: string;
    developerEmail?: string;
    developerName?: string;
    checklistResults?: any[];
  }) {
    const existing = await prisma.connectorCertification.findUnique({
      where: { tenantId_connectorKey: { tenantId, connectorKey: data.connectorKey } },
    });

    if (existing) {
      // Re-submit — update status back to SUBMITTED
      return prisma.connectorCertification.update({
        where: { id: existing.id },
        data: {
          status: 'SUBMITTED',
          version: data.version ?? existing.version,
          developerEmail: data.developerEmail ?? existing.developerEmail,
          developerName: data.developerName ?? existing.developerName,
          checklistResults: data.checklistResults ? JSON.parse(JSON.stringify(data.checklistResults)) : existing.checklistResults,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedBy: null,
          reviewerNotes: null,
        },
      });
    }

    return prisma.connectorCertification.create({
      data: {
        tenantId,
        connectorKey: data.connectorKey,
        connectorName: data.connectorName,
        version: data.version ?? '1.0.0',
        developerEmail: data.developerEmail,
        developerName: data.developerName,
        status: 'SUBMITTED',
        checklistResults: data.checklistResults ? JSON.parse(JSON.stringify(data.checklistResults)) : null,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      },
    });
  }

  /**
   * Review and approve/reject a certification.
   */
  async review(certId: string, reviewerId: string, action: 'approve' | 'reject', notes?: string) {
    const cert = await prisma.connectorCertification.findUnique({ where: { id: certId } });
    if (!cert) throw new NotFoundException(`Certification ${certId} not found`);
    if (cert.status !== 'SUBMITTED' && cert.status !== 'IN_REVIEW') {
      throw new ForbiddenException(`Cannot review certification with status ${cert.status}`);
    }

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const badgeUrl = action === 'approve'
      ? `https://aifut.app/badges/certified/${cert.tenantId}/${cert.connectorKey}.svg`
      : null;

    return prisma.connectorCertification.update({
      where: { id: certId },
      data: {
        status: newStatus,
        reviewerNotes: notes,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        badgeUrl,
      },
    });
  }

  /**
   * Mark certification as IN_REVIEW.
   */
  async startReview(certId: string, reviewerId: string) {
    const cert = await prisma.connectorCertification.findUnique({ where: { id: certId } });
    if (!cert) throw new NotFoundException(`Certification ${certId} not found`);
    if (cert.status !== 'SUBMITTED') {
      throw new ForbiddenException(`Cannot start review for certification with status ${cert.status}`);
    }

    return prisma.connectorCertification.update({
      where: { id: certId },
      data: { status: 'IN_REVIEW', reviewedBy: reviewerId },
    });
  }

  /**
   * List all certifications (admin view).
   */
  async list(status?: string, tenantId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;

    return prisma.connectorCertification.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        tenant: { select: { name: true, slug: true } },
      },
    });
  }

  /**
   * Get certification by ID.
   */
  async getById(certId: string) {
    const cert = await prisma.connectorCertification.findUnique({
      where: { id: certId },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    if (!cert) throw new NotFoundException(`Certification ${certId} not found`);
    return cert;
  }

  /**
   * Get certifications by tenant.
   */
  async getByTenant(tenantId: string) {
    return prisma.connectorCertification.findMany({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * Get certification statistics.
   */
  async getStats() {
    const all = await prisma.connectorCertification.findMany({
      select: { status: true, submittedAt: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const c of all) {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    }

    const total = all.length;
    const approved = statusCounts['APPROVED'] ?? 0;
    const pending = (statusCounts['SUBMITTED'] ?? 0) + (statusCounts['IN_REVIEW'] ?? 0);

    return {
      total,
      approved,
      rejected: statusCounts['REJECTED'] ?? 0,
      pending,
      expired: statusCounts['EXPIRED'] ?? 0,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      byStatus: statusCounts,
    };
  }
}
