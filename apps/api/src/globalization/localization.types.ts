export type Locale = 'vi' | 'en' | 'th' | 'id' | 'ms' | 'fil' | 'zh';

export const SUPPORTED_LOCALES: Locale[] = ['vi', 'en', 'th', 'id', 'ms', 'fil', 'zh'];

export const LOCALE_NAMES: Record<Locale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
  fil: 'Filipino',
  zh: '中文',
};
