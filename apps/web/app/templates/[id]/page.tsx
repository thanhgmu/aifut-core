"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../lib/auth";

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

const INDUSTRY_NAMES: Record<string, string> = {
  food: "F&B",
  retail: "Bán lẻ",
  healthcare: "Y tế",
  automotive: "Ô tô & Vận tải",
  logistics: "Logistics",
  education: "Giáo dục",
  services: "Dịch vụ",
  beauty: "Làm đẹp",
  fitness: "Thể hình",
  hospitality: "Khách sạn",
  travel: "Du lịch",
  legal: "Pháp lý",
  accounting: "Kế toán",
};

const FAQS: Record<string, { q: string; a: string }[]> = {
  default: [
    { q: "Sau khi mua, tôi nhận template như thế nào?", a: "Template được deploy trực tiếp vào workspace AIFUT của bạn. Bạn có thể xem, chỉnh sửa, và kích hoạt ngay lập tức mà không cần cài đặt thêm." },
    { q: "Template có hỗ trợ Zalo không?", a: "Có. Tất cả template đều hỗ trợ Zalo, Email, SMS, Webhook. Bạn chọn kênh phù hợp khi deploy." },
    { q: "Tôi có thể tùy chỉnh template không?", a: "Có. Template là AWL (AIFUT Workflow Language) — bạn có thể chỉnh sửa trực tiếp trong AWL Playground hoặc dùng AI để modify." },
    { q: "Có hỗ trợ sau khi mua không?", a: "Có. Bao gồm hướng dẫn deploy chi tiết và hỗ trợ qua Zalo/Email trong 7 ngày đầu." },
  ],
};

function formatPrice(price: number, currency: string): string {
  if (currency === "VND") return `${price.toLocaleString("vi-VN")}₫`;
  return `$${(price / 25400).toFixed(2)}`;
}

