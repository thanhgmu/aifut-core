"use client";

// ============================================================
// app/(dashboard)/billing/budget/budget-client-shell.tsx
// Client orchestration shell: loads budget dashboard data và
// composes budget-status-panel + budget-config-form.
//
// Xử lý các trạng thái: loading, empty, error, ready.
// Kết nối đến lib/budget.ts → backend budget controller.
//
// Hiển thị tối đa 3 panel (DAILY / WEEKLY / MONTHLY) +
// form cấu hình cho period chưa có limit.
// ============================================================

import type { CSSProperties } from "react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { BudgetLimit, BudgetPeriod, BudgetHealth } from "../../../../types/budget";
import {
  BUDGET_PERIODS,
  BUDGET_PERIOD_LABELS,
  BUDGET_STATUS_COLORS,
} from "../../../../types/budget";
import {
  fetchBudgetLimits,
  fetchBudgetHealth,
  fetchBudgetDashboard,
} from "../../../../lib/budget";
import { BudgetStatusPanel } from "../../../../components/billing/budget-status-panel";
import { BudgetConfigForm } from "../../../../components/billing/budget-config-form";

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

type LoadState = "loading" | "ready" | "empty" | "error";

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export function BudgetClientShell() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [limits, setLimits] = useState<BudgetLimit[]>([]);
  const [health, setHealth] = useState<BudgetHealth | null>(null);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // ─── Load data ───

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setError("");
    try {
      const { limits: newLimits, health: newHealth, error: loadErr } =
        await fetchBudgetDashboard();
      if (loadErr) {
        setError(loadErr);
        setLoadState("error");
        return;
      }
      setLimits(newLimits);
      setHealth(newHealth);
      if (newLimits.length === 0 && !newHealth) {
        setLoadState("empty");
      } else {
        setLoadState("ready");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải dữ liệu hạn mức",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Handlers ───

  const handleUnlocked = useCallback(
    (period: BudgetPeriod) => {
      setNotice({
        tone: "success",
        message: `✅ Budget ${BUDGET_PERIOD_LABELS[period]} đã được mở khoá thành công.`,
      });
      // Tự động reload
      setTimeout(() => {
        setNotice(null);
        loadData();
      }, 2000);
    },
    [loadData],
  );

  const handleUnlockError = useCallback((msg: string) => {
    setNotice({ tone: "error", message: `❌ ${msg}` });
    setTimeout(() => setNotice(null), 5000);
  }, []);

  const handleConfigSaved = useCallback(
    (limit: BudgetLimit) => {
      setNotice({
        tone: "success",
        message: `✅ Hạn mức ${BUDGET_PERIOD_LABELS[limit.period]} đã được lưu thành công: ${limit.maxCostAmountDisplay}`,
      });
      setTimeout(() => {
        setNotice(null);
        loadData();
      }, 2000);
    },
    [loadData],
  );

  const handleConfigError = useCallback((msg: string) => {
    setNotice({ tone: "error", message: `❌ ${msg}` });
    setTimeout(() => setNotice(null), 5000);
  }, []);

  // ─── Determine which periods need a config form ───

  const existingPeriods = new Set(limits.map((l) => l.period));
  const missingPeriods = BUDGET_PERIODS.filter(
    (p) => !existingPeriods.has(p),
  );

  // ─── Render state ───

  if (loadState === "loading") {
    return <PanelMessage tone="muted">Đang tải dữ liệu hạn mức AI…</PanelMessage>;
  }

  if (loadState === "error") {
    return (
      <PanelMessage tone="error">
        {error || "Đã xảy ra lỗi khi tải dữ liệu."}
        <div style={{ marginTop: 12 }}>
          <button onClick={loadData} style={retryBtn}>
            Thử lại
          </button>
        </div>
      </PanelMessage>
    );
  }

  if (loadState === "empty") {
    return (
      <PanelMessage tone="muted">
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 40 }}>📊</span>
        </div>
        <h2 style={{ color: "#f5f7ff", margin: "0 0 8px", fontSize: 22 }}>
          Chưa có hạn mức nào
        </h2>
        <p style={{ color: "#c8d2ff", maxWidth: 500, margin: "0 auto 16px", lineHeight: 1.6 }}>
          Bạn chưa thiết lập budget cho AI calls. Hãy tạo hạn mức cho ít nhất
          một chu kỳ (hàng ngày, hàng tuần, hoặc hàng tháng) để bắt đầu kiểm
          soát chi phí AI tự động.
        </p>
        <Link href="#config-daily" style={{ color: "#6d7cff", fontWeight: 700 }}>
          Tạo hạn mức ngay →
        </Link>
      </PanelMessage>
    );
  }

  // ─── Ready: render dashboard ───
  return (
    <div style={{ display: "grid", gap: 28 }}>
      {/* Notice toast */}
      {notice && (
        <div style={noticeBar(notice.tone)}>
          {notice.message}
        </div>
      )}

      {/* Health check banner */}
      {health && (
        <div style={healthBanner(health.allowed, health.status)}>
          <div style={healthBannerRow}>
            <span style={{ fontSize: 24 }}>
              {health.allowed ? "🟢" : "🔴"}
            </span>
            <div style={healthBannerTextBlock}>
              <div style={healthBannerTitle}>
                {health.allowed
                  ? "Budget AI đang hoạt động bình thường"
                  : "Budget AI đã bị chặn — cần mở khoá khẩn cấp"}
              </div>
              <div style={healthBannerSubtitle}>
                Đã tiêu: {formatCost(health.currentCostSpent)} /{" "}
                {formatCost(health.maxCostAmount)} · Mức sử dụng:{" "}
                {health.usagePercent.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Existing limit panels ─── */}
      {limits.length > 0 && (
        <div style={panelGrid}>
          {limits.map((limit) => (
            <BudgetStatusPanel
              key={limit.period}
              limit={limit}
              onUnlocked={handleUnlocked}
              onError={handleUnlockError}
            />
          ))}
        </div>
      )}

      {/* ─── Config forms for missing periods (or all if none exist) ─── */}
      <div style={configSection}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f5f7ff", margin: 0 }}>
          {limits.length === 0
            ? "Thiết lập hạn mức mới"
            : "Cấu hình bổ sung"}
        </h2>
        <p style={{ color: "#9fb0ff", fontSize: 13, margin: "4px 0 16px" }}>
          {limits.length === 0
            ? "Chọn chu kỳ và nhập số tiền tối đa để bắt đầu."
            : `Bạn có thể thêm hạn mức cho các chu kỳ còn lại hoặc cập nhật hạn mức hiện có.`}
        </p>

        <div style={configGrid}>
          {/* Forms for missing periods */}
          {missingPeriods.map((period) => {
            const existingLimit = limits.find((l) => l.period === period) ?? null;
            return (
              <div key={period} id={`config-${period.toLowerCase()}`}>
                <BudgetConfigForm
                  existingLimit={existingLimit}
                  period={period}
                  onSaved={handleConfigSaved}
                  onError={handleConfigError}
                />
              </div>
            );
          })}

          {/* Nếu tất cả period đã có limit → show form update cho từng period */}
          {missingPeriods.length === 0 &&
            limits.map((limit) => (
              <div key={`update-${limit.period}`} id={`config-${limit.period.toLowerCase()}`}>
                <BudgetConfigForm
                  existingLimit={limit}
                  period={limit.period}
                  onSaved={handleConfigSaved}
                  onError={handleConfigError}
                />
              </div>
            ))}
        </div>
      </div>

      {/* ─── Tips / Help ─── */}
      <div style={tipsSection}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f7ff", margin: "0 0 10px" }}>
          💡 Mẹo sử dụng hạn mức
        </h3>
        <ul style={{ margin: 0, padding: "0 0 0 20px", color: "#c8d2ff", fontSize: 13, lineHeight: 2 }}>
          <li>
            <strong>DAILY:</strong> Phù hợp nếu bạn có workload AI không thường xuyên, chỉ muốn giới hạn rủi ro trong ngày.
          </li>
          <li>
            <strong>WEEKLY:</strong> Phù hợp cho team phát triển với budget hàng tuần cố định.
          </li>
          <li>
            <strong>MONTHLY:</strong> Phù hợp nếu bạn có subscription theo tháng và muốn align với chu kỳ thanh toán.
          </li>
          <li>
            <strong>Ngưỡng cảnh báo:</strong> Giá trị mặc định 80%. Khi đạt ngưỡng, hệ thống chặn các AI request mới không ưu tiên.
          </li>
          <li>
            <strong>Emergency Unlock:</strong> Chỉ xuất hiện khi budget bị khoá. Nhấn để mở khoá ngay lập tức — hữu ích khi cần chạy AI request gấp.
          </li>
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function PanelMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "muted" | "error";
}) {
  return (
    <div
      style={{
        padding: 40,
        borderRadius: 20,
        textAlign: "center",
        background:
          tone === "error" ? "rgba(255,80,80,0.08)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${
          tone === "error" ? "rgba(255,80,80,0.2)" : "rgba(255,255,255,0.08)"
        }`,
        color: tone === "error" ? "#ffb3b3" : "#c8d2ff",
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatCost(amount: string): string {
  try {
    const num = BigInt(amount);
    return `${num.toLocaleString("vi-VN")}₫`;
  } catch {
    return "0₫";
  }
}

// ─────────────────────────────────────────────────────────────
// INLINE STYLES
// ─────────────────────────────────────────────────────────────

const retryBtn: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const noticeBar = (tone: "success" | "error" | "info"): CSSProperties => {
  const bgMap = {
    success: "rgba(80,200,120,0.1)",
    error: "rgba(255,80,80,0.1)",
    info: "rgba(109,124,255,0.1)",
  };
  const borderMap = {
    success: "rgba(80,200,120,0.2)",
    error: "rgba(255,80,80,0.2)",
    info: "rgba(109,124,255,0.2)",
  };
  const colorMap = {
    success: "#b3ffcc",
    error: "#ffb3b3",
    info: "#c8d2ff",
  };
  return {
    padding: 14,
    borderRadius: 12,
    background: bgMap[tone],
    border: `1px solid ${borderMap[tone]}`,
    color: colorMap[tone],
    fontWeight: 600,
    fontSize: 14,
  };
};

const healthBanner = (
  allowed: boolean,
  status: string,
): CSSProperties => {
  const isBlocked = !allowed || status === "SOFT_LOCKED" || status === "HARD_LOCKED";
  return {
    padding: 16,
    borderRadius: 14,
    background: isBlocked
      ? "rgba(255,80,80,0.06)"
      : "rgba(80,200,120,0.06)",
    border: `1px solid ${
      isBlocked ? "rgba(255,80,80,0.15)" : "rgba(80,200,120,0.15)"
    }`,
  };
};

const healthBannerRow: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

const healthBannerTextBlock: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const healthBannerTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#f5f7ff",
};

const healthBannerSubtitle: CSSProperties = {
  fontSize: 13,
  color: "#c8d2ff",
};

const panelGrid: CSSProperties = {
  display: "grid",
  gap: 16,
};

const configSection: CSSProperties = {
  marginTop: 8,
};

const configGrid: CSSProperties = {
  display: "grid",
  gap: 20,
};

const tipsSection: CSSProperties = {
  marginTop: 12,
  padding: 20,
  borderRadius: 16,
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
};
