"use client";

// ============================================================
// app/(dashboard)/workflows/page.tsx
// Trang quản lý quy trình tự động (Workflow Management Dashboard)
// Client Component: danh sách workflow, trạng thái, trigger,
// và quick-action "Chạy ngay" (Execute).
//
// Xử lý các trạng thái:
//   - loading  → Skeleton placeholder
//   - empty    → Thông báo trống + gợi ý tạo mới
//   - error    → Error card với nút thử lại
//   - ready    → Bảng dữ liệu mock workflows
//
// Pattern: dark theme (#0b1020), Glass Card, accent xanh indigo.
// ============================================================

import type { CSSProperties, MouseEvent } from "react";
import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// TYPES (local, không cần import alias)
// ─────────────────────────────────────────────────────────────

type WorkflowStatus = "active" | "inactive";
type TriggerType = "schedule" | "webhook" | "manual" | "event";

interface Workflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger: TriggerType;
  updatedAt: string; // ISO date string
  description: string;
}

type LoadState = "loading" | "ready" | "empty" | "error";

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const MOCK_WORKFLOWS: Workflow[] = [
  {
    id: "wf-001",
    name: "Đồng bộ đơn hàng → Kế toán",
    status: "active",
    trigger: "webhook",
    updatedAt: "2026-06-20T14:30:00Z",
    description: "Tự động đồng bộ đơn hàng mới sang module kế toán.",
  },
  {
    id: "wf-002",
    name: "Gửi báo giá tự động",
    status: "active",
    trigger: "event",
    updatedAt: "2026-06-19T09:15:00Z",
    description: "Khi khách hàng yêu cầu báo giá → tạo PDF + gửi email.",
  },
  {
    id: "wf-003",
    name: "Kiểm tra tồn kho hàng ngày",
    status: "inactive",
    trigger: "schedule",
    updatedAt: "2026-06-18T22:00:00Z",
    description: "Chạy lúc 6h sáng mỗi ngày, báo cáo tồn kho dưới ngưỡng.",
  },
  {
    id: "wf-004",
    name: "Phân loại Lead → CRM",
    status: "active",
    trigger: "webhook",
    updatedAt: "2026-06-17T16:45:00Z",
    description: "Phân tích request landing page, gán nhãn lead và đẩy vào CRM.",
  },
  {
    id: "wf-005",
    name: "Tạo hoá đơn định kỳ",
    status: "inactive",
    trigger: "schedule",
    updatedAt: "2026-06-15T10:00:00Z",
    description: "Cuối tháng: tạo hoá đơn cho thuê bao đang hoạt động.",
  },
  {
    id: "wf-006",
    name: "Xác nhận thanh toán MoMo",
    status: "active",
    trigger: "webhook",
    updatedAt: "2026-06-21T07:12:00Z",
    description: "IPN callback từ MoMo → cập nhật trạng thái giao dịch.",
  },
];

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<TriggerType, string> = {
  schedule: "Lịch trình",
  webhook: "Webhook",
  manual: "Thủ công",
  event: "Sự kiện",
};

const TRIGGER_COLORS: Record<TriggerType, string> = {
  schedule: "#f59e0b",
  webhook: "#3b82f6",
  manual: "#8b5cf6",
  event: "#10b981",
};

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  active: "Đang chạy",
  inactive: "Đã tắt",
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
// HELPER — Định dạng ngày
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

// ─── Skeleton Row ───

function SkeletonRow() {
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "100px 1fr 110px 120px 150px 90px",
    gap: 12,
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  };
  const skeletonBar: CSSProperties = {
    height: 14,
    borderRadius: 6,
    background: "rgba(255,255,255,0.06)",
    animation: "none",
  };
  return (
    <div style={rowStyle}>
      <div style={{ ...skeletonBar, width: 64 }} />
      <div style={{ ...skeletonBar, width: "80%" }} />
      <div style={{ ...skeletonBar, width: 60 }} />
      <div style={{ ...skeletonBar, width: 70 }} />
      <div style={{ ...skeletonBar, width: 90 }} />
      <div style={{ ...skeletonBar, width: 50 }} />
    </div>
  );
}

// ─── Status Badge ───

