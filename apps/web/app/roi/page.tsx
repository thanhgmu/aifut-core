"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

type Industry = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  avgMonthlyOrders: number;
  avgOrderValue: number;
  laborHoursSavedPerOrder: number;
  laborRatePerHour: number;
  missedFollowupRate: number;
  customerLifetimeValue: number;
  retentionImprovement: number;
};

const INDUSTRIES: Industry[] = [
  {
    id: "restaurant",
    name: "Nhà hàng / F&B",
    emoji: "🍽️",
    description: "Xác nhận đơn, thông báo bếp, feedback khách hàng",
    avgMonthlyOrders: 1500,
    avgOrderValue: 200000,
    laborHoursSavedPerOrder: 0.15,
    laborRatePerHour: 25000,
    missedFollowupRate: 0.35,
    customerLifetimeValue: 3000000,
    retentionImprovement: 0.08,
  },
  {
    id: "retail",
    name: "Bán lẻ / E-commerce",
    emoji: "🛒",
    description: "Xác nhận đơn, recovery giỏ hàng, đánh giá",
    avgMonthlyOrders: 800,
    avgOrderValue: 350000,
    laborHoursSavedPerOrder: 0.12,
    laborRatePerHour: 25000,
    missedFollowupRate: 0.40,
    customerLifetimeValue: 5000000,
    retentionImprovement: 0.10,
  },
  {
    id: "healthcare",
    name: "Phòng khám / Nha khoa",
    emoji: "🏥",
    description: "Đặt lịch, nhắc tái khám, quản lý bệnh nhân",
    avgMonthlyOrders: 400,
    avgOrderValue: 500000,
    laborHoursSavedPerOrder: 0.20,
    laborRatePerHour: 35000,
    missedFollowupRate: 0.30,
    customerLifetimeValue: 8000000,
    retentionImprovement: 0.12,
  },
  {
    id: "education",
    name: "Giáo dục / Đào tạo",
    emoji: "📚",
    description: "Nhắc lịch học, báo cáo phụ huynh, học phí",
    avgMonthlyOrders: 300,
    avgOrderValue: 800000,
    laborHoursSavedPerOrder: 0.18,
    laborRatePerHour: 30000,
    missedFollowupRate: 0.25,
    customerLifetimeValue: 12000000,
    retentionImprovement: 0.15,
  },
  {
    id: "beauty",
    name: "Spa / Salon / Gym",
    emoji: "💆",
    description: "Đặt lịch, nhắc hẹn, duy trì membership",
    avgMonthlyOrders: 600,
    avgOrderValue: 300000,
    laborHoursSavedPerOrder: 0.10,
    laborRatePerHour: 25000,
    missedFollowupRate: 0.30,
    customerLifetimeValue: 6000000,
    retentionImprovement: 0.12,
  },
  {
    id: "services",
    name: "Dịch vụ chuyên nghiệp",
    emoji: "💼",
    description: "Luật, kế toán, IT support, agency",
    avgMonthlyOrders: 150,
    avgOrderValue: 2000000,
    laborHoursSavedPerOrder: 0.30,
    laborRatePerHour: 50000,
    missedFollowupRate: 0.20,
    customerLifetimeValue: 30000000,
    retentionImprovement: 0.10,
  },
  {
    id: "automotive",
    name: "Gara / Vận tải",
    emoji: "🚗",
    description: "Bảo dưỡng, cho thuê, logistics",
    avgMonthlyOrders: 200,
    avgOrderValue: 1500000,
    laborHoursSavedPerOrder: 0.25,
    laborRatePerHour: 40000,
    missedFollowupRate: 0.25,
    customerLifetimeValue: 15000000,
    retentionImprovement: 0.08,
  },
  {
    id: "hotel",
    name: "Khách sạn / Du lịch",
    emoji: "🏨",
    description: "Đặt phòng, check-in, feedback",
    avgMonthlyOrders: 300,
    avgOrderValue: 1000000,
    laborHoursSavedPerOrder: 0.15,
    laborRatePerHour: 30000,
    missedFollowupRate: 0.20,
    customerLifetimeValue: 5000000,
    retentionImprovement: 0.10,
  },
];

