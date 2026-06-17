"use client";

// ─────────────────────────────────────────────────────────────
// Ledger Transaction History Table — 6 cột + cursor pagination
// Phase 3 (Operator Ready) · Frontend apps/web
// Inline styles (React.CSSProperties) — kế thừa pattern billing dashboard.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import type { CSSProperties } from "react";
import type { LedgerTransactionItem, LedgerTxTypeUI } from "../../types/wallet";
import {
  formatWalletAmount,
  formatLedgerDate,
  txTypeMeta,
  referenceTypeMeta,
} from "../../lib/wallet";

// ─── Props ───────────────────────────────────────────

interface WalletHistoryTableProps {
  items: LedgerTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
  typeFilter?: LedgerTxTypeUI;
  onLoadMore: (cursor: string) => Promise<void>;
  onFilterChange: (type?: LedgerTxTypeUI) => void;
  loading?: boolean;
}

// ─── Inline style constants ──────────────────────────

const STYLE: Record<string, CSSProperties> = {
  section: {
    padding: 22,
    borderRadius: 20,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    fontFamily: "Arial, sans-serif",
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#f5f7ff",
    margin: 0,
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    color: "#9fb0ff",
  },
  filterSelect: {
    padding: "6px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.05)",
    color: "#f5f7ff",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "Arial, sans-serif",
    outline: "none",
  },
  header: {
    display: "grid",
    gridTemplateColumns: "100px 70px 1fr 1fr 130px 1.5fr",
    gap: 8,
    padding: "0 12px 8px",
    fontSize: 11,
    color: "#9fb0ff",
    textTransform: "uppercase",
    letterSpacing: 1,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "100px 70px 1fr 1fr 130px 1.5fr",
    gap: 8,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
    fontSize: 13,
    transition: "background 0.15s",
  },
  txCode: {
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    color: "#9fb0ff",
  },
  txAmount: {
    fontWeight: 700,
    fontSize: 14,
  },
  balanceAfter: {
    color: "#c8d2ff",
    fontSize: 13,
  },
  dateCell: {
    color: "#9fb0ff",
    fontSize: 13,
  },
  descCell: {
    color: "#c8d2ff",
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  loadMoreRow: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 16,
  },
  loadMoreBtn: {
    padding: "10px 24px",
    borderRadius: 10,
    background: "rgba(109,124,255,0.12)",
    color: "#6d7cff",
    fontWeight: 700,
    border: "1px solid rgba(109,124,255,0.25)",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "Arial, sans-serif",
    transition: "background 0.15s",
  },
  loadingBtn: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  doneText: {
    color: "#5a6488",
    fontSize: 12,
    textAlign: "center" as const,
    padding: "8px 0",
  },
  emptyState: {
    padding: 32,
    textAlign: "center" as const,
    color: "#9fb0ff",
    fontSize: 14,
  },
  skeletonRow: {
    display: "grid",
    gridTemplateColumns: "100px 70px 1fr 1fr 130px 1.5fr",
    gap: 8,
    padding: "10px 12px",
  },
  shimmer: {
    height: 14,
    borderRadius: 4,
    background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s infinite",
  },
};

// ─── Sub-components ──────────────────────────────────

function TxTypeBadge({ type }: { type: LedgerTxTypeUI }) {
  const meta = txTypeMeta(type);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 12,
        color: meta.color,
        background: meta.bgColor,
      }}
    >
      {meta.sign} {type}
    </span>
  );
}

function ReferenceChip({ type }: { type: string }) {
  const meta = referenceTypeMeta(type as any);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        color: meta.color,
        background: `${meta.color}14`,
        padding: "1px 6px",
        borderRadius: 4,
        whiteSpace: "nowrap",
      }}
    >
      {meta.icon} {meta.label}
    </span>
  );
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={STYLE.skeletonRow}>
          <div style={{ ...STYLE.shimmer, width: 56 }} />
          <div style={{ ...STYLE.shimmer, width: 48 }} />
          <div style={{ ...STYLE.shimmer, width: 64 }} />
          <div style={{ ...STYLE.shimmer, width: 64 }} />
          <div style={{ ...STYLE.shimmer, width: 80 }} />
          <div style={{ ...STYLE.shimmer, width: 100 }} />
        </div>
      ))}
    </>
  );
}

