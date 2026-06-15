import Link from "next/link";

export default function ErrorPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at center, rgba(248,113,113,0.12), transparent 40%), #0b1020",
      color: "#f5f7ff",
      fontFamily: "Arial, sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ textAlign: "center", maxWidth: 500 }}>
        <div style={{ fontSize: 80, fontWeight: 800, color: "#f87171", marginBottom: 8 }}>500</div>
        <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong</h1>
        <p style={{ color: "#c8d2ff", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          An unexpected error occurred. Our team has been notified.
          Please try again or return to the home page.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/" style={{
            padding: "12px 28px", borderRadius: 10, background: "#6d7cff", color: "white",
            textDecoration: "none", fontWeight: 700, fontSize: 14,
          }}>
            ← Back to Home
          </Link>
          <Link href="/dashboard" style={{
            padding: "12px 28px", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "#f5f7ff",
            textDecoration: "none", fontWeight: 600, fontSize: 14,
          }}>
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
