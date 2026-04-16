import { Module } from '@nestjs/common';
import { GlobalizationController } from './globalization.controller';

@Module({
  controllers: [GlobalizationController],
})
export class GlobalizationModule {}
