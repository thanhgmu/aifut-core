import { MembershipRole } from '@prisma/client';

export const ACCESS_POLICY_METADATA_KEY = 'access-policy';

export type AccessPolicyScope =
  | 'tenant-admin'
  | 'membership-admin'
  | 'operator-control'
  | 'workspace-member-action';

export type AccessPolicyRequirement = {
  minimumRole?: MembershipRole;
  requireWorkspace?: boolean;
  scope?: AccessPolicyScope;
};

export const ROLE_PRIORITY: Record<MembershipRole, number> = {
  OWNER: 500,
  ADMIN: 400,
  OPERATOR: 300,
  MEMBER: 200,
  VIEWER: 100,
};
