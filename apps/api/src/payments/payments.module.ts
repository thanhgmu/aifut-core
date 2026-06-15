import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { VnpayGateway } from './vnpay.gateway';
import { MomoGateway } from './momo.gateway';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, VnpayGateway, MomoGateway, PrismaService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
