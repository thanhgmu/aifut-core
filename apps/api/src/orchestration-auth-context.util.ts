import { UnauthorizedException } from '@nestjs/common';
import { verifyAuthToken } from './auth/jwt.util';

export function extractBearerToken(authHeader?: string) {
  if (!authHeader) {
    return undefined;
  }

  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) {
    return undefined;
  }

  return token;
}

export function resolveAuthUserId(authHeader?: string) {
  const token = extractBearerToken(authHeader);

  if (!token) {
    return undefined;
  }

  try {
    return verifyAuthToken(token).sub;
  } catch {
    throw new UnauthorizedException('Invalid bearer token');
  }
}
