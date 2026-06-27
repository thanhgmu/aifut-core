// ═══════════════════════════════════════════════════════════════════════════
// license.guard.ts — License Validation Guard (On-Premise Mode)
// ═══════════════════════════════════════════════════════════════════════════
// Kiểm tra license hợp lệ trước khi cho phép request trong airgap mode.
// Chỉ active khi AIRGAP_MODE=true.
// Cho phép: licensing routes, auth routes (login/register), health check.
// ═══════════════════════════════════════════════════════════════════════════

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { LicensingService } from './licensing.service';

const AIRGAP_MODE = process.env.AIRGAP_MODE === 'true';
const PUBLIC_PATHS = [
  '/v1/licensing',
  '/v1/auth',
  '/health',
  '/api/health',
  '/v1/tenants',
];

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly licensing: LicensingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only enforce in airgap mode
    if (!AIRGAP_MODE) return true;

    const request = context.switchToHttp().getRequest();
    const path: string = request.path ?? request.route?.path ?? '';

    // Allow public paths
    for (const prefix of PUBLIC_PATHS) {
      if (path.startsWith(prefix)) return true;
    }

    // Check license
    const tenantId =
      request.headers['x-tenant-id'] ??
      request.headers['X-Tenant-Id'] ??
      request.tenantId;

    if (!tenantId) return true; // Allow if no tenant context yet

    const { valid, message } =
      await this.licensing.validateLicense(tenantId);
    if (!valid) {
      throw new ForbiddenException(
        `License không hợp lệ: ${message}. Vui lòng kích hoạt license tại /v1/licensing/activate`,
      );
    }

    return true;
  }
}
