import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessPolicyService } from './access-policy.service';
import { ActorContextService } from './actor-context.service';
import { AuthController } from './auth.controller';
import * as jwtUtil from './auth/jwt.util';

describe('AuthController', () => {
  let controller: AuthController;
  let actorContext: { resolve: jest.Mock };
  let accessPolicy: { resolve: jest.Mock };

  beforeEach(async () => {
    actorContext = {
      resolve: jest.fn(),
    };

    accessPolicy = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: ActorContextService, useValue: actorContext },
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should resolve auth context from bearer token identity when headers are absent', async () => {
    jest.spyOn(jwtUtil, 'verifyAuthToken').mockReturnValue({
      sub: 'user_1',
      email: 'owner@acme.test',
    });

    actorContext.resolve.mockResolvedValue({
      tenant: { slug: 'acme' },
      user: { id: 'user_1', email: 'owner@acme.test' },
      activeWorkspace: { slug: 'default' },
      activeMembership: { role: 'OWNER' },
      memberships: [],
      resolution: {
        tenantSlug: 'acme',
        usedAuthIdentityResolution: true,
      },
    });

    const result = await controller.context(
      'Bearer token-123',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: undefined,
      userEmail: undefined,
      workspaceSlug: undefined,
      hostname: undefined,
      authUserId: 'user_1',
    });

    expect(result).toMatchObject({
      capability: 'auth',
      status: 'resolved',
      context: {
        resolution: {
          usedAuthIdentityResolution: true,
        },
      },
    });
  });

  it('should reject invalid bearer tokens', async () => {
    jest.spyOn(jwtUtil, 'verifyAuthToken').mockImplementation(() => {
      throw new Error('bad token');
    });

    await expect(
      controller.me(
        'Bearer broken-token',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