// ─── Main component ──────────────────────────────────

export function WalletHistoryTable({
  items,
  nextCursor,
  hasMore,
  typeFilter,
  onLoadMore,
  onFilterChange,
  loading = false,
}: WalletHistoryTableProps) {
  const [loadingMore, setLoadingMore] = useState(false);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await onLoadMore(nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, onLoadMore]);

  const isInitialLoading = loading && items.length === 0;
  const isEmpty = !loading && items.length === 0;

  return (
    <section style={STYLE.section} aria-label="Lịch sử giao dịch ví">
      {/* ─── Toolbar: title + filter ─── */}
      <div style={STYLE.toolbar}>
        <h3 style={STYLE.sectionTitle}>Lịch sử giao dịch</h3>
        <div style={STYLE.filterRow}>
          <span style={STYLE.filterLabel}>Bộ lọc:</span>
          <select
            style={STYLE.filterSelect}
            value={typeFilter ?? ""}
            onChange={(e) =>
              onFilterChange((e.target.value as LedgerTxTypeUI) || undefined)
            }
          >
            <option value="">Tất cả</option>
            <option value="CREDIT">CREDIT</option>
            <option value="DEBIT">DEBIT</option>
          </select>
        </div>
      </div>

      {/* ─── Initial loading skeleton ─── */}
      {isInitialLoading && <SkeletonRows count={5} />}

      {/* ─── Empty state ─── */}
      {isEmpty && (
        <div style={STYLE.emptyState}>
          {typeFilter
            ? `Không có giao dịch ${typeFilter} nào`
            : "Chưa có giao dịch nào"}
        </div>
      )}

      {/* ─── Table header ─── */}
      {!isInitialLoading && items.length > 0 && (
        <>
          <div style={STYLE.header}>
            <div>Mã GD</div>
            <div>Loại</div>
            <div>Số tiền</div>
            <div>Số dư sau</div>
            <div>Ngày</div>
            <div>Mô tả</div>
          </div>

          <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
            {items.map((tx) => {
              const typeMeta = txTypeMeta(tx.type);
              const refMeta = referenceTypeMeta(tx.referenceType as any);
              return (
                <div key={tx.id} style={STYLE.row}>
                  {/* Mã GD */}
                  <div style={STYLE.txCode} title={tx.id}>
                    {tx.id.length > 8 ? `${tx.id.slice(0, 8)}…` : tx.id}
                  </div>

                  {/* Loại */}
                  <div>
                    <TxTypeBadge type={tx.type} />
                  </div>

                  {/* Số tiền */}
                  <div style={{ ...STYLE.txAmount, color: typeMeta.color }}>
                    {typeMeta.sign}
                    {formatWalletAmount(tx.amount)}
                  </div>

                  {/* Số dư sau */}
                  <div style={STYLE.balanceAfter}>
                    {formatWalletAmount(tx.balanceAfter)}
                  </div>

                  {/* Ngày */}
                  <div style={STYLE.dateCell}>
                    {formatLedgerDate(tx.createdAt)}
                  </div>

                  {/* Mô tả */}
                  <div style={STYLE.descCell}>
                    <span>{tx.description ?? "—"}</span>
                    <span style={{ marginLeft: 6 }}>
                      <ReferenceChip type={tx.referenceType} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Load-more / loading-more indicator ─── */}
      {!isInitialLoading && items.length > 0 && (
        <div style={STYLE.loadMoreRow}>
          {hasMore ? (
            <button
              type="button"
              style={{
                ...STYLE.loadMoreBtn,
                ...(loadingMore ? STYLE.loadingBtn : {}),
              }}
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Đang tải thêm…" : "Tải thêm ↓"}
            </button>
          ) : (
            <div style={STYLE.doneText}>Đã hiển thị tất cả</div>
          )}
        </div>
      )}
    </section>
  );
}

export default WalletHistoryTable;
