"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkFeatureAccess, type FeatureAccess } from "./billing";
import { getStoredToken } from "./auth";

/**
 * FeatureGate — wraps UI behind a feature check.
 * If the feature is allowed, children render normally.
 * If not, shows an upgrade prompt (or custom fallback).
 */

type FeatureGateProps = {
  feature: string;
  children: React.ReactNode;
  /** Custom message when feature is blocked */
  fallback?: React.ReactNode;
  /** Show loading state while checking */
  loadingFallback?: React.ReactNode;
  /** Plan key required (e.g. "starter", "pro", "team") — used for the prompt */
  requiredPlan?: string;
  /** Feature label for the prompt message */
  featureLabel?: string;
};

export function FeatureGate({
  feature,
  children,
  fallback,
  loadingFallback,
  requiredPlan = "Starter",
  featureLabel,
}: FeatureGateProps) {
  const [access, setAccess] = useState<FeatureAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAccess(null);
      setLoading(false);
      return;
    }

    checkFeatureAccess(feature)
      .then((result) => {
        setAccess(result);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [feature]);

  if (loading) {
    return loadingFallback ? (
      <>{loadingFallback}</>
    ) : (
      <div style={{ padding: 12, color: "#9fb0ff", fontSize: 13 }}>
        Checking access...
      </div>
    );
  }

  if (error) {
    return <>{children}</>; // Pass through on error
  }

  // No token — show login prompt
  if (!access) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: "rgba(109,124,255,0.06)",
          border: "1px solid rgba(109,124,255,0.15)",
          textAlign: "center",
          color: "#c8d2ff",
          fontSize: 13,
        }}
      >
        <Link
          href="/login"
          style={{ color: "#6d7cff", fontWeight: 700, textDecoration: "underline" }}
        >
          Sign in
        </Link>{" "}
        to check {featureLabel ?? feature} access.
      </div>
    );
  }

  if (!access.allowed) {
    if (fallback) return <>{fallback}</>;
    return <UpgradePrompt feature={feature} reason={access.reason} requiredPlan={requiredPlan} />;
  }

  return <>{children}</>;
}

/**
 * UpgradePrompt — standard upgrade CTA card.
 * Shows why a feature is blocked and a button to upgrade.
 */

type UpgradePromptProps = {
  feature?: string;
  reason?: string | null;
  requiredPlan?: string;
  compact?: boolean;
};

export function UpgradePrompt({
  feature,
  reason,
  requiredPlan = "Starter",
  compact = false,
}: UpgradePromptProps) {
  const label = feature
    ? feature.replace(/^feature:/, "").replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim()
    : "This feature";

  if (compact) {
    return (
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(255,180,80,0.08)",
          border: "1px solid rgba(255,180,80,0.15)",
          fontSize: 12,
          color: "#ffb366",
        }}
      >
        {reason ?? `${label} requires ${requiredPlan} plan or higher.`}{" "}
        <Link
          href="/pricing"
          style={{ color: "#6d7cff", fontWeight: 600, textDecoration: "underline", whiteSpace: "nowrap" }}
        >
          Upgrade →
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 24,
        borderRadius: 18,
        background: "linear-gradient(135deg, rgba(109,124,255,0.08), rgba(255,180,80,0.05))",
        border: "1px solid rgba(109,124,255,0.2)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{label} unavailable</div>
      <div style={{ color: "#c8d2ff", fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
        {reason ?? `${label} requires the ${requiredPlan} plan or higher.`}
      </div>
      <Link
        href="/pricing"
        style={{
          display: "inline-block",
          padding: "12px 24px",
          borderRadius: 12,
          background: "#6d7cff",
          color: "white",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        Upgrade to {requiredPlan}
      </Link>
    </div>
  );
}

/**
 * useFeatureAccess — hook for programmatic feature gating.
 * Returns { allowed, reason, limit, current, loading }.
 */

export function useFeatureAccess(feature: string) {
  const [result, setResult] = useState<{
    access: FeatureAccess | null;
    loading: boolean;
  }>({ access: null, loading: true });

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setResult({ access: null, loading: false });
      return;
    }

    checkFeatureAccess(feature)
      .then((access) => setResult({ access, loading: false }))
      .catch(() => setResult({ access: null, loading: false }));
  }, [feature]);

  return {
    allowed: result.access?.allowed ?? false,
    reason: result.access?.reason ?? null,
    limit: result.access?.limit ?? null,
    current: result.access?.current ?? null,
    loading: result.loading,
  };
}
