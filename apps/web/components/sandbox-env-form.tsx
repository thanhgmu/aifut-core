"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, getStoredToken } from "../lib/auth";

export type SandboxEnvFormProps = {
  envVars: Record<string, string>;
  onChange: (vars: Record<string, string>) => void;
  onLog: (line: string) => void;
};

type EnvEntry = { key: string; value: string; masked: boolean };
type SavedPreset = { id: string; name: string; variables: Record<string, string> };

const EMPTY_ENTRY: EnvEntry = { key: "", value: "", masked: true };

export function SandboxEnvForm({ envVars, onChange, onLog }: SandboxEnvFormProps) {
  const token = getStoredToken();
  const [entries, setEntries] = useState<EnvEntry[]>(() => {
    const keys = Object.keys(envVars || {});
    return keys.map((k) => ({ key: k, value: envVars[k] ?? "", masked: true }));
  });
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved presets on mount
  useEffect(() => {
    const loadPresets = async () => {
      if (!token) {
        setLoadingPresets(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/developer/sandbox/env-presets`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: SavedPreset[] = await res.json();
          setPresets(data);
        }
      } catch {
        // silent; presets are optional
      }
      setLoadingPresets(false);
    };
    loadPresets();
  }, [token]);

  // Sync entries -> parent onChange
  const syncToParent = useCallback(
    (updatedEntries: EnvEntry[]) => {
      const obj: Record<string, string> = {};
      for (const e of updatedEntries) {
        if (e.key.trim()) obj[e.key.trim()] = e.value;
      }
      onChange(obj);
    },
    [onChange],
  );

  const updateEntry = useCallback(
    (index: number, patch: Partial<EnvEntry>) => {
      setEntries((prev) => {
        const next = prev.map((e, i) => (i === index ? { ...e, ...patch } : e));
        syncToParent(next);
        return next;
      });
    },
    [syncToParent],
  );

  const addEntry = useCallback(() => {
    setEntries((prev) => {
      const next = [...prev, EMPTY_ENTRY];
      syncToParent(next);
      return next;
    });
    onLog("New environment variable row added.");
  }, [syncToParent, onLog]);

  const removeEntry = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const next = prev.filter((_, i) => i !== index);
        syncToParent(next);
        return next;
      });
      onLog(`Environment variable row ${index + 1} removed.`);
    },
    [syncToParent, onLog],
  );

  // Import from .env file
  const handleImportFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const lines = text.split("\n");
        const imported: EnvEntry[] = [];
        for (const raw of lines) {
          const trimmed = raw.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;
          const k = trimmed.slice(0, eqIdx).trim();
          let v = trimmed.slice(eqIdx + 1).trim();
          // Strip surrounding quotes
          if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
          ) {
            v = v.slice(1, -1);
          }
          imported.push({ key: k, value: v, masked: true });
        }
        if (imported.length === 0) {
          onLog("WARNING: No valid env vars found in the imported file.");
          return;
        }
        setEntries((prev) => {
          const merged = [...prev.filter((e) => e.key.trim()), ...imported];
          syncToParent(merged);
          return merged;
        });
        onLog(`Imported ${imported.length} env vars from ${file.name}`);
      };
      reader.readAsText(file);
      // Reset input so same file can be re-imported
      e.target.value = "";
    },
    [syncToParent, onLog],
  );

  // Save as preset
  const handleSavePreset = useCallback(async () => {
    if (!token || !presetName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: presetName.trim(),
        variables: envVars,
      };
      const res = await fetch(`${API_BASE}/developer/sandbox/env-presets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const saved: SavedPreset = await res.json();
      setPresets((prev) => [...prev, saved]);
      setActivePresetId(saved.id);
      onLog(`Environment preset "${presetName}" saved.`);
      setPresetName("");
    } catch (err: any) {
      onLog(`ERROR: Failed to save preset — ${err.message}`);
    }
    setSaving(false);
  }, [token, presetName, envVars, onLog]);

  // Load a saved preset
  const handleLoadPreset = useCallback(
    (preset: SavedPreset) => {
      const loaded = Object.entries(preset.variables).map(([k, v]) => ({
        key: k,
        value: v,
        masked: true,
      }));
      setEntries(loaded);
      setActivePresetId(preset.id);
      syncToParent(loaded);
      onLog(`Loaded preset "${preset.name}" (${loaded.length} vars).`);
    },
    [syncToParent, onLog],
  );

  // Delete preset
  const handleDeletePreset = useCallback(
    async (presetId: string, presetName: string) => {
      if (!token) return;
      try {
        const res = await fetch(
          `${API_BASE}/developer/sandbox/env-presets/${presetId}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        setPresets((prev) => prev.filter((p) => p.id !== presetId));
        if (activePresetId === presetId) setActivePresetId(null);
        onLog(`Deleted preset "${presetName}".`);
      } catch (err: any) {
        onLog(`ERROR: Failed to delete preset — ${err.message}`);
      }
    },
    [token, activePresetId, onLog],
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Saved Presets */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3
          style={{
            fontSize: 15,
            margin: "0 0 12px",
            color: "#c8d2ff",
          }}
        >
          📦 Saved Presets
        </h3>
        {loadingPresets ? (
          <div style={{ color: "#8899cc", fontSize: 13 }}>Loading...</div>
        ) : presets.length === 0 ? (
          <div style={{ color: "#8899cc", fontSize: 13 }}>
            No saved presets. Create env vars and save them below.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {presets.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background:
                    activePresetId === p.id
                      ? "rgba(109,124,255,0.08)"
                      : "rgba(255,255,255,0.02)",
                  border:
                    activePresetId === p.id
                      ? "1px solid rgba(109,124,255,0.3)"
                      : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ color: "#8899cc", fontSize: 12 }}>
                    {Object.keys(p.variables).length} variables
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handleLoadPreset(p)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: "1px solid #6d7cff",
                      background: "transparent",
                      color: "#6d7cff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDeletePreset(p.id, p.name)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(248,113,113,0.3)",
                      background: "transparent",
                      color: "#f87171",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variable Editor */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h3 style={{ fontSize: 15, margin: 0, color: "#c8d2ff" }}>
            🔐 Environment Variables
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleImportFile}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "#9fb0ff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📄 Import .env
            </button>
            <button
              onClick={addEntry}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid #6d7cff",
                background: "rgba(109,124,255,0.15)",
                color: "#6d7cff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add Variable
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".env,.env.*,text/plain"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {entries.length === 0 ? (
          <div style={{ color: "#8899cc", fontSize: 13, textAlign: "center", padding: 20 }}>
            No environment variables defined. Add one above or import a .env file.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {entries.map((entry, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <input
                  placeholder="KEY"
                  value={entry.key}
                  onChange={(e) => updateEntry(idx, { key: e.target.value })}
                  style={{
                    flex: "1 1 160px",
                    minWidth: 140,
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.3)",
                    color: "#f5f7ff",
                    fontSize: 13,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <div style={{ flex: "2 1 240px", display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type={entry.masked ? "password" : "text"}
                    placeholder="value"
                    value={entry.value}
                    onChange={(e) => updateEntry(idx, { value: e.target.value })}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.3)",
                      color: "#f5f7ff",
                      fontSize: 13,
                      fontFamily: "monospace",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => updateEntry(idx, { masked: !entry.masked })}
                    title={entry.masked ? "Reveal value" : "Mask value"}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "none",
                      background: "transparent",
                      color: "#8899cc",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    {entry.masked ? "👁️" : "🙈"}
                  </button>
                </div>
                <button
                  onClick={() => removeEntry(idx)}
                  title="Remove variable"
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "none",
                    background: "transparent",
                    color: "#f87171",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            color: "#8899cc",
            fontSize: 12,
          }}
        >
          {Object.keys(envVars).length} variable(s) configured
        </div>
      </div>

      {/* Save Preset */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3
          style={{
            fontSize: 15,
            margin: "0 0 12px",
            color: "#c8d2ff",
          }}
        >
          💾 Save Current Environment as Preset
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Preset name (e.g. dev, staging)"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            style={{
              flex: "1 1 200px",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.3)",
              color: "#f5f7ff",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            onClick={handleSavePreset}
            disabled={saving || !presetName.trim() || Object.keys(envVars).length === 0}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid #4ade80",
              background: saving
                ? "rgba(74,222,128,0.1)"
                : "rgba(74,222,128,0.15)",
              color: "#4ade80",
              fontWeight: 600,
              fontSize: 13,
              cursor:
                saving || !presetName.trim() || Object.keys(envVars).length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Preset"}
          </button>
        </div>
      </div>
    </div>
  );
}
