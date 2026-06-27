"use client";

// ============================================================
// app/(dashboard)/affiliate/page.tsx
// Trung tâm Quản lý Tiếp thị liên kết (Affiliate)
// Affiliate Conversion & Link Management Dashboard
//
// Client Component: quản lý link tracking chiến dịch, theo dõi
// lưu lượng click-through, đối soát dữ liệu chuyển đổi hoa hồng.
//
// Xử lý các trạng thái:
//   - loading  → Skeleton placeholder
//   - empty    → Thông báo trống + gợi ý tạo link mới
//   - error    → Error card với nút thử lại
//   - ready    → Bảng dữ liệu mock link tracking + thẻ chỉ số
//
// Pattern: dark theme (#0b1020), Glass Card, accent xanh indigo.
// ============================================================

import type { CSSProperties, MouseEvent } from "react";
import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type LinkStatus = "active" | "paused";

interface AffiliateLink {
  id: string;
  name: string; // Tên Link / Chiến dịch
  shortUrl: string; // URL rút gọn
  clicks: number; // Số lượt click
  orders: number; // Số đơn hàng thành công
  revenue: number; // Doanh thu đem về (USD)
  status: LinkStatus; // Hoạt động / Tạm dừng
  createdAt: string; // ISO date
}

interface AffiliateMetrics {
  totalClicks: number; // Tổng lượt click-through
  totalConversions: number; // Số lượng chuyển đổi thành công
  totalCommission: number; // Tổng số hoa hồng tích lũy khả dụng (USD)
}

type LoadState = "loading" | "ready" | "empty" | "error";

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const MOCK_METRICS: AffiliateMetrics = {
  totalClicks: 24_891,
  totalConversions: 1_452,
  totalCommission: 38_670,
};

