import { Module } from '@nestjs/common';
import { AwlInterpreterService } from './awl-interpreter.service';
import { IndustryTemplatesService } from './industry-templates.service';
import { TemplatePackService } from './template-pack.service';
import { TemplatePackController } from './template-pack.controller';
import { ConnectorExecutorService } from '../connector-executor.service';
import { NotificationModule } from '../notifications/notification.module';
import { PrismaService } from '../prisma.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  controllers: [WorkflowController, TemplatePackController],
  imports: [NotificationModule],
  providers: [WorkflowService, PrismaService, ConnectorExecutorService, AwlInterpreterService, IndustryTemplatesService, TemplatePackService],
  exports: [WorkflowService, AwlInterpreterService],
})
export class WorkflowModule {}
