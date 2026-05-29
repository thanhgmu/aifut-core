import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { AccessPolicyGuard } from './access-policy.guard';
import { AccessPolicyService } from './access-policy.service';
import * as jwtUtil from './auth/jwt.util';

describe('AccessPolicyGuard', () => {
  let guard: AccessPolicyGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let accessPolicy: { resolveAndRequire: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    accessPolicy = {
      resolveAndRequire: jest.fn(),
    };

    guard = new AccessPolicyGuard(
      reflector as unknown as Reflector,
      accessPolicy as unknown as AccessPolicyService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass bearer-token auth identity into access-policy resolution', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      minimumRole: MembershipRole.ADMIN,
      scope: 'tenant-admin',
    });

    jest.spyOn(jwtUtil, 'resolveAuthUserId').mockReturnValue('user_1');

    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { slug: 'acme' },
        user: { email: 'owner@acme.test' },
      },
      boundary: { role: MembershipRole.OWNER },
    });

    const request: any = {
      headers: {
        authorization: 'Bearer token-123',
      },
      query: {},
      body: {},
    };

    const executionContext: any = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    const allowed = await guard.canActivate(executionContext);

    expect(accessPolicy.resolveAndRequire).toHaveBeenCalledWith(
      {
        tenantSlug: undefined,
        userEmail: undefined,
        workspaceSlug: undefined,
        hostname: undefined,
        authUserId: 'user_1',
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.ADMIN,
        scope: 'tenant-admin',
      },
    );
    expect(request.accessPolicy).toMatchObject({
      boundary: { role: MembershipRole.OWNER },
    });
    expect(allowed).toBe(true);
  });

  it('should reject invalid bearer tokens before access-policy resolution', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      minimumRole: MembershipRole.ADMIN,
      scope: 'tenant-admin',
    });

    jest.spyOn(jwtUtil, 'resolveAuthUserId').mockImplementation(() => {
      throw new UnauthorizedException('Invalid bearer token');
    });

    const executionContext: any = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: 'Bearer broken-token',
          },
          query: {},
          body: {},
        }),
      }),
    };

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(accessPolicy.resolveAndRequire).not.toHaveBeenCalled();
  });

  it('should ignore bearer tokens with blank subject claims', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      minimumRole: MembershipRole.ADMIN,
      scope: 'tenant-admin',
    });

    jest.spyOn(jwtUtil, 'resolveAuthUserId').mockReturnValue(undefined);

    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { slug: 'acme' },
        user: { email: 'owner@acme.test' },
      },
      boundary: { role: MembershipRole.OWNER },
    });

    const request: any = {
      headers: {
        authorization: 'Bearer token-blank-sub',
        'x-tenant-slug': 'acme',
        'x-user-email': 'owner@acme.test',
      },
      query: {},
      body: {},
    };

    const executionContext: any = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await guard.canActivate(executionContext);

    expect(accessPolicy.resolveAndRequire).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: undefined,
        tenantSlug: 'acme',
        userEmail: 'owner@acme.test',
      }),
      expect.any(Object),
    );
  });
});
