"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";

type PriceDisplay = {
  amount: number;
  display: string;
};

type Plan = {
  key: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  maxUsers: number;
  maxWorkflows: number;
  aiCallsMonthly: number;
  storageGB: number;
  features: Record<string, boolean>;
  limits: Record<string, any> | null;
  isActive: boolean;
  priceDisplay?: string;
  prices?: Record<string, PriceDisplay>;
};

type PlanFeature = {
  label: string;
  getValue: (p: Plan) => string | boolean;
  highlight?: boolean;
};

const CURRENCIES = [
  { code: "VND", label: "VND (₫)", symbol: "₫" },
  { code: "USD", label: "USD ($)", symbol: "$" },
  { code: "THB", label: "THB (฿)", symbol: "฿" },
  { code: "SGD", label: "SGD (S$)", symbol: "S$" },
  { code: "MYR", label: "MYR (RM)", symbol: "RM" },
];

const PLAN_FEATURES: PlanFeature[] = [
  {
    label: "Users",
    getValue: (p) => (p.maxUsers === -1 ? "Unlimited" : String(p.maxUsers)),
  },
  {
    label: "Workflows",
    getValue: (p) => (p.maxWorkflows === -1 ? "Unlimited" : String(p.maxWorkflows)),
  },
  {
    label: "AI calls / month",
    getValue: (p) =>
      p.aiCallsMonthly === -1
        ? "Unlimited"
        : p.aiCallsMonthly >= 1000
          ? `${(p.aiCallsMonthly / 1000).toFixed(0)}K`
          : String(p.aiCallsMonthly),
  },
  {
    label: "Storage",
    getValue: (p) => `${p.storageGB} GB`,
  },
  {
    label: "Cloud backup",
    getValue: (p) => p.features?.cloudBackup ?? false,
  },
  {
    label: "Multi-device",
    getValue: (p) => p.features?.multiDevice ?? false,
  },
  {
    label: "Marketplace access",
    getValue: (p) => p.features?.marketplace ?? false,
  },
  {
    label: "API access",
    getValue: (p) => p.features?.api ?? false,
  },
  {
    label: "Analytics",
    getValue: (p) => p.features?.analytics ?? false,
  },
  {
    label: "Local-first",
    getValue: (p) => p.features?.localOnly ?? true,
  },
];

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "/month",
  YEARLY: "/year",
  ONE_TIME: "one-time",
};

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currency, setCurrency] = useState("VND");
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subscribeResult, setSubscribeResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const token = useMemo(() => getStoredToken(), []);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/billing/plans?currency=${currency}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          setPlans(data);
        }
      } catch (err) {
        console.error("Failed to load plans:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, [currency]);

  const handleSubscribe = useCallback(
    async (planKey: string) => {
      if (!token) {
        window.location.href = `/login?redirect=/pricing&plan=${planKey}`;
        return;
      }

      setSubscribing(planKey);
      setSubscribeResult(null);

      try {
        // Get tenant slug from auth/me
        const meRes = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const me = await meRes.json();
        const tenantSlug = me?.tenant?.slug;

        if (!tenantSlug) {
          setSubscribeResult({
            success: false,
            message: "No tenant found. Please complete registration first.",
          });
          return;
        }

        const plan = plans.find((p) => p.key === planKey);
        const trialDays = planKey === "starter" ? 14 : planKey === "pro" ? 7 : 0;

        // Free plan or paid plan with trial → subscribe directly (no payment yet)
        if (plan?.price === 0 || trialDays > 0) {
          const res = await fetch(`${API_BASE}/billing/subscribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-slug": tenantSlug,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ planKey, trialDays }),
          });

          const data = await res.json();

          if (res.ok) {
            setSubscribeResult({
              success: true,
              message: `Subscribed to ${plan?.name ?? planKey}!`,
            });
          } else {
            setSubscribeResult({
              success: false,
              message: data?.message ?? `Subscription failed (${res.status})`,
            });
          }
        } else {
          // Paid plan without trial → subscribe-and-pay → redirect to payment
          const res = await fetch(`${API_BASE}/billing/subscribe-and-pay`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-slug": tenantSlug,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              planKey,
              returnUrl: window.location.origin + "/payment",
            }),
          });

          const data = await res.json();

          if (res.ok && data.requiresPayment) {
            setSubscribeResult({
              success: true,
              message: `Invoice ${data.invoiceNumber ?? ""} created — ${data.amount?.toLocaleString("vi-VN") ?? ""}₫. Redirecting to payment...`,
            });
            // Redirect to payment page after a short delay
            setTimeout(() => {
              window.location.href = `/payment?payInvoice=${data.invoiceId}`;
            }, 1500);
          } else {
            setSubscribeResult({
              success: false,
              message: data?.message ?? `Subscription failed (${res.status})`,
            });
          }
        }
      } catch (err) {
        setSubscribeResult({
          success: false,
          message: err instanceof Error ? err.message : "Network error",
        });
      } finally {
        setSubscribing(null);
      }
    },
    [token, plans],
  );

  const popularPlan = "starter";
  const enterprisePlan = "team";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, rgba(109,124,255,0.08), transparent 30%), #0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: 1160,
          margin: "0 auto",
          padding: "20px 24px",
        }}
      >
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 20, color: "#f5f7ff", textDecoration: "none" }}>
            AIFUT
          </Link>
          <Link href="/foundation" style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}>
            Foundation
          </Link>
          <Link href="/pricing" style={{ color: "#f5f7ff", textDecoration: "none", fontSize: 14, fontWeight: 700 }}>
            Pricing
          </Link>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {token ? (
            <Link
              href="/dashboard"
              style={{
                background: "#6d7cff",
                color: "white",
                padding: "10px 18px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                style={{
                  color: "#f5f7ff",
                  textDecoration: "none",
                  fontSize: 14,
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                style={{
                  background: "#6d7cff",
                  color: "white",
                  padding: "10px 18px",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1160, margin: "0 auto", padding: "48px 24px 24px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 12px",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 999,
            fontSize: 12,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#9fb0ff",
            marginBottom: 16,
          }}
        >
          Pricing
        </div>

        <h1 style={{ fontSize: "clamp(36px, 6vw, 52px)", lineHeight: 1.1, margin: "0 0 14px" }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.7, color: "#c8d2ff", maxWidth: 640, margin: "0 auto" }}>
          Start free, scale as you grow. No hidden fees, no surprise bills. All plans include our AI-native operator control plane.
        </p>

        {/* Currency selector */}
        <div style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setCurrency(c.code)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: currency === c.code ? "1px solid #6d7cff" : "1px solid rgba(255,255,255,0.12)",
                background: currency === c.code ? "rgba(109,124,255,0.15)" : "transparent",
                color: currency === c.code ? "#f5f7ff" : "#9fb0ff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* Plans grid */}
      <section style={{ maxWidth: 1160, margin: "0 auto", padding: "32px 24px 80px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9fb0ff" }}>Loading plans...</div>
        ) : plans.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9fb0ff" }}>
            No plans available. The billing API may need seeding.
            <br />
            <code style={{ fontSize: 12, color: "#c8d2ff", marginTop: 8, display: "block" }}>
              POST {API_BASE}/billing/seed-plans
            </code>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, minmax(240px, 1fr))`,
              gap: 20,
              alignItems: "start",
            }}
          >
            {plans.map((plan) => {
              const isPopular = plan.key === popularPlan;
              const isEnterprise = plan.key === enterprisePlan;
              const priceDisplay = plan.prices?.[currency]?.display ?? `${plan.price}₫`;

              return (
                <div
                  key={plan.key}
                  style={{
                    borderRadius: 20,
                    background: isPopular
                      ? "linear-gradient(135deg, rgba(109,124,255,0.12), rgba(109,124,255,0.04))"
                      : "rgba(255,255,255,0.04)",
                    border: isPopular
                      ? "2px solid #6d7cff"
                      : "1px solid rgba(255,255,255,0.08)",
                    padding: 28,
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {isPopular && (
                    <div
                      style={{
                        position: "absolute",
                        top: -12,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "#6d7cff",
                        color: "white",
                        padding: "4px 14px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      Most popular
                    </div>
                  )}

                  {isEnterprise && (
                    <div
                      style={{
                        position: "absolute",
                        top: -12,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "#f5f7ff",
                        color: "#0b1020",
                        padding: "4px 14px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      Enterprise
                    </div>
                  )}

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{plan.name}</div>
                    {plan.description && (
                      <div style={{ marginTop: 6, color: "#c8d2ff", fontSize: 14, lineHeight: 1.6 }}>
                        {plan.description}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 40, fontWeight: 800 }}>
                      {plan.price === 0 ? (
                        "Free"
                      ) : (
                        <>
                          {priceDisplay}
                        </>
                      )}
                    </div>
                    {plan.price > 0 && (
                      <div style={{ color: "#9fb0ff", fontSize: 14, marginTop: 4 }}>
                        {INTERVAL_LABELS[plan.interval] ?? "/month"}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleSubscribe(plan.key)}
                    disabled={subscribing === plan.key}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: 12,
                      border: "none",
                      background:
                        plan.price === 0
                          ? "rgba(255,255,255,0.1)"
                          : "#6d7cff",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: "pointer",
                      marginBottom: 24,
                    }}
                  >
                    {subscribing === plan.key
                      ? "Processing..."
                      : plan.price === 0
                        ? "Get Started Free"
                        : `Subscribe to ${plan.name}`}
                  </button>

                  <div style={{ display: "grid", gap: 12 }}>
                    {PLAN_FEATURES.map((feature) => {
                      const value = feature.getValue(plan);
                      const isBool = typeof value === "boolean";
                      return (
                        <div
                          key={feature.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            fontSize: 14,
                            color: isBool && value ? "#6d7cff" : "#c8d2ff",
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              textAlign: "center",
                              fontWeight: isBool ? 800 : 400,
                            }}
                          >
                            {isBool ? (value ? "✓" : "—") : "•"}
                          </span>
                          <span>
                            {feature.label}
                            {!isBool && value ? `: ${value}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Subscribe result */}
        {subscribeResult && (
          <div
            style={{
              marginTop: 28,
              padding: 16,
              borderRadius: 14,
              background: subscribeResult.success
                ? "rgba(80, 200, 120, 0.12)"
                : "rgba(255, 80, 80, 0.12)",
              border: `1px solid ${subscribeResult.success ? "rgba(80,200,120,0.25)" : "rgba(255,80,80,0.25)"}`,
              color: subscribeResult.success ? "#b3ffcc" : "#ffb3b3",
              textAlign: "center",
              maxWidth: 600,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {subscribeResult.message}
            {subscribeResult.success && (
              <div style={{ marginTop: 10 }}>
                <Link
                  href="/dashboard"
                  style={{
                    color: "#6d7cff",
                    fontWeight: 700,
                    textDecoration: "underline",
                  }}
                >
                  Go to Dashboard →
                </Link>
                <Link
                  href="/payment"
                  style={{
                    color: "#80e0a0",
                    fontWeight: 700,
                    textDecoration: "underline",
                    marginLeft: 16,
                  }}
                >
                  Payment History →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Feature comparison table */}
        {plans.length > 0 && (
          <section style={{ marginTop: 64 }}>
            <h2 style={{ fontSize: 28, textAlign: "center", marginBottom: 28 }}>
              Compare all features
            </h2>

            <div
              style={{
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              {PLAN_FEATURES.map((feature, idx) => (
                <div
                  key={feature.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`,
                    gap: 0,
                    borderBottom:
                      idx < PLAN_FEATURES.length - 1
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "none",
                    fontSize: 14,
                  }}
                >
                  <div
                    style={{
                      padding: "14px 18px",
                      color: "#9fb0ff",
                      fontWeight: 600,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {feature.label}
                  </div>
                  {plans.map((plan) => {
                    const value = feature.getValue(plan);
                    const isBool = typeof value === "boolean";
                    return (
                      <div
                        key={plan.key}
                        style={{
                          padding: "14px 12px",
                          textAlign: "center",
                          color: isBool && value ? "#6d7cff" : "#c8d2ff",
                          fontWeight: isBool && value ? 700 : 400,
                          fontSize: isBool && value ? 16 : 14,
                        }}
                      >
                        {isBool ? (value ? "✓" : "—") : value}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section style={{ marginTop: 64, maxWidth: 700, marginLeft: "auto", marginRight: "auto" }}>
          <h2 style={{ fontSize: 28, textAlign: "center", marginBottom: 28 }}>
            Frequently asked questions
          </h2>

          <div style={{ display: "grid", gap: 16 }}>
            {[
              {
                q: "Can I switch plans later?",
                a: "Yes. You can upgrade or downgrade at any time. Changes take effect immediately, and billing is prorated.",
              },
              {
                q: "Is there a free trial for paid plans?",
                a: "The Starter plan includes a 14-day free trial. The Pro plan includes a 7-day trial. No credit card required.",
              },
              {
                q: "What happens when I hit usage limits?",
                a: "You'll receive notifications before reaching limits. For AI calls, you can purchase additional top-ups or upgrade your plan.",
              },
              {
                q: "Can I self-host AIFUT?",
                a: "Yes. AIFUT is local-first by design. Our Free plan runs entirely on your infrastructure. Paid plans add cloud sync and backup.",
              },
              {
                q: "Do you offer discounts for non-profits or startups?",
                a: "We do. Contact us for special pricing for early-stage startups and qualifying non-profit organizations.",
              },
            ].map((faq) => (
              <div
                key={faq.q}
                style={{
                  padding: 20,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 16 }}>{faq.q}</div>
                <div style={{ color: "#c8d2ff", fontSize: 14, lineHeight: 1.7 }}>{faq.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section
          style={{
            marginTop: 72,
            textAlign: "center",
            padding: "40px",
            borderRadius: 24,
            background: "rgba(109,124,255,0.06)",
            border: "1px solid rgba(109,124,255,0.15)",
          }}
        >
          <h2 style={{ fontSize: 32, marginBottom: 12 }}>
            Ready to simplify your operator stack?
          </h2>
          <p style={{ color: "#c8d2ff", fontSize: 18, marginBottom: 24 }}>
            Start free, no credit card needed. Full access to all core features.
          </p>
          <Link
            href={token ? "/dashboard" : "/register"}
            style={{
              background: "#6d7cff",
              color: "white",
              padding: "16px 32px",
              borderRadius: 14,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 17,
              display: "inline-block",
            }}
          >
            {token ? "Go to Dashboard" : "Get Started Free"}
          </Link>
        </section>

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
          <div>© 2026 AIFUT. AI-native operating system for lean operators.</div>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/foundation" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Foundation
            </Link>
            <Link href="/pricing" style={{ color: "#9fb0ff", textDecoration: "none" }}>
              Pricing
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