function StatusBadge({ status }: { status: WorkflowStatus }) {
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

// ─── Trigger Badge ───

function TriggerBadge({ trigger }: { trigger: TriggerType }) {
  const color = TRIGGER_COLORS[trigger];
  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 6,
    background: `${color}14`,
    color,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'Courier New', monospace",
  };
  return <span style={badgeStyle}>{TRIGGER_LABELS[trigger]}</span>;
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
      <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
      <h3 style={{ margin: "0 0 8px", color: "#e0e7ff", fontSize: 20 }}>
        Chưa có quy trình nào
      </h3>
      <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 24px" }}>
        Bắt đầu tạo quy trình tự động đầu tiên để vận hành hệ thống hiệu quả hơn.
      </p>
      <button style={accentBtn} onClick={onCreate}>
        + Tạo Workflow đầu tiên
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
        Không thể tải danh sách
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

// ─── Create Workflow Dialog ───

function CreateDialog({ onClose }: { onClose: () => void }) {
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
    maxWidth: 480,
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
          Tạo Workflow mới
        </h3>
        <p
          style={{
            color: "#94a3b8",
            fontSize: 13,
            margin: "0 0 24px",
          }}
        >
          Chức năng tạo workflow đang được phát triển. Vui lòng quay lại sau.
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
          🚧 Workflow Builder sẽ có trong bản cập nhật tiếp theo.
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
// MAIN COMPONENT — WorkflowListContent
// ─────────────────────────────────────────────────────────────

function WorkflowListContent() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [error, setError] = useState("");
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [dialogVisible, setDialogVisible] = useState(false);
  const mountedRef = useRef(true);

  // ─── Load data (simulate API) ───

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setError("");
    // Mô phỏng độ trễ API ~800ms
    await new Promise((r) => setTimeout(r, 800));
    if (!mountedRef.current) return;
    const data = MOCK_WORKFLOWS;
    if (data.length === 0) {
      setLoadState("empty");
    } else {
      setWorkflows(data);
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

  // ─── Execute action ───

  const handleExecute = useCallback(
    async (wfId: string) => {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.add(wfId);
        return next;
      });
      // Mô phỏng request 1.5s
      await new Promise((r) => setTimeout(r, 1500));
      if (!mountedRef.current) return;
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(wfId);
        return next;
      });
    },
    [],
  );

  const handleCreate = useCallback(() => {
    setDialogVisible(true);
  }, []);

  // ─── Render states ───

  if (loadState === "loading") {
    return (
      <div style={glassCard}>
        {/* Skeleton header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "100px 1fr 110px 120px 150px 90px",
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
          <span>Mã số</span>
          <span>Tên quy trình</span>
          <span>Trạng thái</span>
          <span>Kích hoạt</span>
          <span>Cập nhật</span>
          <span>Thao tác</span>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (loadState === "error") {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  if (loadState === "empty") {
    return <EmptyState onCreate={handleCreate} />;
  }

  // ─── Ready: bảng workflow ───

  const tableHeader: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "100px 1fr 110px 120px 150px 90px",
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
    gridTemplateColumns: "100px 1fr 110px 120px 150px 90px",
    gap: 12,
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontSize: 13,
    color: "#c8d2ff",
    transition: "background 0.15s",
  };

  const execBtn: CSSProperties = {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid rgba(99,102,241,0.3)",
    background: "rgba(99,102,241,0.10)",
    color: "#818cf8",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };

  return (
    <>
      <div style={glassCard}>
        {/* Header row */}
        <div style={tableHeader}>
          <span>Mã số</span>
          <span>Tên quy trình</span>
          <span>Trạng thái</span>
          <span>Kích hoạt</span>
          <span>Cập nhật</span>
          <span style={{ textAlign: "center" }}>Thao tác</span>
        </div>

        {/* Data rows */}
        {workflows.map((wf) => {
          const isRunning = runningIds.has(wf.id);
          const rowBg =
            wf.status === "inactive"
              ? "rgba(255,255,255,0.01)"
              : "transparent";
          return (
            <div
              key={wf.id}
              style={{
                ...rowBase,
                background: rowBg,
                opacity: isRunning ? 0.6 : 1,
                pointerEvents: isRunning ? "none" : "auto",
              }}
            >
              <span
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 11,
                  color: "#64748b",
                }}
              >
                {wf.id}
              </span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  {wf.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 320,
                  }}
                >
                  {wf.description}
                </div>
              </div>
              <div>
                <StatusBadge status={wf.status} />
              </div>
              <div>
                <TriggerBadge trigger={wf.trigger} />
              </div>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {formatDate(wf.updatedAt)}
              </span>
              <div style={{ textAlign: "center" }}>
                <button
                  style={{
                    ...execBtn,
                    ...(isRunning
                      ? {
                          background: "rgba(99,102,241,0.05)",
                          color: "#475569",
                          cursor: "not-allowed",
                          border: "1px solid rgba(255,255,255,0.04)",
                        }
                      : {}),
                  }}
                  disabled={isRunning}
                  onClick={() => handleExecute(wf.id)}
                  title={
                    wf.status === "inactive"
                      ? "Workflow đang tắt — bật lên trước khi chạy"
                      : "Chạy quy trình này ngay"
                  }
                >
                  {isRunning ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          border: "2px solid #475569",
                          borderTopColor: "#818cf8",
                          display: "inline-block",
                          animation: "none",
                        }}
                      />
                      Đang chạy…
                    </span>
                  ) : (
                    "▶ Chạy ngay"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Create Dialog ─── */}
      {dialogVisible && (
        <CreateDialog onClose={() => setDialogVisible(false)} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [globalDialogVisible, setGlobalDialogVisible] = useState(false);

  // ─── Listen for custom event from header button ───
  useEffect(() => {
    const handler = () => setGlobalDialogVisible(true);
    window.addEventListener("open-create-workflow", handler);
    return () => window.removeEventListener("open-create-workflow", handler);
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
          AIFUT Workflows
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
              Trình quản lý quy trình tự động
            </h1>
            <p
              style={{
                color: "#c8d2ff",
                fontSize: 15,
                margin: 0,
                maxWidth: 640,
                lineHeight: 1.6,
              }}
            >
              Xem, kích hoạt và thực thi các quy trình tự động hoá trong hệ thống.
              Workflow là chuỗi các bước xử lý được kết nối với nhau qua
              Connector, Trigger và Action — giúp vận hành doanh nghiệp không
              cần can thiệp thủ công.
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
            Tạo Workflow mới
          </button>
        </div>
      </header>

      {/* ─── Khối 2 + 3: Table & Quick Actions ─── */}
      <WorkflowListContent />

      {/* ─── Global Create Dialog ─── */}
      {globalDialogVisible && (
        <CreateDialog onClose={() => setGlobalDialogVisible(false)} />
      )}
    </div>
  );
}
