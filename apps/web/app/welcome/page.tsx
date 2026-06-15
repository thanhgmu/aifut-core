"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, AuthSession, fetchAuthMe, getStoredToken } from "../../lib/auth";

type OnboardingStep = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  actionLabel: string;
  actionHref: string;
  skipLabel?: string;
  isComplete?: (me: AuthSession | null) => boolean | Promise<boolean>;
};

const STEPS: OnboardingStep[] = [
  {
    id: "workspace",
    title: "Create your first workspace",
    subtitle: "Organize your workflows, connectors, and team members in one place.",
    emoji: "🏗️",
    actionLabel: "Create workspace",
    actionHref: "/dashboard",
    skipLabel: "I'll do this later",
    isComplete: (me) => {
      // Check if workspace exists via API
      return false; // Default: not complete
    },
  },
  {
    id: "explore",
    title: "Explore industry templates",
    subtitle: "Start with a pre-built workflow template for your industry — spa, F&B, ecommerce, education, and more.",
    emoji: "📋",
    actionLabel: "Browse templates",
    actionHref: "/foundation/demo-live",
    skipLabel: "I'll build from scratch",
  },
  {
    id: "connect",
    title: "Connect your first app",
    subtitle: "Link your existing tools — social media, CRM, email, or custom APIs — as AIFUT connectors.",
    emoji: "🔗",
    actionLabel: "Add connector",
    actionHref: "/foundation/operator-preview",
    skipLabel: "Skip for now",
  },
  {
    id: "workflow",
    title: "Describe your first workflow in plain language",
    subtitle: "Tell AIFUT what you want to automate — like 'Send a booking confirmation via Zalo when a new order comes in' — and watch it build the workflow for you.",
    emoji: "🤖",
    actionLabel: "Create with AI",
    actionHref: "/foundation/demo",
    skipLabel: "I'll do this manually",
  },
  {
    id: "team",
    title: "Invite your team",
    subtitle: "Add team members and set permissions. Collaborate on workflows and connectors.",
    emoji: "👥",
    actionLabel: "Invite team",
    actionHref: "/session",
    skipLabel: "I work alone",
  },
  {
    id: "plan",
    title: "Choose your plan",
    subtitle: "Start free or pick a plan that fits. Upgrade anytime as you grow.",
    emoji: "⭐",
    actionLabel: "View plans",
    actionHref: "/pricing",
    skipLabel: "Free plan is fine",
  },
];

export default function WelcomePage() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<AuthSession | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = getStoredToken();
    setToken(saved);
    setLoading(false);
    if (saved) {
      fetchAuthMe(saved)
        .then(setMe)
        .catch(() => setMe(null));
    }
  }, []);

  const step = STEPS[currentStep];
  const isLast = currentStep >= STEPS.length - 1;
  const progressPercent = ((currentStep + 1) / STEPS.length) * 100;

  const handleComplete = useCallback(() => {
    if (!step || !step.id) return;
    const newCompleted = new Set(completed);
    newCompleted.add(step.id);
    setCompleted(newCompleted);

    if (!isLast) {
      setCurrentStep((c) => c + 1);
    }
  }, [completed, step, isLast]);

  const handleSkip = useCallback(() => {
    if (!isLast) {
      setCurrentStep((c) => c + 1);
    }
  }, [isLast]);

  const handleFinish = useCallback(() => {
    window.location.href = "/dashboard";
  }, []);

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0b1020",
          color: "#f5f7ff",
          fontFamily: "Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "#9fb0ff" }}>Loading...</div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at center, rgba(109,124,255,0.06), transparent 50%), #0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 580, width: "100%" }}>
        {/* Progress bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.1)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: "#6d7cff",
                borderRadius: 2,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div style={{ color: "#9fb0ff", fontSize: 13, whiteSpace: "nowrap" }}>
            {currentStep + 1} of {STEPS.length}
          </div>
        </div>

        {/* Step card */}
        <div
          style={{
            padding: 40,
            borderRadius: 24,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(109,124,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              marginBottom: 20,
            }}
          >
            {step.emoji}
          </div>

          <h1 style={{ fontSize: 28, margin: "0 0 10px" }}>{step.title}</h1>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "#c8d2ff", marginBottom: 32 }}>
            {step.subtitle}
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href={step.actionHref}
              onClick={(e) => {
                if (step.actionHref.startsWith("/")) {
                  // For internal links, we complete the step first
                  handleComplete();
                }
              }}
              style={{
                background: "#6d7cff",
                color: "white",
                padding: "14px 24px",
                borderRadius: 12,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 15,
                display: "inline-block",
              }}
            >
              {step.actionLabel} →
            </Link>

            {!isLast && step.skipLabel && (
              <button
                onClick={handleSkip}
                style={{
                  background: "transparent",
                  color: "#9fb0ff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "14px 24px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {step.skipLabel}
              </button>
            )}

            {isLast && (
              <button
                onClick={handleComplete}
                style={{
                  background: "transparent",
                  color: "#9fb0ff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "14px 24px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                I understand, let me start
              </button>
            )}
          </div>
        </div>

        {/* Step indicators */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginTop: 28,
          }}
        >
          {STEPS.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(idx)}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "none",
                background:
                  idx === currentStep
                    ? "#6d7cff"
                    : completed.has(s.id)
                      ? "rgba(109,124,255,0.4)"
                      : "rgba(255,255,255,0.15)",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        {/* Skip all link */}
        {!isLast && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button
              onClick={handleFinish}
              style={{
                background: "none",
                border: "none",
                color: "#9fb0ff",
                cursor: "pointer",
                fontSize: 13,
                textDecoration: "underline",
              }}
            >
              Skip all and go to dashboard →
            </button>
          </div>
        )}

        {/* Authentication prompt */}
        {!token && (
          <div
            style={{
              marginTop: 28,
              padding: 18,
              borderRadius: 16,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              textAlign: "center",
              color: "#9fb0ff",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            Sign in to save your progress and access the full platform.
            <br />
            <Link
              href="/login"
              style={{
                color: "#6d7cff",
                fontWeight: 700,
                textDecoration: "underline",
                marginTop: 6,
                display: "inline-block",
              }}
            >
              Sign in →
            </Link>
            <span style={{ margin: "0 8px" }}>or</span>
            <Link
              href="/register"
              style={{
                color: "#6d7cff",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              Create an account
            </Link>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            textAlign: "center",
            color: "#9fb0ff",
            fontSize: 12,
          }}
        >
          <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none", marginRight: 16 }}>
            Home
          </Link>
          <Link href="/dashboard" style={{ color: "#9fb0ff", textDecoration: "none", marginRight: 16 }}>
            Dashboard
          </Link>
          <Link href="/pricing" style={{ color: "#9fb0ff", textDecoration: "none" }}>
            Pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
