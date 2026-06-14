import { Module } from '@nestjs/common';
import { ConnectorExecutorService } from './connector-executor.service';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [ConnectorsController],
  providers: [ConnectorsService, ConnectorExecutorService, PrismaService],
  exports: [ConnectorExecutorService],
})
export class ConnectorsModule {}
