"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  AuthSession,
  fetchAuthMe,
  getStoredToken,
  clearStoredToken,
} from "../../lib/auth";
import {
  BillingSummary,
  fetchBillingSummary,
  subscribeToPlan,
  fetchPlans,
  Plan,
} from "../../lib/billing";

export default function BillingPage() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<AuthSession | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subscribeMsg, setSubscribeMsg] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = getStoredToken();
    setToken(saved);

    const load = async () => {
      setLoading(true);
      try {
        if (saved) {
          const meData = await fetchAuthMe(saved);
          setMe(meData);
        }

        const [billingSummary, allPlans] = await Promise.all([
          fetchBillingSummary(),
          fetchPlans(),
        ]);

        setSummary(billingSummary);
        setPlans(allPlans);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load billing data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleSubscribe = useCallback(
    async (planKey: string, trialDays = 0) => {
      setSubscribing(planKey);
      setSubscribeMsg(null);

      const result = await subscribeToPlan(planKey, trialDays);

      if (result.success) {
        setSubscribeMsg({ success: true, message: result.message ?? "Subscribed!" });
        // Refresh
        const newSummary = await fetchBillingSummary();
        setSummary(newSummary);
      } else {
        setSubscribeMsg({
          success: false,
          message: result.message ?? "Subscription failed",
        });
      }

      setSubscribing(null);
    },
    [],
  );

  const getPlanName = (key: string) => {
    return plans.find((p) => p.key === key)?.name ?? key;
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: "#9fb0ff",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              AIFUT Billing
            </div>
            <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>Usage & Plan</h1>
            <p style={{ color: "#c8d2ff", fontSize: 16 }}>
              Track your consumption and manage your subscription.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/pricing"
              style={{
                padding: "12px 18px",
                borderRadius: 12,
                background: "#6d7cff",
                color: "white",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Change Plan
            </Link>
            <Link
              href="/dashboard"
              style={{
                padding: "12px 18px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f5f7ff",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Dashboard
            </Link>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9fb0ff" }}>
            Loading billing data...
          </div>
        ) : error ? (
          <div
            style={{
              padding: 20,
              borderRadius: 16,
              background: "rgba(255,80,80,0.1)",
              border: "1px solid rgba(255,80,80,0.2)",
              color: "#ffb3b3",
            }}
          >
            {error}
            {!token && (
              <div style={{ marginTop: 12 }}>
                <Link
                  href="/login"
                  style={{ color: "#6d7cff", fontWeight: 700, textDecoration: "underline" }}
                >
                  Sign in to view billing
                </Link>
              </div>
            )}
          </div>
        ) : !summary ? (
          <div
            style={{
              padding: 40,
              borderRadius: 20,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              textAlign: "center",
              color: "#c8d2ff",
            }}
          >
            Billing data is not available. Seed the billing plans first:
            <br />
            <code style={{ fontSize: 12, color: "#9fb0ff", marginTop: 8, display: "block" }}>
              POST {API_BASE}/billing/seed-plans
            </code>
          </div>
        ) : (
          <>
            {/* Current plan banner */}
            <div
              style={{
                padding: 24,
                borderRadius: 20,
                background: "linear-gradient(135deg, rgba(109,124,255,0.1), rgba(109,124,255,0.03))",
                border: "1px solid rgba(109,124,255,0.2)",
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 28,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Current plan
                </div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.planName}</div>

                {summary.subscription?.trialEndsAt && (
                  <div style={{ marginTop: 8, color: "#ffb366", fontSize: 14 }}>
                    Trial ends: {new Date(summary.subscription.trialEndsAt).toLocaleDateString()}
                  </div>
                )}

                {summary.subscription?.expiresAt && summary.subscription.status === "active" && (
                  <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 14 }}>
                    Renews: {new Date(summary.subscription.expiresAt).toLocaleDateString()}
                    {summary.subscription.autoRenew ? " (auto-renew)" : ""}
                  </div>
                )}

                {summary.subscription?.status === "trialing" && (
                  <div style={{ marginTop: 4, color: "#9fb0ff", fontSize: 13 }}>
                    Trial period — upgrade to keep access
                  </div>
                )}
              </div>

              <Link
                href="/pricing"
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  background: "#6d7cff",
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {summary.planKey === "free" ? "Upgrade Plan" : "Change Plan"}
              </Link>
            </div>

            {/* Usage meters */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 18,
              }}
            >
              {/* AI calls meter */}
              <UsageMeterCard
                title="AI Calls"
                icon="🤖"
                used={summary.ai.callsUsed}
                limit={summary.ai.callsLimit}
                unit="calls"
                percent={summary.ai.callsPercent}
                cost={`$${summary.ai.cost.toFixed(4)}`}
                color={summary.ai.callsPercent > 80 ? "#ff6b6b" : summary.ai.callsPercent > 60 ? "#ffb366" : "#6d7cff"}
              />

              {/* Storage meter */}
              <UsageMeterCard
                title="Storage"
                icon="💾"
                used={summary.storage.usedGB}
                limit={summary.storage.limitGB}
                unit="GB"
                percent={summary.storage.percentFull}
                color={summary.storage.percentFull > 80 ? "#ff6b6b" : summary.storage.percentFull > 60 ? "#ffb366" : "#6d7cff"}
              />

              {/* Workflows count */}
              <UsageMeterCard
                title="Active Workflows"
                icon="⚡"
                used={summary.workflows.active}
                limit={summary.workflows.limit}
                unit="workflows"
                percent={
                  summary.workflows.limit > 0
                    ? Math.round((summary.workflows.active / summary.workflows.limit) * 100)
                    : summary.workflows.limit < 0
                      ? 0
                      : 100
                }
                color="#6d7cff"
              />
            </div>

            {/* Plan upgrade options */}
            {plans.length > 0 && summary.planKey !== "team" && (
              <section style={{ marginTop: 36 }}>
                <h2 style={{ fontSize: 24, marginBottom: 18 }}>Upgrade options</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 16,
                  }}
                >
                  {plans
                    .filter((p) => p.key !== summary.planKey && p.price > 0)
                    .slice(0, 3)
                    .map((plan) => {
                      const isDowngrade =
                        plans.indexOf(plan) <
                        plans.findIndex((p) => p.key === summary.planKey);

                      return (
                        <div
                          key={plan.key}
                          style={{
                            padding: 22,
                            borderRadius: 18,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div style={{ fontSize: 18, fontWeight: 800 }}>{plan.name}</div>
                          <div
                            style={{
                              fontSize: 28,
                              fontWeight: 800,
                              margin: "12px 0",
                            }}
                          >
                            {plan.price === 0
                              ? "Free"
                              : `${plan.price.toLocaleString()}₫`}
                            <span style={{ fontSize: 14, color: "#9fb0ff", fontWeight: 400 }}>
                              /month
                            </span>
                          </div>
                          <div style={{ color: "#c8d2ff", fontSize: 14, marginBottom: 16 }}>
                            {plan.aiCallsMonthly >= 1000
                              ? `${(plan.aiCallsMonthly / 1000).toFixed(0)}K AI calls/mo`
                              : `${plan.aiCallsMonthly} AI calls/mo`}
                            {plan.storageGB > 0 && ` • ${plan.storageGB}GB storage`}
                          </div>

                          <button
                            onClick={() =>
                              handleSubscribe(
                                plan.key,
                                plan.key === "starter" ? 14 : plan.key === "pro" ? 7 : 0,
                              )
                            }
                            disabled={subscribing === plan.key}
                            style={{
                              width: "100%",
                              padding: "12px",
                              borderRadius: 10,
                              border: "none",
                              background: "#6d7cff",
                              color: "white",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                          >
                            {subscribing === plan.key
                              ? "Processing..."
                              : isDowngrade
                                ? `Downgrade to ${plan.name}`
                                : `Upgrade to ${plan.name}`}
                          </button>
                        </div>
                      );
                    })}
                </div>

                {subscribeMsg && (
                  <div
                    style={{
                      marginTop: 18,
                      padding: 14,
                      borderRadius: 12,
                      background: subscribeMsg.success
                        ? "rgba(80,200,120,0.1)"
                        : "rgba(255,80,80,0.1)",
                      border: `1px solid ${subscribeMsg.success ? "rgba(80,200,120,0.2)" : "rgba(255,80,80,0.2)"}`,
                      color: subscribeMsg.success ? "#b3ffcc" : "#ffb3b3",
                    }}
                  >
                    {subscribeMsg.message}
                  </div>
                )}
              </section>
            )}

            {/* Quick links */}
            <section
              style={{
                marginTop: 36,
                padding: 22,
                borderRadius: 20,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: 13, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
                Billing resources
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <Link href="/pricing" style={{ color: "#6d7cff", textDecoration: "none", fontWeight: 600 }}>
                  → Compare all plans and pricing
                </Link>
                <Link href="/welcome" style={{ color: "#6d7cff", textDecoration: "none", fontWeight: 600 }}>
                  → Onboarding guide
                </Link>
                <Link
                  href={`${API_BASE}/billing/usage`}
                  style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}
                >
                  → Raw usage data (API)
                </Link>
                <Link
                  href={`${API_BASE}/billing/capabilities`}
                  style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}
                >
                  → Billing capabilities (API)
                </Link>
              </div>
            </section>
          </>
        )}

        {/* Footer */}
        <footer
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            color: "#9fb0ff",
            fontSize: 13,
          }}
        >
          <div>© 2026 AIFUT</div>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Home
            </Link>
            <Link href="/pricing" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Pricing
            </Link>
            <Link href="/dashboard" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Dashboard
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function UsageMeterCard({
  title,
  icon,
  used,
  limit,
  unit,
  percent,
  cost,
  color,
}: {
  title: string;
  icon: string;
  used: number;
  limit: number;
  unit: string;
  percent: number;
  cost?: string;
  color: string;
}) {
  const isUnlimited = limit < 0;
  const displayPercent = Math.min(percent, 100);

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
          <span style={{ fontSize: 14, color: "#9fb0ff" }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 6 }}>{title}</span>
        </div>
        {cost && (
          <div style={{ fontSize: 12, color: "#c8d2ff" }}>{cost}</div>
        )}
      </div>

      <div style={{ fontSize: 32, fontWeight: 800 }}>
        {isUnlimited ? used.toLocaleString() : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
      </div>

      <div style={{ fontSize: 13, color: "#9fb0ff", marginTop: 4 }}>
        {isUnlimited ? `${unit} used` : `${unit} used`}
      </div>

      {!isUnlimited && (
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
              width: `${Math.min(displayPercent, 100)}%`,
              background: color,
              borderRadius: 3,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}

      {!isUnlimited && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: displayPercent > 80 ? "#ff6b6b" : displayPercent > 60 ? "#ffb366" : "#9fb0ff",
            textAlign: "right",
          }}
        >
          {displayPercent}% used
        </div>
      )}
    </div>
  );
}
