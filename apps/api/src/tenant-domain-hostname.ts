import { BadRequestException } from '@nestjs/common';

export function normalizeTenantDomainHostname(value?: string) {
  const authority = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  const authorityMatch = authority?.match(/^([^:]+)(?::\d+)?$/);

  if (authority && !authorityMatch) {
    throw new BadRequestException('Invalid hostname.');
  }

  const normalized = authorityMatch?.[1] ?? authority;

  if (
    normalized &&
    (normalized.length > 253 ||
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
