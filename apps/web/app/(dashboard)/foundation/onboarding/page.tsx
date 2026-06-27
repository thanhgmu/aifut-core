"use client";

// ============================================================
// app/(dashboard)/foundation/onboarding/page.tsx
// Onboarding Wizard — Khởi tạo Tenant nhanh chóng
//
// Client Component: Wizard 3 bước khởi tạo chi nhánh, chọn gói
// workflow mẫu, kích hoạt sandbox thanh toán.
//
// Layout:
//   [Trái] → Wizard Stepper (3 bước) + nội dung form
//   [Phải] → Glass Card Preview cấu hình Tenant (real-time)
//
// Pattern: dark theme (#0b1020), Glass Card, accent xanh indigo.
// ============================================================

import type { CSSProperties, ChangeEvent } from "react";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

/** 3 bước khởi tạo */
type WizardStep = 1 | 2 | 3;

/** Trạng thái tiến trình wizard */
type WizardPhase =
  | "idle"       // chưa làm gì
  | "validating" // đang kiểm tra dữ liệu bước hiện tại
  | "processing" // đang xử lý (giả lập)
  | "done"       // hoàn tất
  | "error";     // lỗi

/** Thông tin Tenant do user nhập Bước 1 */
interface TenantInfo {
  businessName: string;
  domain: string;
}

/** Mẫu Workflow có sẵn (Bước 2) */
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  accent: string; // gradient class
  nodeCount: number;
}

/** Trạng thái cổng thanh toán (Bước 3) */
interface PaymentGateway {
  key: "vnpay" | "momo";
  label: string;
  icon: string;
  sandbox: boolean;
  activated: boolean;
}

/** Schema preview — cập nhật real-time ở cột phải */
interface TenantPreview {
  tenantName: string;
  subdomain: string;
  templatePack: string | null;
  gatewayCount: number;
  gatesActive: string[];
  createdAt: string;
  status: "draft" | "configuring" | "ready";
}

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "auto-notify",
    name: "AutoNotify",
    description:
      "Tự động gửi thông báo Zalo ZNS / Email khi có sự kiện thanh toán, đơn hàng mới, hoặc cảnh báo hệ thống.",
    category: "Thông báo",
    icon: "🔔",
    accent: "from-indigo-500 to-blue-600",
    nodeCount: 6,
  },
  {
    id: "order-pipeline",
    name: "OrderPipeline",
    description:
      "Pipeline xử lý đơn hàng từ webhook -> kiểm tra điều kiện -> gửi xác nhận -> chờ giao hàng -> đánh giá.",
    category: "Bán hàng",
    icon: "📦",
    accent: "from-emerald-500 to-teal-600",
    nodeCount: 12,
  },
  {
    id: "daily-report",
    name: "DailyReport",
    description:
      "Tạo báo cáo tự động hằng ngày/tuần, tổng hợp số liệu kinh doanh và gửi qua Email/Zalo cho quản lý.",
    category: "Báo cáo",
    icon: "📊",
    accent: "from-amber-500 to-orange-600",
    nodeCount: 5,
  },
  {
    id: "multi-channel",
    name: "OmniChannel",
    description:
      "Đồng bộ tin nhắn và tương tác khách hàng qua nhiều kênh: Zalo, Email, SMS, Webhook, Telegram.",
    category: "Đa kênh",
    icon: "🌐",
    accent: "from-purple-500 to-pink-600",
    nodeCount: 9,
  },
];

const GATEWAY_OPTIONS: PaymentGateway[] = [
  {
    key: "vnpay",
    label: "VNPay Sandbox",
    icon: "VN",
    sandbox: true,
    activated: false,
  },
  {
    key: "momo",
    label: "MoMo Sandbox",
    icon: "MM",
    sandbox: true,
    activated: false,
  },
];

// ─────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────

const PAGE_WRAPPER: CSSProperties = {
  display: "flex",
  gap: 32,
  maxWidth: 1400,
  margin: "0 auto",
  padding: "28px 32px",
  minHeight: "100vh",
};

const LEFT_COL: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 28,
};

const RIGHT_COL: CSSProperties = {
  width: 380,
  flexShrink: 0,
  position: "sticky",
  top: 100,
  alignSelf: "flex-start",
};

const glassCard: CSSProperties = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 16,
  padding: "28px 32px",
};

const GLASS_PREVIEW: CSSProperties = {
  ...glassCard,
  width: "100%",
};

const STEP_BOX: CSSProperties = {
  ...glassCard,
};

