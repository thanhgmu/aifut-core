"use client";

// ─────────────────────────────────────────────────────────────
// Wallet Balance Widget — khối thẻ số dư tổng quan
// Phase 3 (Operator Ready) · Frontend apps/web
// Inline styles (React.CSSProperties) — kế thừa pattern billing dashboard.
// ─────────────────────────────────────────────────────────────

import type { CSSProperties } from "react";
import type { WalletInfo } from "../../types/wallet";
import { formatWalletAmount } from "../../lib/wallet";

interface WalletBalanceCardProps {
  wallet: WalletInfo;
  onRefundClick: () => void;
  onTopupClick?: () => void;
}

const STYLE: Record<string, CSSProperties> = {
  wrapper: {
    padding: 24,
    borderRadius: 20,
    background:
      "linear-gradient(135deg, rgba(109,124,255,0.12), rgba(109,124,255,0.03))",
    border: "1px solid rgba(109,124,255,0.2)",
    fontFamily: "Arial, sans-serif",
  },
  caption: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#9fb0ff",
    fontWeight: 700,
    marginBottom: 14,
  },
  balanceRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  balance: {
    fontSize: 36,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1.1,
  },
  subLabel: {
    fontSize: 13,
    color: "#c8d2ff",
    marginTop: 6,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 22,
  },
  btnTopup: {
    padding: "12px 20px",
    borderRadius: 12,
    background: "#6d7cff",
    color: "white",
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
  },
  btnRefund: {
    padding: "12px 20px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.05)",
    color: "#c8d2ff",
    fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.1)",
    cursor: "pointer",
    fontSize: 14,
  },
  btnRefundDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
};

function StatusPill({ status }: { status: WalletInfo["status"] }) {
  const locked = status === "locked";
  const pillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    color: locked ? "#ff6b6b" : "#80e0a0",
    background: locked
      ? "rgba(255,107,107,0.12)"
      : "rgba(128,224,160,0.12)",
    border: `1px solid ${locked ? "rgba(255,107,107,0.3)" : "rgba(128,224,160,0.3)"}`,
    whiteSpace: "nowrap",
  };
  return (
    <span style={pillStyle}>
      <span aria-hidden="true">●</span>
      {locked ? "Locked" : "Active"}
    </span>
  );
}

export function WalletBalanceCard({
  wallet,
  onRefundClick,
  onTopupClick,
}: WalletBalanceCardProps) {
  const locked = wallet.status === "locked";

  return (
    <section style={STYLE.wrapper} aria-label="Số dư ví điện tử">
      <div style={STYLE.caption}>Ví điện tử</div>

      <div style={STYLE.balanceRow}>
        <div>
          <div style={STYLE.balance}>{formatWalletAmount(wallet.balance)}</div>
          <div style={STYLE.subLabel}>Số dư khả dụng</div>
        </div>
        <StatusPill status={wallet.status} />
      </div>

      <div style={STYLE.actions}>
        <button
          type="button"
          style={STYLE.btnTopup}
          onClick={onTopupClick}
        >
          💳 Nạp tiền
        </button>
        <button
          type="button"
          style={{
            ...STYLE.btnRefund,
            ...(locked ? STYLE.btnRefundDisabled : {}),
          }}
          onClick={onRefundClick}
          disabled={locked}
          title={locked ? "Ví đang bị khóa" : "Yêu cầu hoàn trả"}
        >
          ↩️ Yêu cầu hoàn trả
        </button>
      </div>
    </section>
  );
}

export default WalletBalanceCard;
