"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const API = "https://api.aifut.net";

type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membership: {
    id: string;
    role: string;
    tenantId: string;
    userId: string;
  } | null;
};

export default function LoginPage() {
  const [email, setEmail] = useState("founder@aifut.net");
  const [password, setPassword] = useState("test123456");
  const [token, setToken] = useState("");
  const [me, setMe] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingMe, setCheckingMe] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("aifut_token");
    if (saved) {
      setToken(saved);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      setCheckingMe(true);
      setError("");

      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error(`auth/me failed (${res.status})`);
        }

        const data = await res.json();
        setMe(data);
      } catch (err) {
        setMe(null);
        setError(err instanceof Error ? err.message : "Failed to load auth/me");
      } finally {
        setCheckingMe(false);
      }
    };

    run();
  }, [token]);

  const status = useMemo(() => {
    if (loading) return "Logging in...";
    if (checkingMe) return "Loading current session...";
    if (me) return "Authenticated";
    return "Signed out";
  }, [loading, checkingMe, me]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMe(null);

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || `Login failed (${res.status})`);
      }

      window.localStorage.setItem("aifut_token", data.token);
      setToken(data.token);
      setMe(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("aifut_token");
    setToken("");
    setMe(null);
    setError("");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#09111f",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "48px 24px",
      }}
    >
      <section style={{ maxWidth: 860, margin: "0 auto" }}>
        <a
          href="/"
          style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}
        >
          ← Back to home
        </a>

        <h1 style={{ fontSize: 42, margin: "18px 0 10px" }}>AIFUT Login</h1>
        <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7 }}>
          Sign in against the live API auth flow. This page stores the JWT in
          localStorage and then resolves <code>/auth/me</code>.
        </p>

        <div
          style={{
            marginTop: 18,
            display: "inline-block",
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#9fb0ff",
            fontSize: 13,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Status: {status}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 420px) 1fr",
            gap: 20,
            marginTop: 28,
          }}
        >
          <div
            style={{
              padding: 20,
              borderRadius: 18,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "#9fb0ff",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 14,
              }}
            >
              Credentials
            </div>

            <form onSubmit={handleSubmit}>
              <label style={{ display: "block", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#9fb0ff", marginBottom: 6 }}>
                  Email
                </div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    color: "#f5f7ff",
                    outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#9fb0ff", marginBottom: 6 }}>
                  Password
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    color: "#f5f7ff",
                    outline: "none",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: "#6d7cff",
                    color: "white",
                    border: "none",
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    background: "transparent",
                    color: "#f5f7ff",
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear token
                </button>
              </div>
            </form>

            {error ? (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(255, 80, 80, 0.12)",
                  border: "1px solid rgba(255, 80, 80, 0.25)",
                  color: "#ffb3b3",
                  whiteSpace: "pre-wrap",
                }}
              >
                {error}
              </div>
            ) : null}
          </div>

          <div
            style={{
              padding: 20,
              borderRadius: 18,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "#9fb0ff",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 14,
              }}
            >
              Session
            </div>

            <Row label="API" value={API} />
            <Row label="Token present" value={token ? "Yes" : "No"} />
            <Row
              label="User"
              value={me?.user ? `${me.user.name || "N/A"} / ${me.user.email}` : "N/A"}
            />
            <Row
              label="Tenant"
              value={me?.tenant ? `${me.tenant.name} / ${me.tenant.slug}` : "N/A"}
            />
            <Row
              label="Role"
              value={me?.membership?.role ? me.membership.role : "N/A"}
            />

            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "#9fb0ff",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 10,
                }}
              >
                Raw response
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "#dfe6ff",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {JSON.stringify(me, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}
