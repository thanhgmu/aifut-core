import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

export function normalizeTenantDomainHostname(value?: string) {
  const authority = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  const authorityMatch = authority?.match(/^([^:]+)(?::(\d+))?$/);
  const port = authorityMatch?.[2] ? Number(authorityMatch[2]) : null;

  if (
    authority &&
    (!authorityMatch || (port != null && (port < 1 || port > 65535)))
  ) {
    throw new BadRequestException('Invalid hostname.');
  }

  const normalized = authorityMatch?.[1] ?? authority;

  if (
    normalized &&
    (isIP(normalized) !== 0 ||
      !normalized.includes('.') ||
      normalized.length > 253 ||
      !normalized
        .split('.')
        .every(
          (label) =>
            label.length > 0 &&
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
        ))
  ) {
    throw new BadRequestException('Invalid hostname.');
  }

  return normalized;
}
