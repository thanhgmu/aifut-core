"use client";

import { meterColor } from "../../lib/billing";
import type { UsageMeter } from "../../types/billing";

/** Responsive grid of usage meter cards (AI calls, storage, workflows, …). */
export function UsageMeterGrid({ meters }: { meters: UsageMeter[] }) {
  if (!meters.length) return null;

  return (
    <section>
      <h2 style={{ fontSize: 20, margin: "0 0 16px" }}>Usage this period</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 18,
        }}
      >
        {meters.map((meter) => (
          <UsageMeterCard key={meter.key} meter={meter} />
        ))}
      </div>
    </section>
  );
}

function UsageMeterCard({ meter }: { meter: UsageMeter }) {
  const isUnlimited = meter.limit < 0;
  const displayPercent = Math.min(Math.max(meter.percent, 0), 100);
  const color = meterColor(displayPercent);

  return (
    <div
      style={{
        padding: 22,
        borderRadius: 18,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 14 }}>{meter.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 6 }}>{meter.label}</span>
        </div>
        {meter.cost && <div style={{ fontSize: 12, color: "#c8d2ff" }}>{meter.cost}</div>}
      </div>

      <div style={{ fontSize: 32, fontWeight: 800 }}>
        {isUnlimited
          ? meter.used.toLocaleString()
          : `${meter.used.toLocaleString()} / ${meter.limit.toLocaleString()}`}
      </div>

      <div style={{ fontSize: 13, color: "#9fb0ff", marginTop: 4 }}>
        {isUnlimited ? `${meter.unit} used · unlimited` : `${meter.unit} used`}
      </div>

      {!isUnlimited && (
        <>
          <div
            style={{
              marginTop: 14,
              height: 6,
              borderRadius: 3,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${displayPercent}%`,
                background: color,
                borderRadius: 3,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color, textAlign: "right" }}>
            {displayPercent}% used
          </div>
        </>
      )}
    </div>
  );
}
