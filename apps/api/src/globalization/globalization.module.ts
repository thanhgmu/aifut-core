import { Module } from '@nestjs/common';
import { GlobalizationController } from './globalization.controller';
import { LocalizationService } from './localization.service';

@Module({
  controllers: [GlobalizationController],
  providers: [LocalizationService],
  exports: [LocalizationService],
})
export class GlobalizationModule {}