export default function TemplatePackDetailPage() {
  const params = useParams();
  const packId = params?.id as string;

  const [pack, setPack] = useState<TemplatePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!packId) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/template-packs/${packId}`, { cache: "no-store" });
        if (res.ok) {
          setPack(await res.json());
        } else {
          setError("Không tìm thấy template pack");
        }
      } catch {
        setError("Lỗi kết nối");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [packId]);

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9fb0ff" }}>Loading...</div>
      </main>
    );
  }

  if (error || !pack) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif", padding: 40 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <h1>{error || "Pack not found"}</h1>
          <Link href="/templates" style={{ color: "#6d7cff", textDecoration: "underline" }}>← Back to all packs</Link>
        </div>
      </main>
    );
  }

  const totalPrice = pack.price * qty;
  const faqs = FAQS[pack.id] || FAQS.default || [];

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, rgba(109,124,255,0.12), transparent)", padding: "48px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Link href="/templates" style={{ color: "#9fb0ff", fontSize: 14, textDecoration: "none", display: "inline-block", marginBottom: 20 }}>← All Template Packs</Link>

          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{pack.coverEmoji}</div>
              <div style={{ fontSize: 14, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                {INDUSTRY_NAMES[pack.industry] || pack.industry}
              </div>
              <h1 style={{ fontSize: 36, margin: "0 0 8px" }}>{pack.name}</h1>
              <p style={{ fontSize: 16, color: "#c8d2ff", lineHeight: 1.6, margin: "0 0 16px" }}>
                {pack.description}
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                {pack.highlights.map((h) => (
                  <span key={h} style={{ padding: "4px 12px", borderRadius: 6, background: "rgba(109,124,255,0.1)", color: "#9fb0ff", fontSize: 13 }}>✓ {h}</span>
                ))}
              </div>

              {pack.savingsNote && (
                <div style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(80,200,120,0.1)", color: "#80e0a0", fontSize: 13, display: "inline-block" }}>
                  💰 {pack.savingsNote}
                </div>
              )}
            </div>

            {/* Pricing card */}
            <div style={{ width: 300, padding: 24, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 24 }}>
              <div style={{ fontSize: 14, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Price</div>
              <div style={{ fontSize: 36, fontWeight: 800 }}>{formatPrice(pack.price, pack.currency)}</div>
              <div style={{ color: "#9fb0ff", fontSize: 14, marginBottom: 16 }}>one-time — {pack.templateCount} templates</div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ color: "#c8d2ff", fontSize: 14 }}>Qty:</span>
                <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "white", cursor: "pointer" }}>−</button>
                <span style={{ fontSize: 18, fontWeight: 700, width: 40, textAlign: "center" }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "white", cursor: "pointer" }}>+</button>
              </div>

              <button style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#6d7cff", color: "white", fontWeight: 700, fontSize: 16, cursor: "pointer", marginBottom: 8 }}>
                Add to Cart — {formatPrice(totalPrice, pack.currency)}
              </button>

              <div style={{ color: "#9fb0ff", fontSize: 12, textAlign: "center" }}>
                Instant delivery • No setup fee
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Templates list */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <h2 style={{ fontSize: 24, marginBottom: 20 }}>Included Templates ({pack.templateCount})</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {pack.templates.map((t, idx) => (
            <div key={t.slug} style={{ padding: "16px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(109,124,255,0.15)", color: "#6d7cff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>
                    <strong>{t.name}</strong>
                  </div>
                  <div style={{ color: "#c8d2ff", fontSize: 13, marginTop: 6, marginLeft: 34 }}>{t.description}</div>
                </div>
                <span style={{ padding: "2px 10px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#9fb0ff", fontSize: 12, whiteSpace: "nowrap" }}>{INDUSTRY_NAMES[t.industry] || t.industry}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROI section */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>
        <div style={{ padding: 28, borderRadius: 20, background: "rgba(109,124,255,0.06)", border: "1px solid rgba(109,124,255,0.15)", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tính toán ROI</div>
          <h2 style={{ fontSize: 22, margin: "0 0 12px" }}>Ngành của bạn tiết kiệm được bao nhiêu?</h2>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginBottom: 18, maxWidth: 500, margin: "0 auto 18px" }}>
            Dùng ROI Calculator để xem tự động hóa với AIFUT mang lại lợi ích gì cho doanh nghiệp của bạn.
          </p>
          <Link href={`/roi`} style={{ display: "inline-block", padding: "12px 24px", borderRadius: 12, background: "#6d7cff", color: "white", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>
            Tính ROI ngay →
          </Link>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>
        <h2 style={{ fontSize: 24, marginBottom: 20 }}>FAQ</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {faqs.map((faq, i) => (
            <details key={i} style={{ padding: "16px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
              <summary style={{ fontWeight: 700, fontSize: 15, color: "#f5f7ff" }}>{faq.q}</summary>
              <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 60px", textAlign: "center" }}>
        <div style={{ padding: 32, borderRadius: 24, background: "linear-gradient(135deg, rgba(109,124,255,0.1), rgba(80,200,120,0.05))", border: "1px solid rgba(109,124,255,0.15)" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{pack.coverEmoji}</div>
          <h2 style={{ fontSize: 24, margin: "0 0 6px" }}>Sẵn sàng tự động hóa?</h2>
          <p style={{ color: "#c8d2ff", fontSize: 15, marginBottom: 20, maxWidth: 500, margin: "0 auto 20px" }}>
            Mua {pack.name} hôm nay — triển khai trong 5 phút, thấy kết quả ngay ngày đầu tiên.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={{ padding: "14px 32px", borderRadius: 12, border: "none", background: "#6d7cff", color: "white", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
              Mua ngay — {formatPrice(pack.price, pack.currency)}
            </button>
            <Link href="/foundation/awl-playground" style={{ padding: "14px 32px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "white", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>
              Thử AWL Playground
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ maxWidth: 900, margin: "0 auto", padding: "24px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, color: "#9fb0ff", fontSize: 13 }}>
        <div>© 2026 AIFUT — {pack.name}</div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>Home</Link>
          <Link href="/templates" style={{ color: "#9fb0ff", textDecoration: "none" }}>Templates</Link>
          <Link href="/pricing" style={{ color: "#9fb0ff", textDecoration: "none" }}>Pricing</Link>
        </div>
      </footer>
    </main>
  );
}