const LABEL: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 6,
  letterSpacing: 0.3,
  textTransform: "uppercase" as const,
};

const INPUT: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  color: "#f1f5f9",
  fontSize: 15,
  outline: "none",
  transition: "border-color 0.2s ease",
  boxSizing: "border-box" as const,
};

const TOOLBAR: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 12,
  paddingTop: 20,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const BTN_SECONDARY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 28px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#94a3b8",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const BTN_PRIMARY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 28px",
  borderRadius: 10,
  background: "linear-gradient(135deg, #4f46e5, #6366f1)",
  border: "1px solid rgba(99,102,241,0.4)",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const BTN_DISABLED: CSSProperties = {
  ...BTN_PRIMARY,
  opacity: 0.4,
  cursor: "not-allowed" as const,
  pointerEvents: "none" as const,
};

const STEP_INDICATOR_WRAP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 32,
};

const STEP_NUM: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "50%",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.3s ease",
};

const STEP_NUM_ACTIVE: CSSProperties = {
  ...STEP_NUM,
  background: "linear-gradient(135deg, #4f46e5, #6366f1)",
  color: "#fff",
  boxShadow: "0 0 16px rgba(99,102,241,0.3)",
};

const STEP_NUM_INACTIVE: CSSProperties = {
  ...STEP_NUM,
  background: "rgba(255,255,255,0.04)",
  color: "#475569",
  border: "1px solid rgba(255,255,255,0.06)",
};

const STEP_NUM_DONE: CSSProperties = {
  ...STEP_NUM,
  background: "rgba(34, 197, 94, 0.15)",
  color: "#22c55e",
  border: "1px solid rgba(34, 197, 94, 0.3)",
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Thiết lập chi nhánh",
  2: "Chọn gói Workflow",
  3: "Kết nối thanh toán",
};

function getStepNumStyle(
  step: number,
  current: WizardStep
): CSSProperties {
  if (step < current) return STEP_NUM_DONE;
  if (step === current) return STEP_NUM_ACTIVE;
  return STEP_NUM_INACTIVE;
}

function isStepComplete(
  step: WizardStep,
  tenant: TenantInfo,
  selectedTemplate: string | null
): boolean {
  if (step === 1) return tenant.businessName.trim().length > 0 && tenant.domain.trim().length > 0;
  if (step === 2) return selectedTemplate !== null;
  return true;
}

function generateTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mi} ${dd}/${mm}/${yyyy}`;
}

function sanitizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 32);
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: STEPPER HEADER
// ─────────────────────────────────────────────────────────────

function StepperHeader({
  current,
}: {
  current: WizardStep;
}) {
  return (
    <div style={STEP_INDICATOR_WRAP}>
      {([1, 2, 3] as const).map((s) => (
        <div
          key={s}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={getStepNumStyle(s, current)}>
            {s < current ? "✓" : s}
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: s === current ? 600 : 400,
              color: s === current ? "#e2e8f0" : "#475569",
              whiteSpace: "nowrap" as const,
            }}
          >
            {STEP_LABELS[s]}
          </span>
          {s < 3 && (
            <span style={{ color: "#334155", margin: "0 4px" }}>
              —
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: STEP 1 — TENANT SETUP
// ─────────────────────────────────────────────────────────────

function StepTenantSetup({
  tenant,
  onChange,
}: {
  tenant: TenantInfo;
  onChange: (t: TenantInfo) => void;
}) {
  const handleName = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...tenant, businessName: e.target.value });
    },
    [tenant, onChange]
  );

  const handleDomain = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...tenant,
        domain: sanitizeDomain(e.target.value),
      });
    },
    [tenant, onChange]
  );

  return (
    <>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#f1f5f9",
          margin: "0 0 8px 0",
        }}
      >
        Thiết lập chi nhánh
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "#64748b",
          margin: "0 0 28px 0",
          lineHeight: 1.6,
        }}
      >
        Nhập thông tin doanh nghiệp của bạn. Đây sẽ là tenant chính
        cho toàn bộ hệ thống AIFUT.
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={LABEL}>Tên doanh nghiệp *</label>
        <input
          style={INPUT}
          type="text"
          placeholder='VD: "Công ty TNHH ABC"'
          value={tenant.businessName}
          onChange={handleName}
        />
        <span
          style={{
            display: "block",
            fontSize: 12,
            color: "#475569",
            marginTop: 4,
          }}
        >
          {tenant.businessName.length}/100 ký tự
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={LABEL}>Domain mong muốn *</label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
          }}
        >
          <input
            style={{
              ...INPUT,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              flex: 1,
            }}
            type="text"
            placeholder="ten-cong-ty"
            value={tenant.domain}
            onChange={handleDomain}
          />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "14px 16px",
              borderRadius: "0 10px 10px 0",
              border: "1px solid rgba(255,255,255,0.08)",
              borderLeft: "none",
              background: "rgba(255,255,255,0.02)",
              color: "#64748b",
              fontSize: 14,
              whiteSpace: "nowrap" as const,
            }}
          >
            .aifut.io
          </span>
        </div>
        <span
          style={{
            display: "block",
            fontSize: 12,
            color: "#475569",
            marginTop: 4,
          }}
        >
          Chỉ gồm chữ cái thường, số, dấu gạch ngang. Tối đa 32 ký tự.
        </span>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: STEP 2 — WORKFLOW TEMPLATES (GRID 4)
// ─────────────────────────────────────────────────────────────

function StepTemplates({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#f1f5f9",
          margin: "0 0 8px 0",
        }}
      >
        Chọn gói Workflow mẫu
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "#64748b",
          margin: "0 0 28px 0",
          lineHeight: 1.6,
        }}
      >
        Chọn một template workflow để khởi động nhanh. Bạn có thể
        tuỳ chỉnh sau.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {WORKFLOW_TEMPLATES.map((tmpl) => {
          const isChosen = selected === tmpl.id;

          return (
            <button
              key={tmpl.id}
              onClick={() => onSelect(tmpl.id)}
              style={{
                ...glassCard,
                cursor: "pointer",
                textAlign: "left" as const,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                border: isChosen
                  ? "2px solid #6366f1"
                  : "1px solid rgba(255,255,255,0.06)",
                background: isChosen
                  ? "rgba(99,102,241,0.08)"
                  : "rgba(255,255,255,0.02)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!isChosen) {
                  e.currentTarget.style.borderColor =
                    "rgba(255,255,255,0.15)";
                  e.currentTarget.style.background =
                    "rgba(255,255,255,0.04)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isChosen) {
                  e.currentTarget.style.borderColor =
                    "rgba(255,255,255,0.06)";
                  e.currentTarget.style.background =
                    "rgba(255,255,255,0.02)";
                }
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    lineHeight: 1,
                  }}
                >
                  {tmpl.icon}
                </span>
                {isChosen && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#6366f1",
                      padding: "2px 10px",
                      borderRadius: 20,
                      background: "rgba(99,102,241,0.15)",
                      border: "1px solid rgba(99,102,241,0.3)",
                    }}
                  >
                    Đã chọn
                  </span>
                )}
              </div>

              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#f1f5f9",
                    marginBottom: 4,
                  }}
                >
                  {tmpl.name}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  {tmpl.description}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                <span>{tmpl.category}</span>
                <span>{tmpl.nodeCount} node</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: STEP 3 — PAYMENT GATEWAY QUICK CONNECT
// ─────────────────────────────────────────────────────────────

function StepPayment({
  gateways,
  onToggle,
  completed,
}: {
  gateways: PaymentGateway[];
  onToggle: (key: "vnpay" | "momo") => void;
  completed: boolean;
}) {
  return (
    <>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#f1f5f9",
          margin: "0 0 8px 0",
        }}
      >
        Kết nối cổng thanh toán
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "#64748b",
          margin: "0 0 28px 0",
          lineHeight: 1.6,
        }}
      >
        Kích hoạt nhanh Sandbox để bắt đầu nhận thanh toán thử
        nghiệm. Bạn có thể thêm cổng thật sau.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {gateways.map((gw) => {
          const isActivated = gw.activated;

          return (
            <div
              key={gw.key}
              style={{
                ...glassCard,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                border: isActivated
                  ? "1px solid rgba(34,197,94,0.3)"
                  : "1px solid rgba(255,255,255,0.06)",
                background: isActivated
                  ? "rgba(34,197,94,0.04)"
                  : "rgba(255,255,255,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 14,
                    background: isActivated
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(255,255,255,0.04)",
                    color: isActivated ? "#22c55e" : "#94a3b8",
                    border: isActivated
                      ? "1px solid rgba(34,197,94,0.3)"
                      : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {gw.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#f1f5f9",
                      marginBottom: 2,
                    }}
                  >
                    {gw.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    {gw.sandbox ? "Môi trường Sandbox" : "Môi trường thật"}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onToggle(gw.key)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  border: isActivated
                    ? "1px solid rgba(34,197,94,0.3)"
                    : "1px solid rgba(99,102,241,0.3)",
                  background: isActivated
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(99,102,241,0.1)",
                  color: isActivated ? "#22c55e" : "#6366f1",
                  transition: "all 0.2s ease",
                }}
              >
                {isActivated ? "Đã kích hoạt" : "Kích hoạt"}
              </button>
            </div>
          );
        })}
      </div>

      {completed && (
        <div
          style={{
            marginTop: 20,
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            color: "#22c55e",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🎉</span>
          <span>
            Đã kích hoạt ít nhất một cổng thanh toán. Bạn có thể bắt
            đầu nhận thanh toán thử nghiệm ngay!
          </span>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: PREVIEW CARD (CỘT PHẢI)
// ─────────────────────────────────────────────────────────────

function PreviewCard({
  tenant,
  selectedTemplate,
  gatesActive,
  phase,
}: {
  tenant: TenantInfo;
  selectedTemplate: string | null;
  gatesActive: string[];
  phase: WizardPhase;
}) {
  const preview: TenantPreview = useMemo(() => {
    const tmpl = selectedTemplate
      ? WORKFLOW_TEMPLATES.find((t) => t.id === selectedTemplate)
      : null;

    return {
      tenantName:
        tenant.businessName.trim() || "Chưa nhập",
      subdomain:
        tenant.domain.trim()
          ? `${tenant.domain}.aifut.io`
          : "chưa có",
      templatePack: tmpl ? tmpl.name : null,
      gatewayCount: gatesActive.length,
      gatesActive,
      createdAt: generateTimestamp(),
      status: phase === "done" ? "ready" : tenant.businessName.trim() ? "configuring" : "draft",
    };
  }, [tenant, selectedTemplate, gatesActive, phase]);

  const statusColor =
    preview.status === "ready"
      ? "#22c55e"
      : preview.status === "configuring"
        ? "#6366f1"
        : "#64748b";

  const statusLabel =
    preview.status === "ready"
      ? "Sẵn sàng"
      : preview.status === "configuring"
        ? "Đang cấu hình"
        : "Bản nháp";

  return (
    <div style={GLASS_PREVIEW}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase" as const,
            letterSpacing: 0.5,
          }}
        >
          Preview Tenant
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 12px",
            borderRadius: 20,
            background: `${statusColor}15`,
            color: statusColor,
            border: `1px solid ${statusColor}30`,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Timeline line */}
      <div
        style={{
          position: "relative",
          paddingLeft: 20,
        }}
      >
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 8,
            bottom: 8,
            width: 2,
            background: "rgba(99,102,241,0.2)",
          }}
        />

        {/* Tenant name */}
        <PreviewRow
          dotColor="#6366f1"
          label="Tên chi nhánh"
          value={preview.tenantName}
          glow
        />

        {/* Domain */}
        <PreviewRow
          dotColor="#6366f1"
          label="Domain"
          value={preview.subdomain}
        />

        {/* Template */}
        <PreviewRow
          dotColor={
            preview.templatePack ? "#22c55e" : "#475569"
          }
          label="Gói Workflow"
          value={preview.templatePack ?? "Chưa chọn"}
        />

        {/* Gateway */}
        <PreviewRow
          dotColor={preview.gatewayCount > 0 ? "#22c55e" : "#475569"}
          label="Cổng thanh toán"
          value={
            preview.gatewayCount > 0
              ? `${preview.gatewayCount} cổng đã kích hoạt`
              : "Chưa kích hoạt"
          }
        />

        {/* Timestamp */}
        <PreviewRow
          dotColor="#64748b"
          label="Thời điểm tạo"
          value={preview.createdAt}
        />
      </div>

      {/* Raw JSON block */}
      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 10,
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(255,255,255,0.04)",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: 12,
          color: "#64748b",
          lineHeight: 1.8,
          overflow: "auto" as const,
          maxHeight: 200,
        }}
      >
        <span style={{ color: "#22c55e" }}>{`{`}</span>
        <br />
        <span style={{ color: "#94a3b8" }}>  "tenantId"</span>:{" "}
        <span style={{ color: "#e2e8f0" }}>"{preview.subdomain}"</span>,
        <br />
        <span style={{ color: "#94a3b8" }}>  "businessName"</span>:{" "}
        <span style={{ color: "#e2e8f0" }}>
          "{preview.tenantName}"
        </span>
        ,
        <br />
        <span style={{ color: "#94a3b8" }}>
          "  templatePack"
        </span>
        :{" "}
        <span style={{ color: "#e2e8f0" }}>
          "{preview.templatePack ?? "null"}"
        </span>
        ,
        <br />
        <span style={{ color: "#94a3b8" }}>
          "  paymentGateways"
        </span>
        :{" "}
        <span style={{ color: "#facc15" }}>
          {JSON.stringify(preview.gatesActive)}
        </span>
        ,
        <br />
        <span style={{ color: "#94a3b8" }}>  "createdAt"</span>:{" "}
        <span style={{ color: "#e2e8f0" }}>
          "{preview.createdAt}"
        </span>
        ,
        <br />
        <span style={{ color: "#94a3b8" }}>
          "  lifecycleStatus"
        </span>
        :{" "}
        <span style={{ color: "#22c55e" }}>
          "{preview.status}"
        </span>
        ,
        <br />
        <span style={{ color: "#22c55e" }}>{`}`}</span>
      </div>
    </div>
  );
}

/** Một dòng trong preview timeline */
function PreviewRow({
  dotColor,
  label,
  value,
  glow,
}: {
  dotColor: string;
  label: string;
  value: string;
  glow?: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: 18,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -16,
          top: 6,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: glow
            ? `0 0 8px ${dotColor}60`
            : undefined,
        }}
      />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#64748b",
          textTransform: "uppercase" as const,
          letterSpacing: 0.4,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#f1f5f9",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: LOADING SPINNER
// ─────────────────────────────────────────────────────────────

function LoadingOverlay({
  message,
}: {
  message: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "60px 20px",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "3px solid rgba(99,102,241,0.15)",
          borderTopColor: "#6366f1",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <span
        style={{
          fontSize: 15,
          color: "#94a3b8",
          fontWeight: 500,
        }}
      >
        {message}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: SUCCESS PANEL
// ─────────────────────────────────────────────────────────────

function SuccessPanel({
  onReset,
}: {
  onReset: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "60px 20px",
        textAlign: "center" as const,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(34,197,94,0.1)",
          border: "2px solid rgba(34,197,94,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
        }}
      >
        🎉
      </div>
      <div>
        <h2
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#f1f5f9",
            margin: "0 0 8px 0",
          }}
        >
          Thiết lập hoàn tất!
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            lineHeight: 1.6,
            maxWidth: 400,
          }}
        >
          Tenant của bạn đã sẵn sàng. Bạn có thể bắt đầu khám phá
          Workflow, kết nối thêm kênh, hoặc quản lý chi nhánh từ
          Dashboard.
        </p>
      </div>
      <button
        onClick={onReset}
        style={{
          ...BTN_SECONDARY,
          color: "#6366f1",
          borderColor: "rgba(99,102,241,0.3)",
        }}
      >
        ← Quay lại trang chủ
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT — ONBOARDING PAGE
// ─────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();

  /* ── State ─────────────────────────────────────────────── */
  const [step, setStep] = useState<WizardStep>(1);
  const [phase, setPhase] = useState<WizardPhase>("idle");

  const [tenant, setTenant] = useState<TenantInfo>({
    businessName: "",
    domain: "",
  });

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
    null
  );

  const [gateways, setGateways] = useState<PaymentGateway[]>(
    GATEWAY_OPTIONS.map((g) => ({ ...g }))
  );

  /* ── Derived ───────────────────────────────────────────── */
  const gatesActive = useMemo(
    () => gateways.filter((g) => g.activated).map((g) => g.key),
    [gateways]
  );

  const step1Valid = useMemo(
    () => tenant.businessName.trim().length > 0 && tenant.domain.trim().length > 0,
    [tenant]
  );

  const step2Valid = useMemo(() => selectedTemplate !== null, [selectedTemplate]);

  const step3Valid = useMemo(() => gatesActive.length > 0, [gatesActive]);

  const isLastStep = step === 3;
  const isProcessing = phase === "processing" || phase === "validating";

  /* ── Callbacks ─────────────────────────────────────────── */
  const handleToggleGateway = useCallback(
    (key: "vnpay" | "momo") => {
      setGateways((prev) =>
        prev.map((g) =>
          g.key === key ? { ...g, activated: !g.activated } : g
        )
      );
    },
    []
  );

  const goNext = useCallback(() => {
    if (isProcessing) return;

    // Validate current step
    if (step === 1 && !step1Valid) {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 2000);
      return;
    }
    if (step === 2 && !step2Valid) {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 2000);
      return;
    }

    if (isLastStep) {
      // Step 3: finish onboarding
      setPhase("processing");
      setTimeout(() => {
        setPhase("done");
      }, 1500);
    } else {
      // Simulate transition
      setPhase("processing");
      setTimeout(() => {
        setPhase("idle");
        setStep((s) => (s + 1) as WizardStep);
      }, 400);
    }
  }, [step, isLastStep, isProcessing, step1Valid, step2Valid]);

  const goBack = useCallback(() => {
    if (step > 1 && !isProcessing) {
      setStep((s) => (s - 1) as WizardStep);
    }
  }, [step, isProcessing]);

  const handleReset = useCallback(() => {
    setStep(1);
    setPhase("idle");
    setTenant({ businessName: "", domain: "" });
    setSelectedTemplate(null);
    setGateways(GATEWAY_OPTIONS.map((g) => ({ ...g })));
  }, []);

  /* ── Render content by step ────────────────────────────── */
  const renderStepContent = () => {
    if (phase === "done") {
      return <SuccessPanel onReset={handleReset} />;
    }

    switch (step) {
      case 1:
        return <StepTenantSetup tenant={tenant} onChange={setTenant} />;
      case 2:
        return (
          <StepTemplates
            selected={selectedTemplate}
            onSelect={setSelectedTemplate}
          />
        );
      case 3:
        return (
          <StepPayment
            gateways={gateways}
            onToggle={handleToggleGateway}
            completed={gatesActive.length > 0}
          />
        );
      default:
        return null;
    }
  };

  /* ── Can proceed ───────────────────────────────────────── */
  const canProceed = useMemo(() => {
    if (isProcessing) return false;
    if (step === 1) return step1Valid;
    if (step === 2) return step2Valid;
    if (step === 3) return true; // optional, can finish without gates
    return false;
  }, [step, isProcessing, step1Valid, step2Valid, step3Valid]);

  /* ── Loading message ───────────────────────────────────── */
  const loadingMessage =
    phase === "processing"
      ? isLastStep
        ? "Đang khởi tạo Tenant..."
        : "Đang chuyển bước..."
      : phase === "validating"
        ? "Đang kiểm tra dữ liệu..."
        : "Đang xử lý...";

  return (
    <div style={PAGE_WRAPPER}>
      {/* ─── LEFT COLUMN ─────────────────────────────────── */}
      <div style={LEFT_COL}>
        {/* Page header */}
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#f1f5f9",
              margin: "0 0 6px 0",
            }}
          >
            Hoàn tất thiết lập 🚀
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#64748b",
              margin: 0,
            }}
          >
            Chỉ 3 bước đơn giản để khởi tạo chi nhánh và bắt đầu vận hành.
          </p>
        </div>

        {/* Stepper Indicator */}
        {phase !== "done" && <StepperHeader current={step} />}

        {/* Step content */}
        <div style={STEP_BOX}>
          {phase === "processing" || phase === "validating" ? (
            <LoadingOverlay message={loadingMessage} />
          ) : (
            renderStepContent()
          )}
        </div>

        {/* Toolbar */}
        {phase !== "done" && (
          <div style={TOOLBAR}>
            <button
              onClick={goBack}
              style={{
                ...BTN_SECONDARY,
                opacity: step === 1 || isProcessing ? 0.4 : 1,
                cursor:
                  step === 1 || isProcessing
                    ? "not-allowed"
                    : "pointer",
                pointerEvents:
                  step === 1 || isProcessing ? "none" : "auto",
              }}
            >
              ← Quay lại
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                Bước {step} / 3
              </span>

              <button
                onClick={goNext}
                style={
                  !canProceed
                    ? BTN_DISABLED
                    : BTN_PRIMARY
                }
              >
                {isLastStep ? "✅ Hoàn thành" : "Tiếp tục →"}
              </button>
            </div>
          </div>
        )}

        {/* Error flash */}
        {phase === "error" && (
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#ef4444",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⚠️ Vui lòng điền đầy đủ thông tin trước khi tiếp tục.
          </div>
        )}
      </div>

      {/* ─── RIGHT COLUMN — PREVIEW ──────────────────────── */}
      <div style={RIGHT_COL}>
        <PreviewCard
          tenant={tenant}
          selectedTemplate={selectedTemplate}
          gatesActive={gatesActive}
          phase={phase}
        />
      </div>
    </div>
  );
}
