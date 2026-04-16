export const ENTITLEMENTS_FOUNDATION_ROADMAP = [
  'plan-feature-matrix',
  'usage-and-storage-limits',
  'coupons-and-discounts',
  'tenant-overrides',
  'marketplace-linked-entitlements',
  'app-capability-package-options',
] as const;

export const PACKAGE_OPTIONS_BLUEPRINT = {
  capability: 'entitlements',
  status: 'foundation',
  packagingModel: {
    basePlan: 'required',
    optionalAddOns: true,
    pricingMode: ['fixed-delta', 'usage-delta', 'bundled'],
    scope: ['tenant', 'workspace'],
  },
  operatorSurfaces: {
    aifutAdmin: {
      packageBuilder: true,
      pricingControls: true,
      entitlementOverrides: true,
      downstreamProvisioningStatus: true,
    },
    tenantControlPanel: {
      activeOptionsVisibility: true,
      setupStatusVisibility: true,
      upgradeDowngradeVisibility: true,
    },
    downstreamApps: {
      nexovaflowControlPanel: 'optional-operational-surface-only',
    },
  },
  optionTemplate: {
    key: 'nexovaflow.automation',
    label: 'NexovaFlow Automation',
    category: 'app-capability',
    billing: {
      mode: 'fixed-delta',
      defaultPriceDelta: 'set-by-operator',
    },
    entitlement: {
      kind: 'FEATURE',
      key: 'feature.nexovaflow.automation',
    },
    provisioning: {
      owner: 'aifut-core',
      downstreamSystem: 'nexovaflow',
      states: ['inactive', 'pending', 'active', 'degraded'],
    },
    dependencies: ['connector.nexovaflow'],
    configuration: {
      aifutManaged: true,
      nexovaflowPanelIfNeeded: true,
    },
  },
  designRules: [
    'aifut-core-remains-commercial-source-of-truth',
    'downstream-apps-do-not-own-package-pricing',
    'connector-state-and-entitlement-state-must-both-be-visible',
  ],
} as const;
