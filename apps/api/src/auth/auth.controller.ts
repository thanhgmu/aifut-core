import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { verifyAuthToken } from './jwt.util';

function extractBearerToken(authHeader?: string) {
  if (!authHeader) return null;
  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body() body: { email?: string; password?: string; name?: string },
  ) {
    if (!body?.email || !body?.password) {
      throw new UnauthorizedException('Email and password are required');
    }

    return this.authService.register({
      email: body.email,
      password: body.password,
      name: body.name,
    });
  }

  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    if (!body?.email || !body?.password) {
      throw new UnauthorizedException('Email and password are required');
    }

    return this.authService.login({
      email: body.email,
      password: body.password,
    });
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = extractBearerToken(authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = verifyAuthToken(token);
    return this.authService.me(payload.sub);
  }
}
