"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../lib/auth";

type PackTemplate = {
  slug: string;
  name: string;
  industry: string;
  description: string;
};

type TemplatePack = {
  id: string;
  name: string;
  description: string;
  tagline: string;
  coverEmoji: string;
  price: number;
  currency: string;
  industry: string;
  templateCount: number;
  templates: PackTemplate[];
  highlights: string[];
  savingsNote?: string;
};

export default function TemplatesPage() {
  const [packs, setPacks] = useState<TemplatePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/template-packs`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setPacks(data);
        } else {
          setError("Không thể tải template packs");
        }
      } catch {
        setError("Lỗi kết nối API");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatPrice = (price: number, currency: string) => {
    if (currency === "VND") {
      return `${price.toLocaleString("vi-VN")}₫`;
    }
    return `$${(price / 25400).toFixed(2)}`;
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 12,
              color: "#9fb0ff",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            AIFUT Templates
          </div>
          <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>
            Industry Template Packs
          </h1>
          <p style={{ color: "#c8d2ff", fontSize: 16, maxWidth: 600 }}>
            Pre-built workflow templates organized by industry. Each pack includes ready-to-deploy
            workflows for Zalo, Email, SMS, and webhook notifications.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9fb0ff" }}>
            Loading template packs...
          </div>
        ) : error ? (
          <div
            style={{
              padding: 20,
              borderRadius: 16,
              background: "rgba(255,80,80,0.1)",
              border: "1px solid rgba(255,80,80,0.2)",
              color: "#ffb3b3",
            }}
          >
            {error}
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div
              style={{
                display: "flex",
                gap: 20,
                flexWrap: "wrap",
                marginBottom: 28,
                padding: "18px 22px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <Stat label="Template Packs" value={String(packs.length)} />
              <Stat
                label="Total Templates"
                value={String(packs.reduce((s, p) => s + p.templateCount, 0))}
              />
              <Stat
                label="Industries"
                value={String(new Set(packs.map((p) => p.industry)).size)}
              />
              <Stat
                label="Best Value"
                value={`${formatPrice(Math.min(...packs.map((p) => p.price)), "VND")}`}
                note="from"
              />
            </div>

            {/* Selected pack detail */}
            {selectedPack && (() => {
              const pack = packs.find((p) => p.id === selectedPack);
              if (!pack) return null;
              return (
                <div
                  style={{
                    marginBottom: 28,
                    padding: 24,
                    borderRadius: 20,
                    background: "linear-gradient(135deg, rgba(109,124,255,0.12), rgba(109,124,255,0.04))",
                    border: "1px solid rgba(109,124,255,0.25)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{pack.coverEmoji}</div>
                      <h2 style={{ fontSize: 24, margin: "0 0 4px" }}>{pack.name}</h2>
                      <div style={{ color: "#9fb0ff", fontSize: 14 }}>{pack.tagline}</div>
                      <p style={{ color: "#c8d2ff", fontSize: 14, margin: "12px 0", maxWidth: 500, lineHeight: 1.5 }}>
                        {pack.description}
                      </p>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                        {pack.highlights.map((h) => (
                          <span
                            key={h}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: "rgba(109,124,255,0.1)",
                              color: "#9fb0ff",
                              fontSize: 12,
                            }}
                          >
                            ✓ {h}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 32, fontWeight: 800 }}>
                        {formatPrice(pack.price, pack.currency)}
                      </div>
                      <div style={{ color: "#9fb0ff", fontSize: 13 }}>one-time</div>
                      {pack.savingsNote && (
                        <div
                          style={{
                            marginTop: 6,
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "rgba(80,200,120,0.12)",
                            color: "#80e0a0",
                            fontSize: 12,
                          }}
                        >
                          {pack.savingsNote}
                        </div>
                      )}
                      <button
                        onClick={() => setSelectedPack(null)}
                        style={{
                          marginTop: 12,
                          padding: "10px 20px",
                          borderRadius: 10,
                          border: "none",
                          background: "#6d7cff",
                          color: "white",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>

                  {/* Templates in this pack */}
                  <div style={{ marginTop: 20 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#9fb0ff",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginBottom: 12,
                      }}
                    >
                      Included templates ({pack.templateCount})
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {pack.templates.map((t) => (
                        <div
                          key={t.slug}
                          style={{
                            padding: "12px 16px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <strong>{t.name}</strong>
                            <div style={{ color: "#c8d2ff", fontSize: 13, marginTop: 2 }}>
                              {t.description}
                            </div>
                          </div>
                          <span
                            style={{
                              color: "#9fb0ff",
                              fontSize: 12,
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: "rgba(255,255,255,0.05)",
                            }}
                          >
                            {t.industry}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Pack grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 20,
              }}
            >
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  onClick={() => setSelectedPack(pack.id)}
                  style={{
                    padding: 22,
                    borderRadius: 18,
                    background:
                      selectedPack === pack.id
                        ? "linear-gradient(135deg, rgba(109,124,255,0.1), rgba(109,124,255,0.03))"
                        : "rgba(255,255,255,0.04)",
                    border:
                      selectedPack === pack.id
                        ? "1px solid rgba(109,124,255,0.3)"
                        : "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{pack.coverEmoji}</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#9fb0ff",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    {pack.industry}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{pack.name}</div>
                  <div style={{ color: "#c8d2ff", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                    {pack.tagline}
                  </div>
                  <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#9fb0ff", fontSize: 13 }}>
                      {pack.templateCount} templates
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>
                      {formatPrice(pack.price, pack.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state */}
            {packs.length === 0 && !loading && (
              <div
                style={{
                  textAlign: "center",
                  padding: 60,
                  color: "#9fb0ff",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>No template packs yet</div>
                <div style={{ marginTop: 8 }}>
                  Template packs will appear here once the API is available.
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer
          style={{
            marginTop: 60,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            color: "#9fb0ff",
            fontSize: 13,
          }}
        >
          <div>© 2026 AIFUT — Templates v1</div>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Home
            </Link>
            <Link href="/pricing" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Pricing
            </Link>
            <Link href="/billing" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Billing
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "#9fb0ff" }}>
        {note && <span style={{ marginRight: 4 }}>{note}</span>}
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
