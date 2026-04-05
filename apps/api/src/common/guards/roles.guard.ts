import {
 CanActivate,
 ExecutionContext,
 ForbiddenException,
 Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
 constructor(private readonly reflector: Reflector) {}

 canActivate(context: ExecutionContext): boolean {
 const requiredRoles =
