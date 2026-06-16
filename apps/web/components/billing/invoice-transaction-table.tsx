"use client";

import { useState } from "react";
import { formatBillingDate, statusColor } from "../../lib/billing";
import type { InvoiceRow, TransactionRow } from "../../types/billing";

type Tab = "invoices" | "transactions";

interface Props {
  invoices: InvoiceRow[];
  transactions: TransactionRow[];
}

/** Tabbed history of invoices and raw transactions. */
export function InvoiceTransactionTable({ invoices, transactions }: Props) {
  const [tab, setTab] = useState<Tab>("invoices");

  return (
    <section
      style={{
        padding: 22,
        borderRadius: 20,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <TabButton active={tab === "invoices"} onClick={() => setTab("invoices")}>
          Invoices
        </TabButton>
        <TabButton active={tab === "transactions"} onClick={() => setTab("transactions")}>
          Transactions
        </TabButton>
      </div>

      {tab === "invoices" ? (
        <InvoiceList invoices={invoices} />
      ) : (
        <TransactionList transactions={transactions} />
      )}
    </section>
  );
}

function InvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
  if (!invoices.length) return <EmptyRow label="No invoices yet." />;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Header cols={["Invoice", "Date", "Amount", "Status", ""]} />
      {invoices.map((inv) => (
        <Row key={inv.id}>
          <div style={{ fontWeight: 600 }}>
            {inv.number}
            <div style={{ fontSize: 12, color: "#9fb0ff" }}>{inv.description}</div>
          </div>
          <div style={cell}>{formatBillingDate(inv.date)}</div>
          <div style={cell}>{inv.amountDisplay}</div>
          <div style={cell}>
            <StatusText status={inv.status} />
          </div>
          <div style={{ ...cell, textAlign: "right" }}>
            {inv.downloadUrl ? (
              <a href={inv.downloadUrl} style={{ color: "#6d7cff", fontSize: 13, fontWeight: 600 }}>
                Download
              </a>
            ) : (
              <span style={{ color: "#5a6488", fontSize: 13 }}>—</span>
            )}
          </div>
        </Row>
      ))}
    </div>
  );
}

function TransactionList({ transactions }: { transactions: TransactionRow[] }) {
  if (!transactions.length) return <EmptyRow label="No transactions yet." />;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Header cols={["Description", "Date", "Type", "Amount", "Status"]} />
      {transactions.map((tx) => (
        <Row key={tx.id}>
          <div style={{ fontWeight: 600 }}>{tx.description}</div>
          <div style={cell}>{formatBillingDate(tx.date)}</div>
          <div style={{ ...cell, textTransform: "capitalize" }}>{tx.kind}</div>
          <div style={cell}>{tx.amountDisplay}</div>
          <div style={cell}>
            <StatusText status={tx.status} />
          </div>
        </Row>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 700,
        background: active ? "#6d7cff" : "rgba(255,255,255,0.05)",
        color: active ? "white" : "#9fb0ff",
      }}
    >
      {children}
    </button>
  );
}

function Header({ cols }: { cols: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `2fr repeat(${cols.length - 1}, 1fr)`,
        gap: 12,
        padding: "0 12px 8px",
        fontSize: 11,
        color: "#9fb0ff",
        textTransform: "uppercase",
        letterSpacing: 1,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {cols.map((c, i) => (
        <div key={i} style={{ textAlign: i === cols.length - 1 ? "right" : "left" }}>
          {c}
        </div>
      ))}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const count = Array.isArray(children) ? children.length : 1;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `2fr repeat(${count - 1}, 1fr)`,
        gap: 12,
        alignItems: "center",
        padding: "12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function StatusText({ status }: { status: string }) {
  return (
    <span style={{ color: statusColor(status), fontWeight: 600, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div style={{ padding: 24, textAlign: "center", color: "#9fb0ff", fontSize: 14 }}>{label}</div>
  );
}

const cell: React.CSSProperties = { color: "#c8d2ff" };
