import { Module } from '@nestjs/common';
import { AwlInterpreterService } from './awl-interpreter.service';
import { ConnectorExecutorService } from '../connector-executor.service';
import { NotificationModule } from '../notifications/notification.module';
import { PrismaService } from '../prisma.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  controllers: [WorkflowController],
  imports: [NotificationModule],
  providers: [WorkflowService, PrismaService, ConnectorExecutorService, AwlInterpreterService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
