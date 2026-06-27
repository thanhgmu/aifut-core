"use client";

// ============================================================
// app/(dashboard)/reseller/page.tsx
// Cổng điều phối Đại lý & Phân phối Thương hiệu
// (Reseller & Distribution Branded Portal Console)
//
// Client Component: quản lý tài khoản đại lý đa cấp, theo dõi
// tỷ lệ hoa hồng, cấp phát AI Budget cho nhánh con.
//
// Xử lý các trạng thái:
//   - loading  → Skeleton placeholder
//   - empty    → Thông báo trống + gợi ý tạo mới
//   - error    → Error card với nút thử lại
//   - ready    → Bảng dữ liệu mock sub-tenants + thẻ chỉ số
//
// Pattern: dark theme (#0b1020), Glass Card, accent xanh indigo.
// ============================================================

import type { CSSProperties, MouseEvent } from "react";
import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type TenantStatus = "active" | "locked";

interface SubTenant {
  id: string;
  tenantName: string;
  plan: string;
  commissionRate: number; // %
  aiBudget: number; // USD
  status: TenantStatus;
  joinedAt: string; // ISO date
}

interface FinancialMetrics {
  totalRevenue: number; // USD
  availableCommission: number; // USD
  activeSubTenants: number;
}

type LoadState = "loading" | "ready" | "empty" | "error";

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const MOCK_METRICS: FinancialMetrics = {
  totalRevenue: 248_500,
  availableCommission: 37_280,
  activeSubTenants: 12,
};

const MOCK_SUB_TENANTS: SubTenant[] = [
  {
    id: "st-001",
    tenantName: "Công ty TNHH Thương mại Đông Á",
    plan: "Enterprise",
    commissionRate: 15,
    aiBudget: 500,
    status: "active",
    joinedAt: "2026-03-10T08:00:00Z",
  },
  {
    id: "st-002",
    tenantName: "Dịch vụ Kỹ thuật số Nam Long",
    plan: "Business",
    commissionRate: 12,
    aiBudget: 300,
    status: "active",
    joinedAt: "2026-04-05T09:30:00Z",
  },
  {
    id: "st-003",
    tenantName: "Giải pháp Công nghệ Bách Khoa",
    plan: "Enterprise",
    commissionRate: 18,
    aiBudget: 750,
    status: "active",
    joinedAt: "2026-04-22T14:15:00Z",
  },
  {
    id: "st-004",
    tenantName: "Thương mại Điện tử VinCommerce",
    plan: "Starter",
    commissionRate: 10,
    aiBudget: 150,
    status: "locked",
    joinedAt: "2026-05-01T10:00:00Z",
  },
  {
    id: "st-005",
    tenantName: "Hệ thống Bán lẻ Hoàng Gia",
    plan: "Business",
    commissionRate: 12,
    aiBudget: 300,
    status: "active",
    joinedAt: "2026-05-12T16:45:00Z",
  },
  {
    id: "st-006",
    tenantName: "Startup AI An Việt",
    plan: "Starter",
    commissionRate: 10,
    aiBudget: 100,
    status: "active",
    joinedAt: "2026-06-01T07:20:00Z",
  },
  {
    id: "st-007",
    tenantName: "Nhà phân phối Miền Tây",
    plan: "Business",
    commissionRate: 14,
    aiBudget: 250,
    status: "active",
    joinedAt: "2026-06-08T11:30:00Z",
  },
  {
    id: "st-008",
    tenantName: "Tập đoàn Số Hoá Việt Nam",
    plan: "Enterprise",
    commissionRate: 20,
    aiBudget: 1200,
    status: "active",
    joinedAt: "2026-06-15T09:00:00Z",
  },
];

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  Enterprise: "#8b5cf6",
  Business: "#3b82f6",
  Starter: "#10b981",
};

const STATUS_LABELS: Record<TenantStatus, string> = {
  active: "Đang hoạt động",
  locked: "Đã khóa",
};

// ─────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────

const glassCard: CSSProperties = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 16,
  padding: "24px 28px",
};

const accentBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 24px",
  borderRadius: 10,
  background: "linear-gradient(135deg, #4f46e5, #6366f1)",
  border: "1px solid rgba(99,102,241,0.4)",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

// ─── Financial Metrics Widget ───

function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: string;
  accent: string;
}) {
  const cardStyle: CSSProperties = {
    ...glassCard,
    flex: "1 1 200px",
    minWidth: 180,
    padding: "20px 24px",
    position: "relative",
    overflow: "hidden",
  };
  const glowStyle: CSSProperties = {
    position: "absolute",
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${accent}15, transparent 70%)`,
    pointerEvents: "none",
  };
  return (
    <div style={cardStyle}>
      <div style={glowStyle} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: accent,
          fontFamily: "'Courier New', monospace",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Skeleton Row ───

function SkeletonRow() {
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "90px 1fr 110px 120px 90px 130px 110px",
    gap: 12,
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  };
  const skeletonBar: CSSProperties = {
    height: 14,
    borderRadius: 6,
    background: "rgba(255,255,255,0.06)",
  };
  return (
    <div style={rowStyle}>
      <div style={{ ...skeletonBar, width: 56 }} />
      <div style={{ ...skeletonBar, width: "80%" }} />
      <div style={{ ...skeletonBar, width: 70 }} />
      <div style={{ ...skeletonBar, width: 60 }} />
      <div style={{ ...skeletonBar, width: 50 }} />
      <div style={{ ...skeletonBar, width: 80 }} />
      <div style={{ ...skeletonBar, width: 60 }} />
    </div>
  );
}

// ─── Status Badge ───

function StatusBadge({ status }: { status: TenantStatus }) {
  const isActive = status === "active";
  const bg = isActive
    ? "rgba(16,185,129,0.12)"
    : "rgba(239,68,68,0.10)";
  const fg = isActive ? "#34d399" : "#f87171";
  const dotBg = isActive ? "#34d399" : "#f87171";

  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 20,
    background: bg,
    color: fg,
    fontSize: 12,
    fontWeight: 700,
  };

  return (
    <span style={badgeStyle}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotBg,
          display: "inline-block",
        }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Plan Badge ───

function PlanBadge({ plan }: { plan: string }) {
  const color = PLAN_COLORS[plan] || "#64748b";
  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    background: `${color}14`,
    color,
    fontSize: 11,
    fontWeight: 700,
  };
  return <span style={badgeStyle}>{plan}</span>;
}

// ─── Empty State ───

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const box: CSSProperties = {
    ...glassCard,
    textAlign: "center" as const,
    padding: "60px 28px",
  };
  return (
    <div style={box}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
      <h3 style={{ margin: "0 0 8px", color: "#e0e7ff", fontSize: 20 }}>
        Chưa có tài khoản đại lý nào
      </h3>
      <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 24px" }}>
        Bắt đầu cấp tài khoản Sub-Tenant đầu tiên để mở rộng mạng lưới phân phối.
      </p>
      <button style={accentBtn} onClick={onCreate}>
        + Cấp tài khoản Sub-Tenant
      </button>
    </div>
  );
}

// ─── Error State ───

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const box: CSSProperties = {
    ...glassCard,
    textAlign: "center" as const,
    padding: "48px 28px",
    border: "1px solid rgba(239,68,68,0.25)",
  };
  return (
    <div style={box}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <h3 style={{ margin: "0 0 6px", color: "#fca5a5", fontSize: 18 }}>
        Không thể tải danh sách đại lý
      </h3>
      <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 20px" }}>
        {message}
      </p>
      <button
        style={{
          ...accentBtn,
          background: "rgba(239,68,68,0.15)",
          border: "1px solid rgba(239,68,68,0.3)",
          color: "#fca5a5",
        }}
        onClick={onRetry}
      >
        ⟳ Thử lại
      </button>
    </div>
  );
}

// ─── Create Sub-Tenant Dialog ───

function CreateSubTenantDialog({ onClose }: { onClose: () => void }) {
  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  };
  const dialogBox: CSSProperties = {
    ...glassCard,
    width: "90%",
    maxWidth: 520,
    padding: "32px 36px",
    position: "relative" as const,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={dialogBox}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: "0 0 4px",
            color: "#e0e7ff",
            fontSize: 20,
          }}
        >
          Cấp tài khoản Sub-Tenant
        </h3>
        <p
          style={{
            color: "#94a3b8",
            fontSize: 13,
            margin: "0 0 24px",
          }}
        >
          Tạo tài khoản đại lý phân phối mới cho hệ thống của bạn.
        </p>
        <div
          style={{
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 10,
            padding: "12px 16px",
            color: "#fbbf24",
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          🚧 Chức năng tạo tài khoản đang được phát triển. Vui lòng dùng trang
          quản trị toàn quyền để tạo tài khoản thủ công.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            style={{
              ...accentBtn,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#c8d2ff",
            }}
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN CONTENT — ResellerDashboardContent
// ─────────────────────────────────────────────────────────────

function ResellerDashboardContent() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [subTenants, setSubTenants] = useState<SubTenant[]>([]);
  const [error, setError] = useState("");
  const [dialogVisible, setDialogVisible] = useState(false);
  const mountedRef = useRef(true);

  // ─── Load data (simulate API) ───

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setError("");
    // Mô phỏng độ trễ API ~900ms
    await new Promise((r) => setTimeout(r, 900));
    if (!mountedRef.current) return;
    const data = MOCK_SUB_TENANTS;
    if (data.length === 0) {
      setMetrics(MOCK_METRICS);
      setLoadState("empty");
    } else {
      setMetrics(MOCK_METRICS);
      setSubTenants(data);
      setLoadState("ready");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  const handleCreate = useCallback(() => {
    setDialogVisible(true);
  }, []);

  // ─── Render loading state ───

  if (loadState === "loading") {
    return (
      <>
        {/* Skeleton metrics */}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                ...glassCard,
                flex: "1 1 200px",
                minWidth: 180,
                padding: "20px 24px",
              }}
            >
              <div
                style={{
                  height: 12,
                  width: "60%",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.06)",
                  marginBottom: 16,
                }}
              />
              <div
                style={{
                  height: 28,
                  width: "50%",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                }}
              />
            </div>
          ))}
        </div>

        {/* Skeleton table */}
        <div style={glassCard}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 110px 120px 90px 130px 110px",
              gap: 12,
              padding: "10px 16px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              color: "#64748b",
            }}
          >
            <span>ID</span>
            <span>Tên Tenant</span>
            <span>Gói dịch vụ</span>
            <span>Hoa hồng</span>
            <span>AI Budget</span>
            <span>Trạng thái</span>
            <span>Ngày gia nhập</span>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </>
    );
  }

  // ─── Render error state ───
  if (loadState === "error") {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  // ─── Render empty state ───
  if (loadState === "empty") {
    return (
      <>
        {/* Still show metrics when empty */}
        {metrics && (
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 28,
            }}
          >
            <MetricCard
              label="Tổng doanh thu đại lý"
              value={formatCurrency(metrics.totalRevenue)}
              icon="💰"
              accent="#6d7cff"
            />
            <MetricCard
              label="Hoa hồng khả dụng"
              value={formatCurrency(metrics.availableCommission)}
              icon="💎"
              accent="#34d399"
            />
            <MetricCard
              label="Sub-Tenant hoạt động"
              value={String(metrics.activeSubTenants)}
              icon="👥"
              accent="#f59e0b"
            />
          </div>
        )}
        <EmptyState onCreate={handleCreate} />
      </>
    );
  }

  // ─── Render ready state ───

  const tableHeader: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "90px 1fr 110px 120px 90px 130px 110px",
    gap: 12,
    alignItems: "center",
    padding: "10px 16px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748b",
  };

  const rowBase: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "90px 1fr 110px 120px 90px 130px 110px",
    gap: 12,
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontSize: 13,
    color: "#c8d2ff",
    transition: "background 0.15s",
  };

  return (
    <>
      {/* ─── Khối 2: Financial Metrics Widgets ─── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="Tổng doanh thu đại lý"
          value={formatCurrency(metrics!.totalRevenue)}
          icon="💰"
          accent="#6d7cff"
        />
        <MetricCard
          label="Hoa hồng khả dụng"
          value={formatCurrency(metrics!.availableCommission)}
          icon="💎"
          accent="#34d399"
        />
        <MetricCard
          label="Sub-Tenant hoạt động"
          value={String(metrics!.activeSubTenants)}
          icon="👥"
          accent="#f59e0b"
        />
      </div>

      {/* ─── Khối 3: Sub-Tenant List Table ─── */}
      <div style={glassCard}>
        <div style={tableHeader}>
          <span>ID</span>
          <span>Tên Tenant</span>
          <span>Gói dịch vụ</span>
          <span>Hoa hồng</span>
          <span>AI Budget</span>
          <span>Trạng thái</span>
          <span>Ngày gia nhập</span>
        </div>

        {subTenants.map((st) => {
          const rowBg =
            st.status === "locked"
              ? "rgba(239,68,68,0.02)"
              : "transparent";
          return (
            <div
              key={st.id}
              style={{
                ...rowBase,
                background: rowBg,
              }}
            >
              <span
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 11,
                  color: "#64748b",
                }}
              >
                {st.id}
              </span>
              <span style={{ fontWeight: 600 }}>{st.tenantName}</span>
              <div>
                <PlanBadge plan={st.plan} />
              </div>
              <span
                style={{
                  color: "#34d399",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {st.commissionRate}%
              </span>
              <span
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 12,
                  color: (st.aiBudget >= 500) ? "#818cf8" : "#94a3b8",
                }}
              >
                ${st.aiBudget.toLocaleString()}
              </span>
              <div>
                <StatusBadge status={st.status} />
              </div>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {formatDate(st.joinedAt)}
              </span>
            </div>
          );
        })}
      </div>

      {/* ─── Create Dialog ─── */}
      {dialogVisible && (
        <CreateSubTenantDialog
          onClose={() => setDialogVisible(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ResellerDashboardPage() {
  const [globalDialogVisible, setGlobalDialogVisible] = useState(false);

  // ─── Listen for custom event from header button ───
  useEffect(() => {
    const handler = () => setGlobalDialogVisible(true);
    window.addEventListener("open-create-sub-tenant", handler);
    return () =>
      window.removeEventListener("open-create-sub-tenant", handler);
  }, []);

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "32px 28px",
        minHeight: "100vh",
      }}
    >
      {/* ─── Khối 1: Header ─── */}
      <header style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 12,
            color: "#9fb0ff",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          AIFUT Reseller Portal
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 36,
                margin: "8px 0 4px",
                color: "#e0e7ff",
                fontWeight: 800,
              }}
            >
              Cổng điều phối Đại lý &amp; Phân phối Thương hiệu
            </h1>
            <p
              style={{
                color: "#c8d2ff",
                fontSize: 15,
                margin: 0,
                maxWidth: 680,
                lineHeight: 1.6,
              }}
            >
              Quản lý tài khoản đại lý nhiều cấp, theo dõi tỷ lệ hoa hồng
              cấu hình và cấp phát hạn mức AI Budget cho nhánh con. Mở rộng
              mạng lưới phân phối thương hiệu một cách linh hoạt và minh bạch.
            </p>
          </div>
          <button
            style={{
              ...accentBtn,
              flexShrink: 0,
              marginTop: 4,
            }}
            onClick={() => setGlobalDialogVisible(true)}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            Cấp tài khoản Sub-Tenant
          </button>
        </div>
      </header>

      {/* ─── Khối 2 + 3: Metrics & Table ─── */}
      <ResellerDashboardContent />

      {/* ─── Global Create Dialog ─── */}
      {globalDialogVisible && (
        <CreateSubTenantDialog
          onClose={() => setGlobalDialogVisible(false)}
        />
      )}
    </div>
  );
}
