import { Module } from '@nestjs/common';
import { ConnectorExecutorService } from '../connector-executor.service';
import { NotificationModule } from '../notifications/notification.module';
import { PrismaService } from '../prisma.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  controllers: [WorkflowController],
  imports: [NotificationModule],
  providers: [WorkflowService, PrismaService, ConnectorExecutorService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
