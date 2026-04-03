import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      name: 'AIFUT API',
      status: 'ok',
      message: 'AIFUT API is running',
    };
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }
}