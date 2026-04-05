import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
 constructor(private readonly appService: AppService) {}

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
}
