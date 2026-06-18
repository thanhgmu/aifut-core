// ================================================================
// subscription.idor.provider.ts — IDOR Protection Provider
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Lớp bảo vệ thống nhất chống IDOR (Insecure Direct Object Reference)
// cho toàn bộ phân hệ Subscription. Mọi controller (mutation + query)
// PHẢI phân giải tenantId QUA provider này — không tự bóc header rời rạc.
//
// NGUYÊN TẮC BẤT BIẾN:
//   - tenantId CHỈ được lấy từ header context (x-tenant-id | x-tenant-slug).
//   - TUYỆT ĐỐI KHÔNG lấy tenantId từ body, query string, hay route params.
//   - Mọi truy vấn DB phía sau đều ràng buộc WHERE tenantId = resolvedValue,
//     nên Tenant A không thể đọc/sửa dữ liệu của Tenant B dù đoán đúng id
//     của resource (subscriptionId, walletId…).
//   - Header value được validate (UUID cho x-tenant-id) + đối chiếu DB
//     (Tenant phải thực sự tồn tại) trước khi tin tưởng.
// ================================================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

/** Regex kiểm tra UUID v1–v5 (chuẩn RFC 4122) */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Header có thể là string | string[] | undefined (Express raw headers) */
type HeaderValue = string | string[] | undefined;
type HeaderBag = Record<string, HeaderValue>;

/** Lấy phần tử đầu tiên (chuẩn hóa string[] → string), trim khoảng trắng */
function extractFirst(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === 'string' && v.trim().length > 0);
    return first?.trim();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

/** Kiểm tra UUID hợp lệ */
function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

@Injectable()
export class SubscriptionIdorProvider {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * resolveTenantId() — Bóc tách + xác thực tenantId từ header context.
   *
   * Thứ tự ưu tiên:
   *   1) x-tenant-id  : UUID của tenant (ưu tiên cao nhất, validate UUID
   *                     trước khi truy DB để chống injection/format lạ).
   *   2) x-tenant-slug: slug của tenant (tra cứu Tenant.slug → Tenant.id).
   *
   * @param headers  Toàn bộ header bag của request (case-insensitive keys
   *                 đã được Express normalize về lowercase).
   * @param required true (mặc định) → throw UnauthorizedException nếu không
   *                 phân giải được; false → trả '' (dùng cho endpoint
   *                 marketing/plans khi tenant chưa đăng nhập).
   * @returns tenantId đã được đối chiếu tồn tại trong DB.
   */
  async resolveTenantId(headers: HeaderBag, required = true): Promise<string> {
    const bag = this.normalize(headers);

    // ── 1) x-tenant-id (chỉ tin khi đúng định dạng UUID) ──
    const headerId = extractFirst(bag['x-tenant-id']);
    if (headerId && isValidUUID(headerId)) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: headerId },
        select: { id: true },
      });
      if (tenant) return tenant.id;
    }

    // ── 2) x-tenant-slug (fallback) ──
    const slug = extractFirst(bag['x-tenant-slug']);
    if (slug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (tenant) return tenant.id;
    }

    if (required) {
      throw new UnauthorizedException(
        'x-tenant-id (UUID) hoặc x-tenant-slug header là bắt buộc (IDOR protection)',
      );
    }
    return '';
  }

  /**
   * Chuẩn hóa key header về lowercase để tra cứu nhất quán bất kể client
   * gửi 'X-Tenant-Id' hay 'x-tenant-id'.
   */
  private normalize(headers: HeaderBag): HeaderBag {
    if (!headers) return {};
    const out: HeaderBag = {};
    for (const key of Object.keys(headers)) {
      out[key.toLowerCase()] = headers[key];
    }
    return out;
  }
}
