"use client";

import { useCallback, useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { API_BASE } from "./auth";

/** Supported locale codes (must match backend) */
export type Locale = "vi" | "en" | "th" | "id" | "ms" | "fil" | "zh";

export const SUPPORTED_LOCALES: { code: Locale; name: string }[] = [
  { code: "vi", name: "Tiếng Việt" },
  { code: "en", name: "English" },
  { code: "th", name: "ไทย" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "ms", name: "Bahasa Melayu" },
  { code: "fil", name: "Filipino" },
  { code: "zh", name: "中文" },
];

const LOCALE_STORAGE_KEY = "aifut_locale";
const TRANSLATIONS_CACHE = new Map<string, Record<string, string>>();

/** Detect browser default locale, fall back to 'en' */
function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) return stored;

  const nav = navigator.language?.slice(0, 2) as Locale;
  if (SUPPORTED_LOCALES.some((l) => l.code === nav)) return nav;
  return "en";
}

// ── Context ────────────────────────────────────────────────────────────

type I18nContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
  loading: boolean;
};

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key: string, fb?: string) => fb ?? key,
  loading: true,
});

export function useI18n() {
  return useContext(I18nContext);
}

// ── Provider ────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detected = detectLocale();
    setLocaleState(detected);
    loadTranslations(detected);
  }, []);

  const loadTranslations = async (loc: Locale) => {
    setLoading(true);
    try {
      // Check cache first
      const cached = TRANSLATIONS_CACHE.get(loc);
      if (cached) {
        setTranslations(cached);
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/globalization/translations/${loc}`);
      if (res.ok) {
        const data = await res.json();
        const tMap: Record<string, string> = data.translations ?? data ?? {};
        TRANSLATIONS_CACHE.set(loc, tMap);
        setTranslations(tMap);
      }
    } catch {
      // Silent fail — fall through to default keys
    } finally {
      setLoading(false);
    }
  };

  const setLocale = useCallback(
    (newLocale: Locale) => {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      setLocaleState(newLocale);
      loadTranslations(newLocale);
    },
    [],
  );

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return translations[key] ?? fallback ?? key;
    },
    [translations],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, loading }}>
      {children}
    </I18nContext.Provider>
  );
}

// ── Direct translation (for server components / non-hook usage) ────────

export async function fetchTranslation(locale: Locale, key: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/globalization/translate/${locale}/${encodeURIComponent(key)}`);
    if (res.ok) {
      const data = await res.json();
      return data.translation ?? key;
    }
  } catch {}
  return key;
}
