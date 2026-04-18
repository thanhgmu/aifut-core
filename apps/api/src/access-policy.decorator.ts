import { SetMetadata } from '@nestjs/common';
import { AccessPolicyRequirement, ACCESS_POLICY_METADATA_KEY } from './access-policy.constants';

export const RequireAccessPolicy = (requirement: AccessPolicyRequirement) =>
  SetMetadata(ACCESS_POLICY_METADATA_KEY, requirement);
