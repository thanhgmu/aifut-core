import { evaluateTenantDomainReadiness } from './tenant-domain-readiness';

describe('evaluateTenantDomainReadiness', () => {
  it('should keep platform subdomains ready without tenant-managed metadata', () => {
    expect(
      evaluateTenantDomainReadiness({
        kind: 'PLATFORM_SUBDOMAIN',
        status: 'ACTIVE',
      }),
    ).toEqual({
      routeReady: true,
      reasons: [],
    });
  });

  it('should explain bounded custom-domain readiness drift', () => {
    expect(
      evaluateTenantDomainReadiness({
        kind: 'CUSTOM',
        status: 'DEGRADED',
        dnsTarget: '   ',
        certificateStatus: ' pending ',
        provisioningMode: ' managed ',
        provider: '   ',
      }),
    ).toEqual({
      routeReady: false,
      reasons: [
        'domain-status:degraded',
        'dns-target:missing',
        'certificate-status:pending',
        'provider:missing',
      ],
    });
  });

  it('should require affiliate provisioning metadata for active routes', () => {
    expect(
      evaluateTenantDomainReadiness({
        kind: 'AFFILIATE_DOMAIN',
        status: 'ACTIVE',
        dnsTarget: 'edge.partner.test',
        certificateStatus: 'ready',
      }),
    ).toEqual({
      routeReady: false,
      reasons: ['provisioning-mode:missing'],
    });
  });

  it('should require certificate metadata for custom and affiliate domains', () => {
    expect(
      evaluateTenantDomainReadiness({
        kind: 'CUSTOM',
        status: 'ACTIVE',
        dnsTarget: 'edge.custom.test',
      }),
    ).toEqual({
      routeReady: false,
      reasons: ['certificate-status:missing'],
    });

    expect(
      evaluateTenantDomainReadiness({
        kind: 'AFFILIATE_DOMAIN',
        status: 'ACTIVE',
        dnsTarget: 'edge.partner.test',
        provisioningMode: 'affiliate-managed',
        provider: 'reseller-edge',
      }),
    ).toEqual({
      routeReady: false,
      reasons: ['certificate-status:missing'],
    });
  });
});
