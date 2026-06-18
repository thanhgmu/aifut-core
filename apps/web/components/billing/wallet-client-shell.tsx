"use client";

// ─────────────────────────────────────────────────────────────
// Wallet Client Shell — Orchestration: loading/ready/empty/error
// Phase 3 (Operator Ready) · Frontend apps/web
// Inline styles (React.CSSProperties) — kế thừa pattern billing dashboard.
//
// Đấu nối dòng tiền (cash-flow wiring):
//   onTopupClick → router.push('/billing/paypal') → PayPal Smart Buttons.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  LedgerTxTypeUI,
  WalletDashboardData,
} from "../../types/wallet";
import {
  fetchWalletBalance,
  fetchWalletHistory,
} from "../../lib/wallet";
import { WalletBalanceCard } from "./wallet-balance-card";
import { WalletHistoryTable } from "./wallet-history-table";
import { RefundRequestModal } from "./refund-request-modal";

// ─── Loading / empty / error = stateless panels ──────

/** Reusable status panel: loading / empty / error */
function PanelMessage({
  tone,
  message,
  onRetry,
}: {
  tone: "muted" | "error" | "empty";
  message: string;
  onRetry?: () => void;
}) {
  const colorMap: Record<string, string> = {
    muted: "#c8d2ff",
    error: "#ff6b6b",
    empty: "#9fb0ff",
  };
  const bgMap: Record<string, string> = {
    muted: "rgba(255,255,255,0.03)",
    error: "rgba(255,107,107,0.08)",
    empty: "rgba(255,255,255,0.02)",
  };
  const borderMap: Record<string, string> = {
    muted: "1px solid rgba(255,255,255,0.06)",
    error: "1px solid rgba(255,107,107,0.2)",
    empty: "1px solid rgba(255,255,255,0.04)",
  };

  return (
    <div
      style={{
        padding: 40,
        borderRadius: 20,
        textAlign: "center",
        color: colorMap[tone],
        background: bgMap[tone],
        border: borderMap[tone],
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 16, marginBottom: tone === "error" ? 16 : 0 }}>
        {message}
      </div>
      {tone === "error" && onRetry && (
        <button
          type="button"
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            background: "rgba(109,124,255,0.12)",
            color: "#6d7cff",
            fontWeight: 700,
            border: "1px solid rgba(109,124,255,0.25)",
            cursor: "pointer",
            fontSize: 14,
            fontFamily: "Arial, sans-serif",
          }}
          onClick={onRetry}
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

function ShimmerBlock() {
  return (
    <div
      style={{
        padding: 24,
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(109,124,255,0.08), rgba(109,124,255,0.02))",
        border: "1px solid rgba(109,124,255,0.12)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Shimmer: title bar */}
      <div
        style={{
          width: "30%",
          height: 12,
          borderRadius: 4,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          marginBottom: 18,
        }}
      />
      {/* Shimmer: balance */}
      <div
        style={{
          width: "45%",
          height: 36,
          borderRadius: 6,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          marginBottom: 12,
        }}
      />
      {/* Shimmer: sub-label */}
      <div
        style={{
          width: "20%",
          height: 14,
          borderRadius: 4,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          marginBottom: 22,
        }}
      />
      {/* Shimmer: 2 action button placeholders */}
      <div style={{ display: "flex", gap: 12 }}>
        <div
          style={{
            width: 120,
            height: 42,
            borderRadius: 12,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
        <div
          style={{
            width: 160,
            height: 42,
            borderRadius: 12,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      </div>
    </div>
  );
}

// ─── Shell state machine ─────────────────────────────

type ShellPhase =
  | "loading" // initial load
  | "ready" // có dữ liệu
  | "empty" // wallet không tồn tại
  | "error"; // lỗi network/server

// ─── Main shell ──────────────────────────────────────

export function WalletClientShell() {
  const router = useRouter();
  const [phase, setPhase] = useState<ShellPhase>("loading");
  const [data, setData] = useState<WalletDashboardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const errorRef = useRef<string | null>(null);

  // ─── Initial load ──────────────────────────────────
  const loadAll = useCallback(async () => {
    setPhase("loading");
    errorRef.current = null;
    try {
      const [wallet, historyRes] = await Promise.all([
        fetchWalletBalance(),
        fetchWalletHistory({ limit: 15 }),
      ]);

      if (!wallet) {
        // Wallet chưa tồn tại → empty state
        setData(null);
        setPhase("empty");
        return;
      }

      setData({
        wallet,
        history: historyRes.items,
        nextCursor: historyRes.nextCursor,
        hasMore: historyRes.hasMore,
      });
      setPhase("ready");
    } catch (err) {
      errorRef.current =
        err instanceof Error ? err.message : "Không thể tải dữ liệu ví";
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Nạp tiền → điều hướng sang PayPal Smart Buttons ─
  // Wire chuẩn xác sự kiện click nút "Nạp tiền":
  //   router.push('/billing/paypal') → trang nạp tiền quốc tế.
  const handleTopupClick = useCallback(() => {
    router.push("/billing/paypal");
  }, [router]);

  // ─── Load more history (cursor pagination) ─────────
  const handleLoadMore = useCallback(
    async (cursor: string) => {
      if (!data) return;
      setHistoryLoading(true);
      try {
        const result = await fetchWalletHistory({
          cursor,
          limit: 15,
          type: data.typeFilter,
        });
        setData((prev) =>
          prev
            ? {
                ...prev,
                history: [...prev.history, ...result.items],
                nextCursor: result.nextCursor,
                hasMore: result.hasMore,
              }
            : prev,
        );
      } catch {
        // Silent fail — user có thể retry qua button
      } finally {
        setHistoryLoading(false);
      }
    },
    [data],
  );

  // ─── Filter change ─────────────────────────────────
  const handleFilterChange = useCallback(
    async (type?: LedgerTxTypeUI) => {
      if (!data) return;
      setHistoryLoading(true);
      try {
        const result = await fetchWalletHistory({
          limit: 15,
          type,
        });
        setData((prev) =>
          prev
            ? {
                ...prev,
                history: result.items,
                nextCursor: result.nextCursor,
                hasMore: result.hasMore,
                typeFilter: type,
              }
            : prev,
        );
      } catch {
        // Silent
      } finally {
        setHistoryLoading(false);
      }
    },
    [data],
  );

  // ─── Refund success → refresh ──────────────────────
  const handleRefundSuccess = useCallback(async () => {
    try {
      const [wallet, historyRes] = await Promise.all([
        fetchWalletBalance(),
        fetchWalletHistory({ limit: 15, type: data?.typeFilter }),
      ]);

      if (wallet) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                wallet,
                history: historyRes.items,
                nextCursor: historyRes.nextCursor,
                hasMore: historyRes.hasMore,
              }
            : prev,
        );
      }
    } catch {
      // Nếu refresh lỗi, user có thể reload trang
    }
  }, [data?.typeFilter]);

  // ─── Render ────────────────────────────────────────
  return (
    <>
      {/* ─── Loading state ─── */}
      {phase === "loading" && (
        <div style={{ display: "grid", gap: 22 }}>
          <ShimmerBlock />
          {/* Table skeleton hint */}
          <div
            style={{
              padding: 22,
              borderRadius: 20,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                width: 140,
                height: 16,
                borderRadius: 4,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
                marginBottom: 18,
              }}
            />
            <PanelMessage tone="muted" message="Đang tải dữ liệu ví…" />
          </div>
        </div>
      )}

      {/* ─── Error state ─── */}
      {phase === "error" && (
        <PanelMessage
          tone="error"
          message={errorRef.current ?? "Không thể tải dữ liệu ví"}
          onRetry={loadAll}
        />
      )}

      {/* ─── Empty state ─── */}
      {phase === "empty" && (
        <PanelMessage tone="empty" message="Chưa có dữ liệu ví" />
      )}

      {/* ─── Ready state ─── */}
      {phase === "ready" && data && (
        <div style={{ display: "grid", gap: 22 }}>
          <WalletBalanceCard
            wallet={data.wallet}
            onTopupClick={handleTopupClick}
            onRefundClick={() => setModalOpen(true)}
          />

          <WalletHistoryTable
            items={data.history}
            nextCursor={data.nextCursor}
            hasMore={data.hasMore}
            typeFilter={data.typeFilter}
            onLoadMore={handleLoadMore}
            onFilterChange={handleFilterChange}
            loading={historyLoading}
          />
        </div>
      )}

      {/* ─── Refund modal ─── */}
      <RefundRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleRefundSuccess}
      />

      {/* ─── Shimmer animation keyframes ─── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </>
  );
}

export default WalletClientShell;
