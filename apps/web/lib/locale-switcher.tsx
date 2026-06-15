"use client";

import { useI18n, SUPPORTED_LOCALES } from "./i18n";

const FLAG_EMOJIS: Record<string, string> = {
  vi: "🇻🇳",
  en: "🇬🇧",
  th: "🇹🇭",
  id: "🇮🇩",
  ms: "🇲🇾",
  fil: "🇵🇭",
  zh: "🇨🇳",
};

export function LocaleSwitcher({ compact }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();

  if (compact) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as any)}
          style={{
            appearance: "none",
            background: "rgba(255,255,255,0.06)",
            color: "#f5f7ff",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 14,
            cursor: "pointer",
            outline: "none",
            fontFamily: "Arial, sans-serif",
          }}
          aria-label="Select language"
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l.code} value={l.code} style={{ background: "#1a1f35", color: "#f5f7ff" }}>
              {FLAG_EMOJIS[l.code] ?? ""} {l.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "#9fb0ff", marginRight: 6 }}>Language:</span>
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code as any)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: locale === l.code ? "1px solid #6d7cff" : "1px solid rgba(255,255,255,0.1)",
            background: locale === l.code ? "rgba(109,124,255,0.15)" : "transparent",
            color: locale === l.code ? "#6d7cff" : "#9fb0ff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: locale === l.code ? 700 : 400,
            transition: "all 0.1s",
          }}
          title={l.name}
        >
          {FLAG_EMOJIS[l.code] ?? ""} {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
