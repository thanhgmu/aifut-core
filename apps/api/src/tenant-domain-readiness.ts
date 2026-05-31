type TenantDomainReadinessInput = {
  kind: string;
  status: string;
  provider?: string | null;
  provisioningMode?: string | null;
  dnsTarget?: string | null;
  certificateStatus?: string | null;
};

const readyCertificateStatuses = ['active', 'issued', 'ready'];
const managedProvisioningModes = ['managed', 'affiliate-managed'];

export function evaluateTenantDomainReadiness(
  input: TenantDomainReadinessInput,
) {
  const kind = input.kind.trim().toUpperCase();
  const status = input.status.trim().toUpperCase();
  const provisioningMode = normalizeOptionalLowercase(input.provisioningMode);
  const certificateStatus = normalizeOptionalLowercase(input.certificateStatus);
  const platformManagedDomain = kind === 'PLATFORM_SUBDOMAIN';
  const dnsTargetReady =
    platformManagedDomain || Boolean(normalizeOptional(input.dnsTarget));
  const certificateReady =
    !certificateStatus || readyCertificateStatuses.includes(certificateStatus);
  const provisioningModeReady =
    kind !== 'AFFILIATE_DOMAIN' || Boolean(provisioningMode);
  const providerReady =
    !managedProvisioningModes.includes(provisioningMode ?? '') ||
    Boolean(normalizeOptional(input.provider));
  const reasons = [
    ...(status !== 'ACTIVE' ? [`domain-status:${status.toLowerCase()}`] : []),
    ...(!dnsTargetReady ? ['dns-target:missing'] : []),
    ...(!certificateReady
      ? [`certificate-status:${certificateStatus}`]
      : []),
    ...(!provisioningModeReady ? ['provisioning-mode:missing'] : []),
    ...(!providerReady ? ['provider:missing'] : []),
  ];

  return {
    routeReady: reasons.length === 0,
    reasons,
  };
}

function normalizeOptional(value?: string | null) {
  return value?.trim() || null;
}

function normalizeOptionalLowercase(value?: string | null) {
  return normalizeOptional(value)?.toLowerCase() ?? null;
}
