import { Controller, Get, Param } from '@nestjs/common';
import { GLOBALIZATION_FOUNDATION_ROADMAP } from './globalization.constants';
import { LocalizationService } from './localization.service';
import { SUPPORTED_LOCALES, Locale } from './localization.types';

@Controller('globalization')
export class GlobalizationController {
  constructor(private readonly localization: LocalizationService) {}

  @Get('locales')
  locales() {
    return this.localization.getSupportedLocales();
  }

  @Get('translations/:locale')
  translations(@Param('locale') locale: string) {
    const loc = (SUPPORTED_LOCALES.includes(locale as Locale) ? locale : 'en') as Locale;
    return { locale: loc, translations: this.localization.getAll(loc) };
  }

  @Get('translate/:locale/:key')
  translate(@Param('locale') locale: string, @Param('key') key: string) {
    const loc = (SUPPORTED_LOCALES.includes(locale as Locale) ? locale : 'en') as Locale;
    return { key, locale: loc, translated: this.localization.translate(key, loc) };
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'globalization',
      status: 'expanded',
      supports: {
        locales: SUPPORTED_LOCALES.length,
        multiCurrency: true,
        translation: true,
      },
      locales: SUPPORTED_LOCALES,
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'globalization',
      roadmap: GLOBALIZATION_FOUNDATION_ROADMAP,
    };
  }
}
