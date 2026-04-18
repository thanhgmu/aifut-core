import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  ActorContextInput,
  ActorContextService,
} from './actor-context.service';
import { ROLE_PRIORITY } from './access-policy.constants';

@Injectable()
export class AccessPolicyService {
  constructor(private readonly actorContext: ActorContextService) {}

  async resolve(input: ActorContextInput) {
    const context = await this.actorContext.resolve(input);
    const role = (context.activeMembership?.role ?? null) as MembershipRole | null;
    const hasWorkspaceScope = Boolean(context.activeWorkspace);

    const canManageTenant = this.hasAtLeastRole(role, MembershipRole.ADMIN);
    const canManageWorkspace = this.hasAtLeastRole(role, MembershipRole.OPERATOR);
    const canManageMemberships = this.hasAtLeastRole(role, MembershipRole.ADMIN);
    const canOperateAutomations = this.hasAtLeastRole(role, MembershipRole.OPERATOR);
    const canUseOperatorControls = this.hasAtLeastRole(role, MembershipRole.OPERATOR);
    const canViewAudit = this.hasAtLeastRole(role, MembershipRole.MEMBER);

    return {
      context,
      boundary: {
        role,
        rolePriority: role ? ROLE_PRIORITY[role] : 0,
        scope: hasWorkspaceScope ? 'workspace' : 'tenant',
        workspaceRequiredForWrites: hasWorkspaceScope,
        canReadTenant: Boolean(role),
        canReadWorkspace: hasWorkspaceScope,
        canManageTenant,
        canManageWorkspace,
        canManageMemberships,
        canOperateAutomations,
        canUseOperatorControls,
        canViewAudit,
        allowedScopes: {
          tenantAdmin: canManageTenant,
          membershipAdmin: canManageMemberships,
          operatorControl: canUseOperatorControls,
          workspaceMemberAction: canViewAudit && hasWorkspaceScope,
        },
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
