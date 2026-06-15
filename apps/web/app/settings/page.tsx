"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { LocaleSwitcher } from "../../lib/locale-switcher";

type Profile = {
  email: string;
  name: string | null;
  tenantName: string;
  tenantSlug: string;
  role: string;
  createdAt: string;
};

export default function SettingsPage() {
  const token = getStoredToken();
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.user && data.tenant) {
            setProfile({
              email: data.user.email ?? "",
              name: data.user.name ?? null,
              tenantName: data.tenant.name ?? "",
              tenantSlug: data.tenant.slug ?? "",
              role: data.membership?.role ?? "",
              createdAt: data.tenant.createdAt ?? "",
            });
          }
        })
        .catch(() => {});
    }
  }, [token]);

  if (!token) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif", padding: 48, textAlign: "center" }}>
        <h2 style={{ fontSize: 22 }}>Please sign in to access settings</h2>
        <Link href="/login" style={{ color: "#6d7cff", marginTop: 16, display: "inline-block" }}>Go to Login</Link>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}>← Home</Link>
          <h1 style={{ fontSize: 28, margin: "12px 0 4px" }}>Settings</h1>
          <p style={{ color: "#c8d2ff", fontSize: 14, margin: 0 }}>Manage your account, language, and organization</p>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: 32 }}>
        {/* Account Section */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>👤 Account</h2>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>Email</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{profile?.email ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>Name</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{profile?.name ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>Role</div>
                <div style={{ fontSize: 15, fontWeight: 600, textTransform: "capitalize" }}>{profile?.role.toLowerCase() ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Organization Section */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>🏢 Organization</h2>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>Tenant Name</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{profile?.tenantName ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>Tenant Slug</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{profile?.tenantSlug ?? "—"}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <Link href="/billing" style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(109,124,255,0.1)", color: "#6d7cff", border: "1px solid rgba(109,124,255,0.3)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>Billing & Subscription</Link>
              <Link href="/api-keys" style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "#9fb0ff", border: "1px solid rgba(255,255,255,0.15)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>API Keys</Link>
            </div>
          </div>
        </div>

        {/* Language Section */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>🌐 Language & Region</h2>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 8 }}>Interface Language</div>
            <LocaleSwitcher />
            <p style={{ fontSize: 12, color: "#8899cc", marginTop: 12, lineHeight: 1.5 }}>
              Select your preferred language. Translations are provided by the community.
              Some areas may still display in English.
            </p>
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>🔗 Quick Links</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { href: "/analytics", label: "Analytics Dashboard", icon: "📊" },
              { href: "/marketplace", label: "Marketplace", icon: "🏪" },
              { href: "/templates", label: "Industry Templates", icon: "📝" },
              { href: "/foundation/awl-playground", label: "AWL Playground", icon: "🔬" },
              { href: "/developer", label: "Developer Portal", icon: "🔧" },
              { href: "/status", label: "Platform Status", icon: "❤️" },
              { href: "/search", label: "Search", icon: "🔍" },
            ].map((link) => (
              <Link key={link.href} href={link.href} style={{
                padding: "10px 16px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
                color: "#c8d2ff", fontSize: 13, fontWeight: 600,
              }}>
                {link.icon} {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
