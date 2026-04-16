import { Controller, Get } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';

@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Get('registry')
  registry() {
    return {
      capability: 'connectors',
      status: 'foundation',
      registry: this.connectorsService.listRegistry(),
    };
  }

  @Get('templates')
  templates() {
    return {
      capability: 'connectors',
      status: 'foundation',
      templates: this.connectorsService.listTemplates(),
    };
  }
}