function formatPrice(vnd: number): string {
  if (vnd >= 1_000_000) {
    return `${(vnd / 1_000_000).toFixed(1)}M₫`;
  }
  if (vnd >= 1_000) {
    return `${(vnd / 1_000).toFixed(0)}K₫`;
  }
  return `${vnd}₫`;
}

export default function RoiCalculatorPage() {
  const [selectedIndustry, setSelectedIndustry] = useState<string>("restaurant");
  const [customOrders, setCustomOrders] = useState<number | null>(null);
  const [customAvgValue, setCustomAvgValue] = useState<number | null>(null);

  const industry = INDUSTRIES.find((i) => i.id === selectedIndustry) || INDUSTRIES[0];

  const monthlyOrders = customOrders ?? industry.avgMonthlyOrders;
  const avgOrderValue = customAvgValue ?? industry.avgOrderValue;

  // Calculations
  const laborHoursPerMonth = monthlyOrders * industry.laborHoursSavedPerOrder;
  const laborCostPerMonth = laborHoursPerMonth * industry.laborRatePerHour;
  const laborCostPerYear = laborCostPerMonth * 12;

  const revenueAtRisk = monthlyOrders * avgOrderValue * industry.missedFollowupRate;
  const recoveredRevenuePerYear = revenueAtRisk * 12;

  const retentionValuePerYear =
    monthlyOrders * avgOrderValue * 12 * industry.retentionImprovement;

  const totalAnnualBenefit = laborCostPerYear + recoveredRevenuePerYear + retentionValuePerYear;

  const templatePackPrice = 39000;
  const monthlyAICost = monthlyOrders * 0.5 * 50; // ~50đ/AI call, 0.5 calls per order
  const annualCost = templatePackPrice + monthlyAICost * 12;

  const netAnnualBenefit = totalAnnualBenefit - annualCost;
  const roiPercent = annualCost > 0 ? Math.round((netAnnualBenefit / annualCost) * 100) : 0;

  const monthlyLaborHours = Math.round(laborHoursPerMonth * 10) / 10;

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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            AIFUT ROI Calculator
          </div>
          <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>
            Tính toán lợi ích tự động hóa
          </h1>
          <p style={{ color: "#c8d2ff", fontSize: 16, maxWidth: 600, margin: "0 auto" }}>
            Xem ngành của bạn tiết kiệm được bao nhiêu khi tự động hóa với AIFUT workflow templates.
          </p>
        </div>

        {/* Industry selector */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
            marginBottom: 28,
          }}
        >
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.id}
              onClick={() => setSelectedIndustry(ind.id)}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border:
                  selectedIndustry === ind.id
                    ? "1px solid #6d7cff"
                    : "1px solid rgba(255,255,255,0.08)",
                background:
                  selectedIndustry === ind.id
                    ? "rgba(109,124,255,0.1)"
                    : "rgba(255,255,255,0.03)",
                color: selectedIndustry === ind.id ? "#6d7cff" : "#c8d2ff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: selectedIndustry === ind.id ? 700 : 400,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{ind.emoji}</div>
              <div>{ind.name}</div>
            </button>
          ))}
        </div>

        {/* Custom inputs */}
        <div
          style={{
            padding: 20,
            borderRadius: 16,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            marginBottom: 28,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <label style={{ display: "block", color: "#9fb0ff", fontSize: 13, marginBottom: 6 }}>
              {industry.emoji} Số đơn/tháng
            </label>
            <input
              type="number"
              value={customOrders ?? industry.avgMonthlyOrders}
              onChange={(e) =>
                setCustomOrders(e.target.value ? Number(e.target.value) : null)
              }
              placeholder={String(industry.avgMonthlyOrders)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.3)",
                color: "#f5f7ff",
                fontSize: 14,
                outline: "none",
              }}
            />
            <div style={{ color: "#9fb0ff", fontSize: 11, marginTop: 4 }}>
              Mặc định: {industry.avgMonthlyOrders.toLocaleString()}
            </div>
          </div>
          <div>
            <label style={{ display: "block", color: "#9fb0ff", fontSize: 13, marginBottom: 6 }}>
              💰 Giá trị trung bình/đơn (₫)
            </label>
            <input
              type="number"
              value={customAvgValue ?? avgOrderValue}
              onChange={(e) =>
                setCustomAvgValue(e.target.value ? Number(e.target.value) : null)
              }
              placeholder={String(industry.avgOrderValue)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.3)",
                color: "#f5f7ff",
                fontSize: 14,
                outline: "none",
              }}
            />
            <div style={{ color: "#9fb0ff", fontSize: 11, marginTop: 4 }}>
              Mặc định: {formatPrice(industry.avgOrderValue)}
            </div>
          </div>
        </div>

        {/* ROI result */}
        <div
          style={{
            padding: 28,
            borderRadius: 24,
            background: `linear-gradient(135deg, rgba(109,124,255,0.12), rgba(${roiPercent > 500 ? "80,200,120" : "255,180,80"},0.05))`,
            border: "1px solid rgba(109,124,255,0.2)",
            marginBottom: 28,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                {industry.emoji} {industry.name}
              </div>
              <h2 style={{ fontSize: 28, margin: "0 0 4px" }}>ROI dự kiến</h2>
              <div style={{ color: "#c8d2ff", fontSize: 14 }}>{industry.description}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 800,
                  color: roiPercent > 500 ? "#80e0a0" : roiPercent > 200 ? "#ffb366" : "#ff8080",
                }}
              >
                {roiPercent > 1000 ? `${(roiPercent / 100).toFixed(1)}x` : `${roiPercent}%`}
              </div>
              <div style={{ color: "#9fb0ff", fontSize: 13 }}>ROI hàng năm</div>
            </div>
          </div>

          {/* Benefit breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 24 }}>
            <BenefitCard
              icon="⏱️"
              label="Tiết kiệm nhân công"
              value={`${formatPrice(laborCostPerYear)}/năm`}
              detail={`${monthlyLaborHours} giờ/tháng × ${formatPrice(industry.laborRatePerHour)}/giờ`}
            />
            <BenefitCard
              icon="💰"
              label="Doanh thu phục hồi"
              value={`${formatPrice(recoveredRevenuePerYear)}/năm`}
              detail={`${monthlyOrders.toLocaleString()} đơn × ${industry.missedFollowupRate * 100}% follow-up bị bỏ lỡ`}
            />
            <BenefitCard
              icon="❤️"
              label="Giữ chân khách hàng"
              value={`${formatPrice(retentionValuePerYear)}/năm`}
              detail={`Cải thiện retention ${industry.retentionImprovement * 100}%`}
            />
          </div>

          {/* Net calculation */}
          <div style={{ marginTop: 24, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "#c8d2ff" }}>Tổng lợi ích hàng năm</span>
              <span style={{ fontWeight: 700, color: "#80e0a0" }}>+{formatPrice(totalAnnualBenefit)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "#c8d2ff" }}>Chi phí template pack</span>
              <span style={{ fontWeight: 700 }}>-{formatPrice(templatePackPrice)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "#c8d2ff" }}>Chi phí AI hàng năm</span>
              <span style={{ fontWeight: 700 }}>-{formatPrice(monthlyAICost * 12)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 20 }}>
              <span style={{ fontWeight: 700 }}>Lợi nhuận ròng hàng năm</span>
              <span style={{ fontWeight: 800, color: "#80e0a0" }}>
                +{formatPrice(netAnnualBenefit)}
              </span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div
          style={{
            padding: 24,
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(109,124,255,0.08), rgba(80,200,120,0.05))",
            border: "1px solid rgba(109,124,255,0.15)",
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            Sẵn sàng bắt đầu?
          </div>
          <div style={{ color: "#c8d2ff", fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
            Chọn template pack cho ngành của bạn — triển khai trong 5 phút, thấy kết quả ngay ngày đầu tiên.
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/templates"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 12,
                background: "#6d7cff",
                color: "white",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              Xem Template Packs
            </Link>
            <Link
              href="/foundation/awl-playground"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#f5f7ff",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              Thử AWL Playground
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer
          style={{
            marginTop: 16,
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
          <div>© 2026 AIFUT — ROI Calculator v1</div>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Home
            </Link>
            <Link href="/templates" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Templates
            </Link>
            <Link href="/pricing" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Pricing
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function BenefitCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: "#9fb0ff", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0" }}>{value}</div>
      <div style={{ color: "#c8d2ff", fontSize: 12, lineHeight: 1.5 }}>{detail}</div>
    </div>
  );
}
