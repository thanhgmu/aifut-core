"use client";
import { JSX, useMemo, useState, useEffect } from "react";
import type { CSSProperties } from "react";
export default function GovernanceVisibilityPage(): JSX.Element {
  const [fxRate, setFxRate] = useState(25450);
  const [isLoading, setIsLoading] = useState(true);
  const [budgetTotal] = useState(25000);
  const [budgetUsed] = useState(1428.75);
  const remainingUsd = +(budgetTotal - budgetUsed).toFixed(2);
  const pressurePct = +((budgetUsed / budgetTotal) * 100).toFixed(1);
  const roiCurrent = 3.42;
  useEffect(() => {
    async function fetchFX() {
      try {
        const res = await fetch("/api/billing/fx-rates/rates?baseCurrency=USD&targetCurrency=VND");
        if (res.ok) { const data = await res.json(); if (data.rate) setFxRate(data.rate); }
      } catch { console.warn("API Offline"); } finally { setIsLoading(false); }
    }
    fetchFX();
  }, []);
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px 60px" }}>
      <header style={{ marginBottom: 34 }}>
        <h1 style={{ fontSize: 32, color: "#f0f4ff" }}>AI Governance Cost & Budget Visibility</h1>
        <p style={{ color: "#ffd700" }}>1 USD = {isLoading ? "..." : fxRate.toLocaleString()} VND (T? gi  Live API)</p>
      </header>
      <div style={{ borderRadius: 14, padding: "20px 22px", background: "rgba(18, 22, 40, 0.55)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
        <h3 style={{ color: "#e0e6ff" }}>T?ng ng n s ch c?p: ${budgetTotal.toLocaleString()}</h3>
        <h3 style={{ color: "#80e0a0" }}>   th?c chi: ${budgetUsed.toFixed(2)}</h3>
        <h3 style={{ color: remainingUsd < 500 ? "#ff9100" : "#e0e6ff" }}>H?n m?c c n l?i: ${remainingUsd.toFixed(2)}</h3>
        <div style={{ marginTop: 14 }}>
          <span style={{ color: "#8896b0" }}>T? l?  p l?c ti u th? ng n s ch: {pressurePct}%</span>
        </div>
      </div>
    </div>
  );
}
