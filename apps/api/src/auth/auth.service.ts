import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../prisma.service';
import { signAuthToken } from './jwt.util';

const scrypt = promisify(scryptCallback);

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

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [salt, hashedValue] = storedHash.split(':');

    if (!salt || !hashedValue) {
      return false;
    }

    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    const storedKey = Buffer.from(hashedValue, 'hex');

    if (derivedKey.length !== storedKey.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, storedKey);
  }

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

    const passwordHash = await this.hashPassword(input.password);
    const baseName =
      input.name?.trim() || email.split('@')[0] || 'workspace-owner';
    const tenantName = baseName;
    let tenantSlug = slugify(baseName) || 'tenant';

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

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        passwordHash,
        tenantId: tenant.id,
      },
    });

    const workspace = await this.prisma.workspace.create({
      data: {
        tenantId: tenant.id,
        name: 'Default Workspace',
        slug: 'default',
      },
    });

    await this.prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        workspaceId: workspace.id,
        role: MembershipRole.OWNER,
        isDefault: true,
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

    const ok = await this.verifyPassword(input.password, user.passwordHash);

    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user.id);
  }

  async me(userId: string) {
    return this.buildAuthResponse(userId);
  }
}
