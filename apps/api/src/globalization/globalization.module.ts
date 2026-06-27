import { Module } from '@nestjs/common';
import { GlobalizationController } from './globalization.controller';
import { LocalizationService } from './localization.service';
import { I18N_DICTIONARY } from './i18n-dictionary';

@Module({
  controllers: [GlobalizationController],
  providers: [LocalizationService, { provide: 'I18N_DATA', useValue: I18N_DICTIONARY }],
  exports: [LocalizationService, 'I18N_DATA'],
})
export class GlobalizationModule {}