const MOCK_LINKS: AffiliateLink[] = [
  {
    id: "af-001",
    name: "Chiến dịch mùa hè 2026 — Landing Sản phẩm A",
    shortUrl: "aifut.io/s/abc1",
    clicks: 8_340,
    orders: 487,
    revenue: 97_400,
    status: "active",
    createdAt: "2026-05-01T08:00:00Z",
  },
  {
    id: "af-002",
    name: "Bài viết Blog — Review tính năng AI Workflow",
    shortUrl: "aifut.io/s/abc2",
    clicks: 5_210,
    orders: 293,
    revenue: 58_600,
    status: "active",
    createdAt: "2026-05-10T10:30:00Z",
  },
  {
    id: "af-003",
    name: "Email Marketing — Khuyến mãi tháng 6",
    shortUrl: "aifut.io/s/abc3",
    clicks: 4_875,
    orders: 312,
    revenue: 62_400,
    status: "active",
    createdAt: "2026-05-20T14:00:00Z",
  },
  {
    id: "af-004",
    name: "Chiến dịch Facebook Ads — Retargeting",
    shortUrl: "aifut.io/s/abc4",
    clicks: 3_210,
    orders: 178,
    revenue: 35_600,
    status: "paused",
    createdAt: "2026-04-15T09:00:00Z",
  },
  {
    id: "af-005",
    name: "YouTube Influencer Review — Gói Business",
    shortUrl: "aifut.io/s/abc5",
    clicks: 2_156,
    orders: 142,
    revenue: 28_400,
    status: "active",
    createdAt: "2026-06-01T16:45:00Z",
  },
  {
    id: "af-006",
    name: "Zalo OA — Chiến dịch giới thiệu bạn bè",
    shortUrl: "aifut.io/s/abc6",
    clicks: 1_100,
    orders: 40,
    revenue: 8_000,
    status: "active",
    createdAt: "2026-06-05T07:20:00Z",
  },
];

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LinkStatus, string> = {
  active: "Hoạt động",
  paused: "Tạm dừng",
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

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
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

// ─── Affiliate Performance Metric Card ───

function MetricCard({
  label,
  value,
  icon,
  accent,
  footnote,
}: {
  label: string;
  value: string;
  icon: string;
  accent: string;
  footnote?: string;
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
      {footnote && (
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            marginTop: 6,
          }}
        >
          {footnote}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton Row ───

function SkeletonRow() {
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "80px 1fr 120px 80px 110px 120px 110px",
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
      <div style={{ ...skeletonBar, width: 50 }} />
      <div style={{ ...skeletonBar, width: "75%" }} />
      <div style={{ ...skeletonBar, width: 90 }} />
      <div style={{ ...skeletonBar, width: 50 }} />
      <div style={{ ...skeletonBar, width: 70 }} />
      <div style={{ ...skeletonBar, width: 80 }} />
      <div style={{ ...skeletonBar, width: 70 }} />
    </div>
  );
}

// ─── Status Badge ───

function StatusBadge({ status }: { status: LinkStatus }) {
  const isActive = status === "active";
  const bg = isActive
    ? "rgba(16,185,129,0.12)"
    : "rgba(251,191,36,0.10)";
  const fg = isActive ? "#34d399" : "#fbbf24";
  const dotBg = isActive ? "#34d399" : "#fbbf24";

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

// ─── Empty State ───

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const box: CSSProperties = {
    ...glassCard,
    textAlign: "center" as const,
    padding: "60px 28px",
  };
  return (
    <div style={box}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🔗</div>
      <h3 style={{ margin: "0 0 8px", color: "#e0e7ff", fontSize: 20 }}>
        Chưa có link chiến dịch nào
      </h3>
      <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 24px", maxWidth: 440, marginInline: "auto" as const }}>
        Bắt đầu tạo link tracking cho chiến dịch tiếp thị đầu tiên của bạn.
        Theo dõi click-through và hoa hồng theo thời gian thực.
      </p>
      <button style={accentBtn} onClick={onCreate}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
        Tạo Link Chiến dịch Đầu tiên
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
        Không thể tải danh sách link
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

// ─── Create Link Dialog ───

function CreateLinkDialog({ onClose }: { onClose: () => void }) {
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
          Tạo Link Chiến dịch Mới
        </h3>
        <p
          style={{
            color: "#94a3b8",
            fontSize: 13,
            margin: "0 0 24px",
          }}
        >
          Tạo URL tracking cho chiến dịch tiếp thị liên kết mới.
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
          🚧 Chức năng tạo link đang được phát triển. Vui lòng dùng trang quản
          trị để tạo link thủ công trong phiên bản hiện tại.
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
// MAIN CONTENT — AffiliateDashboardContent
// ─────────────────────────────────────────────────────────────

function AffiliateDashboardContent() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<AffiliateMetrics | null>(null);
  const [links, setLinks] = useState<AffiliateLink[]>([]);
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
    const data = MOCK_LINKS;
    if (data.length === 0) {
      setMetrics(MOCK_METRICS);
      setLoadState("empty");
    } else {
      setMetrics(MOCK_METRICS);
      setLinks(data);
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
              gridTemplateColumns: "80px 1fr 120px 80px 110px 120px 110px",
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
            <span>Tên Link / Chiến dịch</span>
            <span>URL rút gọn</span>
            <span>Click</span>
            <span>Đơn hàng</span>
            <span>Doanh thu</span>
            <span>Trạng thái</span>
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
              label="Tổng lượt click-through"
              value={formatCompactNumber(metrics.totalClicks)}
              icon="👆"
              accent="#6d7cff"
              footnote="Lượt nhấp trên tất cả các link"
            />
            <MetricCard
              label="Chuyển đổi thành công"
              value={formatCompactNumber(metrics.totalConversions)}
              icon="✅"
              accent="#34d399"
              footnote="Đơn hàng đã xác nhận"
            />
            <MetricCard
              label="Hoa hồng tích lũy"
              value={formatCurrency(metrics.totalCommission)}
              icon="💎"
              accent="#f59e0b"
              footnote="Khoản hoa hồng khả dụng"
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
    gridTemplateColumns: "80px 1fr 120px 80px 110px 120px 110px",
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
    gridTemplateColumns: "80px 1fr 120px 80px 110px 120px 110px",
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
      {/* ─── Khối 2: Affiliate Performance Metrics ─── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="Tổng lượt click-through"
          value={formatCompactNumber(metrics!.totalClicks)}
          icon="👆"
          accent="#6d7cff"
          footnote="Lượt nhấp trên tất cả các link"
        />
        <MetricCard
          label="Chuyển đổi thành công"
          value={formatCompactNumber(metrics!.totalConversions)}
          icon="✅"
          accent="#34d399"
          footnote="Đơn hàng đã xác nhận"
        />
        <MetricCard
          label="Hoa hồng tích lũy"
          value={formatCurrency(metrics!.totalCommission)}
          icon="💎"
          accent="#f59e0b"
          footnote="Khoản hoa hồng khả dụng"
        />
      </div>

      {/* ─── Khối 3: Referral & Link Tracking Table ─── */}
      <div style={glassCard}>
        <div style={tableHeader}>
          <span>ID</span>
          <span>Tên Link / Chiến dịch</span>
          <span>URL rút gọn</span>
          <span>Click</span>
          <span>Đơn hàng</span>
          <span>Doanh thu</span>
          <span>Trạng thái</span>
        </div>

        {links.map((link) => {
          const rowBg =
            link.status === "paused"
              ? "rgba(251,191,36,0.02)"
              : "transparent";
          return (
            <div
              key={link.id}
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
                {link.id}
              </span>
              <span style={{ fontWeight: 600 }}>{link.name}</span>
              <span
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 12,
                  color: "#818cf8",
                }}
              >
                {link.shortUrl}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: link.clicks >= 5_000 ? "#6d7cff" : "#94a3b8",
                }}
              >
                {link.clicks.toLocaleString()}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: link.orders >= 200 ? "#34d399" : "#94a3b8",
                }}
              >
                {link.orders.toLocaleString()}
              </span>
              <span
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 13,
                  fontWeight: 700,
                  color: link.revenue >= 50_000 ? "#34d399" : "#c8d2ff",
                }}
              >
                {formatCurrency(link.revenue)}
              </span>
              <div>
                <StatusBadge status={link.status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Create Dialog ─── */}
      {dialogVisible && (
        <CreateLinkDialog
          onClose={() => setDialogVisible(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────

export default function AffiliateDashboardPage() {
  const [globalDialogVisible, setGlobalDialogVisible] = useState(false);

  // ─── Listen for custom event from header button ───
  useEffect(() => {
    const handler = () => setGlobalDialogVisible(true);
    window.addEventListener("open-create-affiliate-link", handler);
    return () =>
      window.removeEventListener("open-create-affiliate-link", handler);
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
          AIFUT Affiliate
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
              Trung tâm Quản lý Tiếp thị liên kết (Affiliate)
            </h1>
            <p
              style={{
                color: "#c8d2ff",
                fontSize: 15,
                margin: 0,
                maxWidth: 720,
                lineHeight: 1.6,
              }}
            >
              Tạo link tracking chiến dịch, theo dõi lưu lượng click-through và
              đối soát dữ liệu chuyển đổi hoa hồng thời gian thực.
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
            Tạo Link Chiến dịch Mới
          </button>
        </div>
      </header>

      {/* ─── Khối 2 + 3: Metrics & Table ─── */}
      <AffiliateDashboardContent />

      {/* ─── Global Create Dialog ─── */}
      {globalDialogVisible && (
        <CreateLinkDialog
          onClose={() => setGlobalDialogVisible(false)}
        />
      )}
    </div>
  );
}
