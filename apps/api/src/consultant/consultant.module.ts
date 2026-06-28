import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConsultantService } from './consultant.service';
import { ConsultantController } from './consultant.controller';

@Module({
  controllers: [ConsultantController],
  providers: [PrismaService, ConsultantService],
  exports: [ConsultantService],
})
export class ConsultantModule {}
