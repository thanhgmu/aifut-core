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

  @Get('app-definitions')
  appDefinitions() {
    return {
      capability: 'connectors',
      status: 'foundation',
      appDefinitions: this.connectorsService.listAppDefinitions(),
    };
  }

  @Get('adapter-contracts')
  adapterContracts() {
    return {
      capability: 'connectors',
      status: 'foundation',
      adapterContracts: this.connectorsService.listAdapterContracts(),
    };
  }

  @Get('adapter-interfaces')
  adapterInterfaces() {
    return {
      capability: 'connectors',
      status: 'foundation',
      adapterInterfaces: this.connectorsService.listAdapterInterfaces(),
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
