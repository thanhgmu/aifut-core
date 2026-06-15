"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";

type ApiKey = {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<{ key: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const loadKeys = useCallback(async () => {
    const token = getStoredToken();
    if (!token) { setLoading(false); return; }
    try {
      const meRes = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!meRes.ok) return;
      const meData = await meRes.json();
      setMe(meData);
      const keysRes = await fetch(`${API_BASE}/api-keys/${meData.tenant.id}/${meData.user.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (keysRes.ok) setKeys(await keysRes.json());
    } catch { setError("Failed to load API keys"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleGenerate = useCallback(async () => {
    if (!newKeyName.trim() || !me) return;
    setGenerating(true);
    setNewKeyResult(null);
    const token = getStoredToken();
    try {
      const res = await fetch(`${API_BASE}/api-keys/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId: me.tenant.id, userId: me.user.id, name: newKeyName.trim(), scopes: ["read", "write"], expiresInDays: 365 }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKeyResult(data);
        setNewKeyName("");
        await loadKeys();
      } else { setError("Failed to generate key"); }
    } catch { setError("Network error"); }
    finally { setGenerating(false); }
  }, [newKeyName, me, loadKeys]);

  const handleRevoke = useCallback(async (keyId: string) => {
    const token = getStoredToken();
    try {
      await fetch(`${API_BASE}/api-keys/${keyId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "x-tenant-id": me?.tenant?.id || "" } });
      await loadKeys();
    } catch { /* ignore */ }
  }, [me, loadKeys]);

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif", padding: "40px 24px 80px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Developer</div>
          <h1 style={{ fontSize: 32, margin: "8px 0 4px" }}>API Keys</h1>
          <p style={{ color: "#c8d2ff", fontSize: 15 }}>Manage API keys for programmatic access to the AIFUT platform.</p>
        </div>

        {/* Generate new key */}
        <div style={{ padding: 24, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, marginBottom: 14 }}>Generate New Key</h2>
          {newKeyResult ? (
            <div>
              <div style={{ padding: 16, borderRadius: 12, background: "rgba(80,200,120,0.1)", border: "1px solid rgba(80,200,120,0.2)", marginBottom: 14 }}>
                <div style={{ color: "#80e0a0", fontWeight: 700, marginBottom: 8 }}>✅ Key created — copy it now!</div>
                <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.3)", borderRadius: 8, fontFamily: "monospace", fontSize: 13, color: "#ffb366", wordBreak: "break-all", userSelect: "all" }}>{newKeyResult.key}</div>
                <div style={{ color: "#ffb366", fontSize: 12, marginTop: 6 }}>⚠️ This will not be shown again.</div>
              </div>
              <button onClick={() => setNewKeyResult(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#c8d2ff", cursor: "pointer", fontSize: 13 }}>Done</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Production API, CI/CD Pipeline" style={{
                flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#f5f7ff", fontSize: 14, outline: "none",
              }} />
              <button onClick={handleGenerate} disabled={generating || !newKeyName.trim()} style={{
                padding: "10px 24px", borderRadius: 10, border: "none", background: generating ? "#4a56b3" : "#6d7cff", color: "white", fontWeight: 700, fontSize: 14, cursor: generating ? "not-allowed" : "pointer",
              }}>
                {generating ? "Generating..." : "Generate Key"}
              </button>
            </div>
          )}
        </div>

        {/* Existing keys */}
        <div style={{ padding: 24, borderRadius: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ fontSize: 18, marginBottom: 14 }}>Your API Keys ({keys.length})</h2>
          {loading ? (
            <div style={{ color: "#9fb0ff", textAlign: "center", padding: 20 }}>Loading...</div>
          ) : keys.length === 0 ? (
            <div style={{ color: "#9fb0ff", textAlign: "center", padding: 20, lineHeight: 1.6 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
              No API keys yet. Generate one above to get started.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {keys.map((key) => (
                <div key={key.id} style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{key.name}</div>
                      <div style={{ color: "#9fb0ff", fontSize: 13, fontFamily: "monospace", marginTop: 4 }}>{key.keyPrefix}...</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        {key.scopes.map((s) => <span key={s} style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(109,124,255,0.1)", color: "#9fb0ff", fontSize: 11 }}>{s}</span>)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#c8d2ff", fontSize: 12 }}>Created {new Date(key.createdAt).toLocaleDateString()}</div>
                      {key.lastUsedAt && <div style={{ color: "#9fb0ff", fontSize: 12 }}>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</div>}
                      <button onClick={() => handleRevoke(key.id)} style={{ marginTop: 8, padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(255,80,80,0.3)", background: "transparent", color: "#ff8080", cursor: "pointer", fontSize: 11 }}>
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, color: "#9fb0ff", fontSize: 13 }}>
          <div>© 2026 AIFUT — API Keys</div>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>Home</Link>
            <Link href="/developer" style={{ color: "#9fb0ff", textDecoration: "none" }}>Developer Portal</Link>
            <Link href="/foundation" style={{ color: "#9fb0ff", textDecoration: "none" }}>Foundation</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
