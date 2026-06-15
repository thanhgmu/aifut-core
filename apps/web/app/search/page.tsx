"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";

type SearchResult = {
  type: string;
  title: string;
  description: string;
  url: string;
  category: string;
};

const TYPE_ICONS: Record<string, string> = {
  template: "📋",
  pack: "📦",
  api: "📡",
  guide: "📖",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSuggestions([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), limit: "50" });
      if (filterType) params.set("type", filterType);
      const [res, sugRes] = await Promise.all([
        fetch(`${API_BASE}/search?${params}`).then((r) => r.json()),
        fetch(`${API_BASE}/search/suggest?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()),
      ]);
      setResults(res.results || []);
      setTotal(res.total || 0);
      setSuggestions(sugRes.suggestions || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 200);
  }, [doSearch]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif", padding: "40px 24px 80px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>AIFUT Search</div>
          <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>Search Templates & Docs</h1>
          <p style={{ color: "#c8d2ff", fontSize: 16 }}>Find the right template, workflow, or developer resource.</p>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: 24 }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search templates, industries, APIs..."
            autoFocus
            style={{
              width: "100%",
              padding: "16px 20px",
              borderRadius: 14,
              border: "1px solid rgba(109,124,255,0.2)",
              background: "rgba(0,0,0,0.3)",
              color: "#f5f7ff",
              fontSize: 16,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {suggestions.length > 0 && query && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a2040", border: "1px solid rgba(109,124,255,0.15)", borderRadius: "0 0 12px 12px", zIndex: 10 }}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => { setQuery(s); doSearch(s); }} style={{ display: "block", width: "100%", padding: "10px 20px", border: "none", background: "transparent", color: "#c8d2ff", cursor: "pointer", fontSize: 14, textAlign: "left" }}>
                  🔍 {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["", "template", "pack"].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={{
              padding: "6px 14px", borderRadius: 8,
              border: filterType === type ? "1px solid #6d7cff" : "1px solid rgba(255,255,255,0.1)",
              background: filterType === type ? "rgba(109,124,255,0.1)" : "transparent",
              color: filterType === type ? "#6d7cff" : "#c8d2ff",
              fontWeight: filterType === type ? 700 : 400,
              cursor: "pointer", fontSize: 13,
            }}>
              {type === "" ? "📋 All" : type === "template" ? "📋 Templates" : "📦 Packs"}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#9fb0ff" }}>Searching...</div>
        )}
        {!loading && query && results.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "#9fb0ff" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>No results found</div>
            <div style={{ marginTop: 8, fontSize: 14 }}>Try a different search term or browse templates.</div>
          </div>
        )}
        {!loading && results.length > 0 && (
          <>
            <div style={{ color: "#9fb0ff", fontSize: 13, marginBottom: 12 }}>{total} results for &ldquo;{query}&rdquo;</div>
            <div style={{ display: "grid", gap: 10 }}>
              {results.map((r, i) => (
                <Link key={`${r.url}-${i}`} href={r.url} style={{
                  padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  textDecoration: "none", color: "inherit", display: "flex", gap: 14, alignItems: "flex-start",
                }}>
                  <span style={{ fontSize: 20 }}>{TYPE_ICONS[r.type] || "📄"}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#f5f7ff" }}>{r.title}</div>
                    <div style={{ color: "#c8d2ff", fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>{r.description}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(109,124,255,0.1)", color: "#9fb0ff", fontSize: 11, textTransform: "capitalize" }}>{r.type}</span>
                      {r.category && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#9fb0ff", fontSize: 11 }}>{r.category}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
        {!query && (
          <div style={{ textAlign: "center", padding: 80, color: "#9fb0ff" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 16 }}>Type to search across 50+ templates and 8 template packs.</div>
            <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {["restaurant", "spa", "healthcare", "fitness", "hotel", "ecommerce", "logistics"].map((tag) => (
                <button key={tag} onClick={() => { setQuery(tag); doSearch(tag); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#c8d2ff", cursor: "pointer", fontSize: 13 }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{ marginTop: 60, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, color: "#9fb0ff", fontSize: 13 }}>
          <div>© 2026 AIFUT — Search</div>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>Home</Link>
            <Link href="/templates" style={{ color: "#9fb0ff", textDecoration: "none" }}>Templates</Link>
            <Link href="/foundation" style={{ color: "#9fb0ff", textDecoration: "none" }}>Foundation</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
