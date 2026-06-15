import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { VnpayGateway } from './vnpay.gateway';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, VnpayGateway, PrismaService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
