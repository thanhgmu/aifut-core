"use client";

// ============================================================
// app/(dashboard)/backups/page.tsx
// Trung tâm Sao lưu & Khôi phục Thảm họa
// Backup & Restore Center Console — Client Component
//
// Tích hợp:
//   - Nút kích hoạt sao lưu ngay (POST /api/backups/trigger)
//   - 3 System Status Widgets (dung lượng, gần nhất, tổng snapshot)
//   - Bảng Backup Log với mock data, Skeleton loading, Empty state
// ============================================================

import type { CSSProperties, MouseEvent } from "react";
import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface BackupRecord {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  dbType: "SQLite" | "Postgres";
  status: "success" | "failure";
  createdAt: string; // ISO-8601
}

interface SystemStatus {
  storageUsedBytes: number;
  lastBackupAt: string | null;
  totalSnapshots: number;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Vài giây trước";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const MOCK_BACKUPS: BackupRecord[] = [
  {
    id: "bkp-001",
    fileName: "aifut_prod_2026-06-21_0600.sql",
    fileSizeBytes: 14_827_520,
    dbType: "Postgres",
    status: "success",
    createdAt: "2026-06-21T06:00:00.000Z",
  },
  {
    id: "bkp-002",
    fileName: "aifut_prod_2026-06-21_0000.sql",
    fileSizeBytes: 13_990_400,
    dbType: "Postgres",
    status: "success",
    createdAt: "2026-06-21T00:00:00.000Z",
  },
  {
    id: "bkp-003",
    fileName: "aifut_analytics_2026-06-20_1800.sql",
    fileSizeBytes: 8_310_016,
    dbType: "Postgres",
    status: "success",
    createdAt: "2026-06-20T18:00:00.000Z",
  },
  {
    id: "bkp-004",
    fileName: "tenant_local_2026-06-20_1200.db",
    fileSizeBytes: 2_468_352,
    dbType: "SQLite",
    status: "failure",
    createdAt: "2026-06-20T12:00:00.000Z",
  },
  {
    id: "bkp-005",
    fileName: "aifut_prod_2026-06-20_0600.sql",
    fileSizeBytes: 13_700_608,
    dbType: "Postgres",
    status: "success",
    createdAt: "2026-06-20T06:00:00.000Z",
  },
  {
    id: "bkp-006",
    fileName: "tenant_crm_2026-06-19_1200.db",
    fileSizeBytes: 512_000,
    dbType: "SQLite",
    status: "success",
    createdAt: "2026-06-19T12:00:00.000Z",
  },
  {
    id: "bkp-007",
    fileName: "aifut_prod_2026-06-19_0000.sql",
    fileSizeBytes: 12_888_576,
    dbType: "Postgres",
    status: "failure",
    createdAt: "2026-06-19T00:00:00.000Z",
  },
  {
    id: "bkp-008",
    fileName: "tenant_orders_2026-06-18_0600.db",
    fileSizeBytes: 184_320,
    dbType: "SQLite",
    status: "success",
    createdAt: "2026-06-18T06:00:00.000Z",
  },
];

const MOCK_STATUS: SystemStatus = {
  storageUsedBytes: 128_974_848,
  lastBackupAt: "2026-06-21T06:00:00.000Z",
  totalSnapshots: 8,
};

// ─────────────────────────────────────────────────────────────
// STYLE CONSTANTS
// ─────────────────────────────────────────────────────────────

const glassCard: CSSProperties = {
  background: "rgba(15, 23, 42, 0.55)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(99, 127, 255, 0.15)",
  borderRadius: 16,
  padding: "24px 28px",
};

const glassCardSmall: CSSProperties = {
  ...glassCard,
  padding: "20px 22px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  flex: "1 1 0",
  minWidth: 220,
};

const labelText: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "#9fb0ff",
};

const valueText: CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  color: "#f5f7ff",
};

const badgeBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 10px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
};

const tableHeader: CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "#9fb0ff",
  borderBottom: "1px solid rgba(99, 127, 255, 0.12)",
  whiteSpace: "nowrap",
};

const tableCell: CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "#e0e7ff",
  borderBottom: "1px solid rgba(99, 127, 255, 0.06)",
  verticalAlign: "middle",
};

