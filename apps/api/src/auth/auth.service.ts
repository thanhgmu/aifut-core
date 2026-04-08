import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { signAuthToken } from './jwt.util';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private async buildAuthResponse(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            tenant: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const membership = user.memberships[0] ?? null;
    const tenant = membership?.tenant ?? null;

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      tenant,
      membership,
    };
  }

  async register(input: { email: string; password: string; name?: string }) {
    const email = input.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const baseName =
      input.name?.trim() || email.split('@')[0] || 'workspace-owner';
    const tenantName = baseName;
    let tenantSlug = slugify(baseName) || 'tenant';

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        passwordHash,
      },
    });

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (existingTenant) {
      tenantSlug = `${tenantSlug}-${Date.now().toString().slice(-6)}`;
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: tenantName,
        slug: tenantSlug,
      },
    });

    const membership = await this.prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role: 'owner',
      },
    });

    await this.prisma.workspace.create({
      data: {
        tenantId: tenant.id,
        name: 'Default Workspace',
        slug: 'default',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId: user.id,
        action: 'auth.register',
        entityType: 'User',
        entityId: user.id,
      },
    });

    return this.buildAuthResponse(user.id);
  }

  async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);

    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user.id);
  }

  async me(userId: string) {
    return this.buildAuthResponse(userId);
  }
}
