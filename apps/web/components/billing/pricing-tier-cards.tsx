"use client";

import type { PricingTier } from "../../types/billing";

interface PricingTierCardsProps {
  tiers: PricingTier[];
  pendingKey: string | null;
  onSubscribe: (planKey: string) => void;
}

/** Grid of selectable pricing tier cards with feature comparison + CTA. */
export function PricingTierCards({ tiers, pendingKey, onSubscribe }: PricingTierCardsProps) {
  if (!tiers.length) return null;

  return (
    <section>
      <h2 style={{ fontSize: 20, margin: "0 0 16px" }}>Plans &amp; pricing</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {tiers.map((tier) => (
          <TierCard
            key={tier.key}
            tier={tier}
            pending={pendingKey === tier.key}
            onSubscribe={onSubscribe}
          />
        ))}
      </div>
    </section>
  );
}

function TierCard({
  tier,
  pending,
  onSubscribe,
}: {
  tier: PricingTier;
  pending: boolean;
  onSubscribe: (planKey: string) => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: 22,
        borderRadius: 18,
        background: tier.highlighted ? "rgba(109,124,255,0.08)" : "rgba(255,255,255,0.04)",
        border: tier.highlighted
          ? "1px solid rgba(109,124,255,0.4)"
          : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {tier.highlighted && (
        <span
          style={{
            position: "absolute",
            top: -10,
            right: 16,
            padding: "3px 10px",
            borderRadius: 999,
            background: "#6d7cff",
            color: "white",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          Popular
        </span>
      )}

      <div style={{ fontSize: 18, fontWeight: 800 }}>{tier.name}</div>
      {tier.tagline && (
        <div style={{ color: "#9fb0ff", fontSize: 13, marginTop: 4 }}>{tier.tagline}</div>
      )}

      <div style={{ fontSize: 28, fontWeight: 800, margin: "12px 0" }}>
        {tier.priceDisplay}
        {tier.priceAmount > 0 && (
          <span style={{ fontSize: 14, color: "#9fb0ff", fontWeight: 400 }}>/{tier.interval}</span>
        )}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: 8 }}>
        {tier.features.map((feature, idx) => (
          <li
            key={idx}
            style={{
              fontSize: 13,
              color: feature.included ? "#c8d2ff" : "#5a6488",
              display: "flex",
              gap: 8,
            }}
          >
            <span style={{ color: feature.included ? "#80e0a0" : "#5a6488" }}>
              {feature.included ? "✓" : "—"}
            </span>
            {feature.label}
          </li>
        ))}
      </ul>

      <button
        onClick={() => !tier.current && onSubscribe(tier.key)}
        disabled={tier.current || pending}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 10,
          border: "none",
          background: tier.current ? "rgba(255,255,255,0.08)" : "#6d7cff",
          color: tier.current ? "#9fb0ff" : "white",
          fontWeight: 700,
          fontSize: 14,
          cursor: tier.current ? "default" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Processing…" : tier.ctaLabel}
      </button>
    </div>
  );
}