// ─────────────────────────────────────────────────────────────
// SKELETON LOADING ROW
// ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const skeleton: CSSProperties = {
    height: 16,
    borderRadius: 6,
    background: "rgba(99, 127, 255, 0.08)",
    animation: "pulse 1.5s ease-in-out infinite",
  };

  return (
    <tr>
      {[80, 180, 100, 90, 100, 150].map((w, i) => (
        <td key={i} style={tableCell}>
          <div style={{ ...skeleton, width: `${w}px` }} />
        </td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// KEYFRAME STYLES (pulse animation)
// ─────────────────────────────────────────────────────────────

const pulseKeyframes = `
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

type LoadState = "loading" | "ready" | "empty" | "error";
type BackupAction = "idle" | "triggering" | "triggered";

export default function BackupsDashboardPage() {
  // ─── State ───
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [backupAction, setBackupAction] = useState<BackupAction>("idle");
  const [error, setError] = useState<string>("");
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const initialLoadDone = useRef(false);

  // ─── Load mock data ───
  const loadData = useCallback(async () => {
    setLoadState("loading");
    setError("");

    // Simulate network delay
    await new Promise((r) => setTimeout(r, 800));

    try {
      // In production, replace with real API call:
      // const res = await fetch("/api/backups/list");
      // const data = await res.json();
      setBackups(MOCK_BACKUPS);
      setStatus(MOCK_STATUS);
      setLoadState("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải dữ liệu sao lưu",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadData();
    }
  }, [loadData]);

  // ─── Trigger backup ───
  const handleTriggerBackup = useCallback(async (e: MouseEvent) => {
    e.preventDefault();
    if (backupAction === "triggering") return;
    setBackupAction("triggering");
    setNotice(null);

    try {
      const res = await fetch("/api/backups/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { message?: string }).message ||
            `Máy chủ phản hồi ${res.status}`,
        );
      }

      const result = await res.json();
      setNotice({
        tone: "success",
        message: `✅ Đã kích hoạt sao lưu thành công! (ID: ${(result as { id?: string }).id || "N/A"})`,
      });
      setBackupAction("triggered");

      // Tự động tải lại danh sách sau 2 giây
      setTimeout(() => {
        loadData();
        setBackupAction("idle");
      }, 2000);
    } catch (err) {
      setNotice({
        tone: "error",
        message: `❌ Thất bại: ${err instanceof Error ? err.message : "Lỗi không xác định"}`,
      });
      setBackupAction("idle");
    }
  }, [backupAction, loadData]);

  // ─── Render ───

  return (
    <>
      {/* Pulse animation keyframes */}
      <style>{pulseKeyframes}</style>

      {/* ────────────── BLOCK 1: HEADER ────────────── */}
      <header style={{ marginBottom: 32 }}>
        <div
          style={{
            ...labelText,
            marginBottom: 6,
          }}
        >
          AIFUT System
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 36, margin: "8px 0 4px", color: "#f5f7ff" }}>
              Trung tâm Sao lưu &amp; Khôi phục Thảm họa
            </h1>
            <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0, maxWidth: 620 }}>
              Cấu hình lịch trình tự động, quản lý tệp tin snapshot database và
              kích hoạt phục hồi dữ liệu khẩn cấp.
            </p>
          </div>

          {/* Nút kích hoạt sao lưu ngay */}
          <button
            type="button"
            onClick={handleTriggerBackup}
            disabled={backupAction === "triggering"}
            aria-busy={backupAction === "triggering"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 24px",
              border: "none",
              borderRadius: 12,
              background:
                backupAction === "triggering"
                  ? "rgba(99, 127, 255, 0.4)"
                  : "linear-gradient(135deg, #6d7cff, #4f46e5)",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor:
                backupAction === "triggering" ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              boxShadow:
                backupAction === "triggering"
                  ? "none"
                  : "0 4px 16px rgba(109, 124, 255, 0.3)",
              opacity: backupAction === "triggering" ? 0.7 : 1,
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (backupAction !== "triggering") {
                (e.currentTarget as HTMLButtonElement).style.transform =
                  "translateY(-2px)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 6px 24px rgba(109, 124, 255, 0.45)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "";
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                backupAction === "triggering"
                  ? "none"
                  : "0 4px 16px rgba(109, 124, 255, 0.3)";
            }}
          >
            {backupAction === "triggering" ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 16,
                    height: 16,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#ffffff",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Đang sao lưu…
              </>
            ) : (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4" />
                  <polyline points="10 3 15 8 10 13" />
                  <line x1="15" y1="8" x2="3" y2="8" />
                </svg>
                Kích hoạt sao lưu ngay
              </>
            )}
          </button>
        </div>
      </header>

      {/* ─── Global notice toast ─── */}
      {notice && (
        <div
          style={{
            padding: "14px 20px",
            marginBottom: 24,
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            border: `1px solid ${
              notice.tone === "success"
                ? "rgba(128, 224, 160, 0.25)"
                : notice.tone === "error"
                  ? "rgba(255, 107, 107, 0.25)"
                  : "rgba(159, 176, 255, 0.25)"
            }`,
            background:
              notice.tone === "success"
                ? "rgba(128, 224, 160, 0.08)"
                : notice.tone === "error"
                  ? "rgba(255, 107, 107, 0.08)"
                  : "rgba(159, 176, 255, 0.08)",
            color:
              notice.tone === "success"
                ? "#80e0a0"
                : notice.tone === "error"
                  ? "#ff6b6b"
                  : "#9fb0ff",
          }}
        >
          {notice.message}
        </div>
      )}

      {/* ────────────── BLOCK 2: SYSTEM STATUS WIDGETS ────────────── */}
      <section
        aria-label="System status widgets"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {/* Widget 1: Dung lượng lưu trữ */}
        <div style={glassCardSmall}>
          <div style={labelText}>Dung lượng lưu trữ đã dùng</div>
          <div style={valueText}>
            {status ? formatBytes(status.storageUsedBytes) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "#7888cc", marginTop: 2 }}>
            Tổng 500 MB được phân bổ
          </div>
          {/* Mini progress bar */}
          {status && (
            <div
              style={{
                width: "100%",
                height: 5,
                borderRadius: 3,
                background: "rgba(99, 127, 255, 0.12)",
                marginTop: 6,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min((status.storageUsedBytes / (500 * 1024 * 1024)) * 100, 100)}%`,
                  height: "100%",
                  borderRadius: 3,
                  background:
                    status.storageUsedBytes > 400 * 1024 * 1024
                      ? "linear-gradient(90deg, #ff6b6b, #ffa726)"
                      : "linear-gradient(90deg, #6d7cff, #4f46e5)",
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          )}
        </div>

        {/* Widget 2: Thời gian sao lưu gần nhất */}
        <div style={glassCardSmall}>
          <div style={labelText}>Thời gian sao lưu gần nhất</div>
          <div style={valueText}>
            {status && status.lastBackupAt
              ? formatTimeAgo(status.lastBackupAt)
              : "Chưa có"}
          </div>
          <div style={{ fontSize: 12, color: "#7888cc", marginTop: 2 }}>
            {status && status.lastBackupAt
              ? formatDateTime(status.lastBackupAt)
              : "Chưa thực hiện lần sao lưu nào"}
          </div>
          {status && status.lastBackupAt && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                color: "#80e0a0",
                background: "rgba(128, 224, 160, 0.1)",
                border: "1px solid rgba(128, 224, 160, 0.2)",
                marginTop: 6,
                alignSelf: "flex-start",
              }}
            >
              <span style={{ fontSize: 10 }}>●</span> Hệ thống hoạt động
            </div>
          )}
        </div>

        {/* Widget 3: Tổng số bản snapshot */}
        <div style={glassCardSmall}>
          <div style={labelText}>Tổng số bản snapshot</div>
          <div style={valueText}>
            {status ? status.totalSnapshots : "—"}
          </div>
          <div style={{ fontSize: 12, color: "#7888cc", marginTop: 2 }}>
            snapshot database trên đĩa cứng
          </div>
          {/* Small icon indicator */}
          <div
            style={{
              display: "flex",
              gap: 4,
              marginTop: 8,
            }}
          >
            {Array.from({ length: Math.min(status?.totalSnapshots ?? 0, 12) }).map(
              (_, i) => (
                <div
                  key={i}
                  title={`Snapshot ${i + 1}`}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      i < (status?.totalSnapshots ?? 0) - 2
                        ? "#6d7cff"
                        : "#ff6b6b",
                    opacity: 0.6 + (i / ((status?.totalSnapshots ?? 1) - 1)) * 0.4,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform =
                      "scale(1.5)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = "";
                  }}
                />
              ),
            )}
          </div>
        </div>
      </section>

      {/* ────────────── BLOCK 3: BACKUP LOG TABLE ────────────── */}

      {/* Error State */}
      {loadState === "error" && (
        <div style={glassCard}>
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#ff6b6b",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Không thể tải dữ liệu
            </div>
            <div style={{ fontSize: 14, color: "#c8d2ff", marginBottom: 20 }}>
              {error || "Đã xảy ra lỗi khi kết nối đến máy chủ sao lưu."}
            </div>
            <button
              type="button"
              onClick={loadData}
              style={{
                padding: "10px 22px",
                border: "1px solid rgba(99, 127, 255, 0.3)",
                borderRadius: 10,
                background: "rgba(99, 127, 255, 0.1)",
                color: "#9fb0ff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ⟳ Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {loadState === "empty" && (
        <div style={glassCard}>
          <div
            style={{
              textAlign: "center",
              padding: "50px 20px",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f5f7ff", marginBottom: 8 }}>
              Chưa có bản sao lưu nào
            </div>
            <div style={{ fontSize: 14, color: "#c8d2ff", maxWidth: 400, margin: "0 auto 20px" }}>
              Hệ thống chưa ghi nhận bất kỳ bản snapshot database nào trên đĩa.
              Nhấn nút <strong style={{ color: "#6d7cff" }}>"Kích hoạt sao lưu ngay"</strong>{" "}
              để tạo bản sao lưu đầu tiên.
            </div>
            <button
              type="button"
              onClick={handleTriggerBackup}
              disabled={backupAction === "triggering"}
              style={{
                padding: "10px 22px",
                border: "none",
                borderRadius: 10,
                background:
                  backupAction === "triggering"
                    ? "rgba(99, 127, 255, 0.4)"
                    : "linear-gradient(135deg, #6d7cff, #4f46e5)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                cursor:
                  backupAction === "triggering" ? "not-allowed" : "pointer",
              }}
            >
              {backupAction === "triggering"
                ? "⏳ Đang sao lưu…"
                : "🚀 Tạo bản sao lưu đầu tiên"}
            </button>
          </div>
        </div>
      )}

      {/* Ready State — Table */}
      {loadState === "ready" && (
        <section aria-label="Danh sách bản sao lưu">
          {/* Section label */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#f5f7ff",
                  margin: 0,
                }}
              >
                📋 Nhật ký sao lưu
              </h2>
              <p style={{ fontSize: 13, color: "#7888cc", margin: "4px 0 0" }}>
                {backups.length} bản ghi • Cập nhật gần nhất{" "}
                {backups.length > 0
                  ? formatTimeAgo(backups[0]?.createdAt ?? "")
                  : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              style={{
                padding: "8px 14px",
                border: "1px solid rgba(99, 127, 255, 0.2)",
                borderRadius: 8,
                background: "rgba(99, 127, 255, 0.06)",
                color: "#9fb0ff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ⟳ Làm mới
            </button>
          </div>

          <div
            style={{
              ...glassCard,
              padding: 0,
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 700,
              }}
            >
              <thead>
                <tr>
                  <th style={tableHeader}>ID</th>
                  <th style={tableHeader}>Tên tệp tin</th>
                  <th style={tableHeader}>Dung lượng</th>
                  <th style={tableHeader}>Loại CSDL</th>
                  <th style={tableHeader}>Trạng thái</th>
                  <th style={tableHeader}>Ngày khởi tạo</th>
                </tr>
              </thead>
              <tbody>
                {backups.length === 0
                  ? // Skeleton loading rows (fallback — should not reach here in "ready" state)
                    Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonRow key={`skel-${i}`} />
                    ))
                  : backups.map((bk, idx) => (
                      <tr
                        key={bk.id}
                        style={{
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          (
                            e.currentTarget as HTMLTableRowElement
                          ).style.background =
                            "rgba(99, 127, 255, 0.04)";
                        }}
                        onMouseLeave={(e) => {
                          (
                            e.currentTarget as HTMLTableRowElement
                          ).style.background = "transparent";
                        }}
                      >
                        <td style={{ ...tableCell, fontFamily: "monospace", color: "#7888cc" }}>
                          {bk.id}
                        </td>
                        <td style={tableCell}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16, lineHeight: 1 }}>
                              {bk.fileName.endsWith(".sql") ? "🗄️" : "💾"}
                            </span>
                            <span style={{ fontWeight: 600 }}>{bk.fileName}</span>
                          </div>
                        </td>
                        <td style={{ ...tableCell, fontFamily: "monospace" }}>
                          {formatBytes(bk.fileSizeBytes)}
                        </td>
                        <td style={tableCell}>
                          <div
                            style={{
                              ...badgeBase,
                              background:
                                bk.dbType === "Postgres"
                                  ? "rgba(52, 144, 220, 0.12)"
                                  : "rgba(255, 167, 38, 0.12)",
                              border: `1px solid ${
                                bk.dbType === "Postgres"
                                  ? "rgba(52, 144, 220, 0.3)"
                                  : "rgba(255, 167, 38, 0.3)"
                              }`,
                              color:
                                bk.dbType === "Postgres"
                                  ? "#3490dc"
                                  : "#ffa726",
                            }}
                          >
                            {bk.dbType === "Postgres" ? "🐘" : "🗃️"} {bk.dbType}
                          </div>
                        </td>
                        <td style={tableCell}>
                          <div
                            style={{
                              ...badgeBase,
                              background:
                                bk.status === "success"
                                  ? "rgba(128, 224, 160, 0.1)"
                                  : "rgba(255, 107, 107, 0.1)",
                              border: `1px solid ${
                                bk.status === "success"
                                  ? "rgba(128, 224, 160, 0.25)"
                                  : "rgba(255, 107, 107, 0.25)"
                              }`,
                              color:
                                bk.status === "success"
                                  ? "#80e0a0"
                                  : "#ff6b6b",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background:
                                  bk.status === "success"
                                    ? "#80e0a0"
                                    : "#ff6b6b",
                                marginRight: 2,
                              }}
                            />
                            {bk.status === "success" ? "Thành công" : "Thất bại"}
                          </div>
                        </td>
                        <td style={{ ...tableCell, whiteSpace: "nowrap" }}>
                          <div>{formatDateTime(bk.createdAt)}</div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#7888cc",
                              marginTop: 2,
                            }}
                          >
                            {formatTimeAgo(bk.createdAt)}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>

            {/* Empty table footer hint */}
            {backups.length > 0 && (
              <div
                style={{
                  padding: "10px 14px",
                  fontSize: 11,
                  color: "#7888cc",
                  borderTop: "1px solid rgba(99, 127, 255, 0.06)",
                  textAlign: "center",
                }}
              >
                Hiển thị {backups.length} bản ghi • Bản sao lưu tự động được xoá
                sau 90 ngày
              </div>
            )}
          </div>
        </section>
      )}

      {/* ────────────── LOADING STATE (Skeleton) ────────────── */}
      {loadState === "loading" && (
        <section aria-label="Danh sách bản sao lưu (đang tải)">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  height: 22,
                  width: 180,
                  borderRadius: 6,
                  background: "rgba(99, 127, 255, 0.08)",
                  animation: "pulse 1.5s ease-in-out infinite",
                  marginBottom: 6,
                }}
              />
              <div
                style={{
                  height: 14,
                  width: 240,
                  borderRadius: 6,
                  background: "rgba(99, 127, 255, 0.06)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          <div
            style={{
              ...glassCard,
              padding: 0,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 700,
              }}
            >
              <thead>
                <tr>
                  {["ID", "Tên tệp tin", "Dung lượng", "Loại CSDL", "Trạng thái", "Ngày khởi tạo"].map(
                    (h) => (
                      <th key={h} style={tableHeader}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={`skel-${i}`} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
