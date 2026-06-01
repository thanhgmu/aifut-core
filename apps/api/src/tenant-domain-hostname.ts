import { BadRequestException } from '@nestjs/common';

export function normalizeTenantDomainHostname(value?: string) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.split(':')[0];

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
