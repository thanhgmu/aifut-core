import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-to-a-long-random-secret';

export type AuthTokenPayload = {
  sub: string;
  email: string;
};

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export function extractBearerToken(authHeader?: string | string[]) {
  if (!authHeader) {
    return undefined;
  }

  const authorization = Array.isArray(authHeader)
    ? authHeader.find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : authHeader;

  if (!authorization) {
    return undefined;
  }

  const [type, token] = authorization.split(' ');
  if (type !== 'Bearer' || !token?.trim()) {
    return undefined;
  }

  return token;
}

export function resolveAuthUserId(authHeader?: string | string[]) {
  const token = extractBearerToken(authHeader);

  if (!token) {
    return undefined;
  }

  try {
    const payload = verifyAuthToken(token);
    return payload.sub?.trim() || undefined;
  } catch {
    throw new UnauthorizedException('Invalid bearer token');
  }
}
