import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma.service';
import { RequestContext } from '../interfaces/request-context.interface';

export interface RequestWithContext extends Request {
  context?: RequestContext;
}

@Injectable()
export class DevContextMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: RequestWithContext, res: Response, next: NextFunction) {
    const userEmail = req.header('x-dev-user-email');
    const tenantSlug = req.header('x-tenant-slug');

    req.context = {
      user: null,
      tenant: null,
      membership: null,
    };

    if (!userEmail || !tenantSlug) {
      return next();
    }

    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!user || !tenant) {
      return next();
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id,
        },
      },
    });

    req.context = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      membership: membership
        ? {
            id: membership.id,
            role: membership.role,
            userId: membership.userId,
            tenantId: membership.tenantId,
          }
        : null,
    };

    next();
  }
}
