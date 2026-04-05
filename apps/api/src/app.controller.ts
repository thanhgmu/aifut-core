import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
 constructor(
 private readonly appService: AppService,
 private readonly prisma: PrismaService,
 ) {}

 @Get()
 getRoot(@Req() req: Request & { context?: unknown }) {
 return {
 message: this.appService.getHello(),
 context: req.context ?? null,
 };
 }

 @Get('health')
 getHealth(@Req() req: Request & { context?: unknown }) {
 return {
 status: 'ok',
 service: 'api',
 database: 'up',
 context: req.context ?? null,
 timestamp: new Date().toISOString(),
 };
 }

 @Get('me')
 getMe(@Req() req: Request & { context?: any }) {
 return {
 user: req.context?.user ?? null,
 tenant: req.context?.tenant ?? null,
 membership: req.context?.membership ?? null,
 };
 }

 @Get('tenants/current')
 getCurrentTenant(@Req() req: Request & { context?: any }) {
 return {
 tenant: req.context?.tenant ?? null,
 membership: req.context?.membership ?? null,
 };
 }

 @Get('tenants/current/summary')
 async getCurrentTenantSummary(@Req() req: Request & { context?: any }) {
 const tenantId = req.context?.tenant?.id;
 let workspaceCount = 0;
 let memberCount = 0;

 if (tenantId) {
 workspaceCount = await this.prisma.workspace.count({ where: { tenantId } });
 memberCount = await this.prisma.membership.count({ where: { tenantId } });
 }

 return {
 tenant: req.context?.tenant ?? null,
 user: req.context?.user ?? null,
 membership: req.context?.membership ?? null,
 counts: {
 workspaces: workspaceCount,
 members: memberCount,
 },
 };
 }

 @Get('workspaces')
 async getWorkspaces(@Req() req: Request & { context?: any }) {
 const tenantId = req.context?.tenant?.id;

 if (tenantId) {
 return this.prisma.workspace.findMany({
 where: { tenantId },
 orderBy: { createdAt: 'asc' },
 });
 }

 return [];
 }

 @Get('tenants/current/members')
 async getCurrentTenantMembers(@Req() req: Request & { context?: any }) {
 const tenantId = req.context?.tenant?.id;

 if (tenantId) {
 return this.prisma.membership.findMany({
 where: { tenantId },
 include: { user: true },
 orderBy: { createdAt: 'asc' },
 });
 }

 return [];
 }
}
