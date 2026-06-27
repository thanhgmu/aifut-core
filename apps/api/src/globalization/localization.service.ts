import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { SUPPORTED_LOCALES, Locale } from './localization.types';

@Injectable()
export class LocalizationService implements OnModuleInit {
  constructor(
    @Inject('I18N_DATA') private readonly i18nData: any
  ) {}

  async onModuleInit() {
    // Runtime Ready - Bộ từ điển I18N_DATA đã được nạp sạch lỗi font
  }

  /**
   * Trích xuất chính xác chuỗi văn bản từ Custom Provider theo cặp locale và scope
   * Cú pháp key: "scope.key" (Ví dụ: "common.save", "nav.dashboard")
   */
  translate(key: string, locale: Locale, fallback?: string): string {
    try {
      if (!key || !key.includes('.')) {
        return fallback ?? key;
      }

      const [scope, entryKey] = key.split('.');
      
      // Truy xuất cấu trúc: i18nData[locale][scope][entryKey]
      const translated = this.i18nData?.[locale]?.[scope]?.[entryKey];
      if (translated) return translated;

      // Fallback 1: Thử tìm ở ngôn ngữ mặc định 'en'
      const englishFallback = this.i18nData?.['en']?.[scope]?.[entryKey];
      if (englishFallback) return englishFallback;

      return fallback ?? key;
    } catch (error) {
      return fallback ?? key;
    }
  }

  /**
   * Lấy toàn bộ từ điển phẳng (Flat Key Record) cho một locale để Dashboard tiêu thụ
   */
  getAll(locale: Locale): Record<string, string> {
    const result: Record<string, string> = {};
    const targetLocaleData = this.i18nData?.[locale] || this.i18nData?.['en'];

    if (!targetLocaleData) {
      return result;
    }

    // Quét qua các scope (common, dashboard, awlPlayground, billing...)
    for (const [scope, entries] of Object.entries(targetLocaleData)) {
      if (entries && typeof entries === 'object') {
        for (const [entryKey, value] of Object.entries(entries)) {
          const flatKey = `${scope}.${entryKey}`;
          result[flatKey] = String(value);
        }
      }
    }

    return result;
  }

  /**
   * Lấy danh sách các ngôn ngữ được hệ thống hỗ trợ kèm tên tự dịch theo locale
   */
  getSupportedLocales() {
    return SUPPORTED_LOCALES.map((code) => ({
      code,
      name: this.translate('locale.name', code, code),
    }));
  }
}