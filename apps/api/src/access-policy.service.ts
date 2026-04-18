import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  ActorContextInput,
  ActorContextService,
} from './actor-context.service';

const ROLE_PRIORITY: Record<MembershipRole, number> = {
  OWNER: 500,
  ADMIN: 400,
  OPERATOR: 300,
  MEMBER: 200,
  VIEWER: 100,
};

@Injectable()
export class AccessPolicyService {
  constructor(private readonly actorContext: ActorContextService) {}

  async resolve(input: ActorContextInput) {
    const context = await this.actorContext.resolve(input);
    const role = (context.activeMembership?.role ?? null) as MembershipRole | null;
    const hasWorkspaceScope = Boolean(context.activeWorkspace);

    return {
      context,
      boundary: {
        role,
        rolePriority: role ? ROLE_PRIORITY[role] : 0,
        scope: hasWorkspaceScope ? 'workspace' : 'tenant',
        workspaceRequiredForWrites: hasWorkspaceScope,
        canReadTenant: Boolean(role),
        canReadWorkspace: hasWorkspaceScope,
        canManageTenant: this.hasAtLeastRole(role, MembershipRole.ADMIN),
        canManageWorkspace: this.hasAtLeastRole(role, MembershipRole.OPERATOR),
        canManageMemberships: this.hasAtLeastRole(role, MembershipRole.ADMIN),
        canOperateAutomations: this.hasAtLeastRole(role, MembershipRole.OPERATOR),
        canUseOperatorControls: this.hasAtLeastRole(role, MembershipRole.OPERATOR),
        canViewAudit: this.hasAtLeastRole(role, MembershipRole.MEMBER),
        recommendedGuardrail: hasWorkspaceScope
          ? 'enforce-workspace-match-on-write-paths'
          : 'require-explicit-workspace-selection-for-workspace-bound-actions',
      },
      next: [
        'request-guard-enforcement',
        'policy-decorator-metadata',
        'operator-vs-tenant-scope-hardening',
      ],
    };
  }

  private hasAtLeastRole(
    role: MembershipRole | null,
    minimum: MembershipRole,
  ) {
    if (!role) {
      return false;
    }

    return ROLE_PRIORITY[role] >= ROLE_PRIORITY[minimum];
  }
}
