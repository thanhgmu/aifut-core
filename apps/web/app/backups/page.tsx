"use client";

import { useEffect, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";

type BackupJob = {
  id: string; status: string; backupTarget: string | null;
  totalSize: number | null; error: string | null;
  startedAt: string | null; completedAt: string | null; createdAt: string;
  triggeredBy: string | null;
};

type BackupSchedule = {
  id: string; key: string; name: string; description: string | null;
  cronExpression: string | null; backupMode: string; retentionDays: number;
  enabled: boolean; lastRunAt: string | null; lastStatus: string | null;
};

type Stats = { totalJobs: number; completed: number; failed: number; pending: number; totalSize: number };

export default function BackupsPage() {
  const token = getStoredToken();
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!token) { setLoading(false); return; }
      const me = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null);
      if (!me?.tenant?.id) { setLoading(false); return; }
      const tid = me.tenant.id;
      setTenantId(tid);

      const [schRes, jobRes] = await Promise.all([
        fetch(`${API_BASE}/backups/schedules`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/backups/jobs`).then(r => r.json()).catch(() => []),
      ]);
      setSchedules(Array.isArray(schRes) ? schRes : []);
      setJobs(Array.isArray(jobRes) ? jobRes : []);
      setLoading(false);
    };
    load();
  }, [token]);

  const stats: Stats = {
    totalJobs: jobs.length,
    completed: jobs.filter(j => j.status === "COMPLETED").length,
    failed: jobs.filter(j => j.status === "FAILED").length,
    pending: jobs.filter(j => ["PENDING", "RUNNING"].includes(j.status)).length,
    totalSize: jobs.reduce((a, b) => a + (b.totalSize ?? 0), 0),
  };

  if (!token) return <div style={{ padding: 48, textAlign: "center", color: "#9fb0ff" }}>Sign in to view backups</div>;

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Data Protection</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Backups</h1>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4 }}>Schedule and monitor data backups for your tenant</p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 32 }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalJobs}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Total Jobs</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>{stats.completed}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Completed</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f87171" }}>{stats.failed}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Failed</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{(stats.totalSize / 1024 / 1024).toFixed(1)} MB</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Total Data</div>
          </div>
        </div>

        {/* Schedules */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>📅 Backup Schedules</h2>
          {loading ? <div style={{ color: "#8899cc" }}>Loading...</div> : schedules.length === 0 ? (
            <div style={{ color: "#8899cc", fontSize: 13 }}>No backup schedules yet. Create one via the API or management dashboard.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {schedules.map((sch) => (
                <div key={sch.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 16px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{sch.name}</div>
                    <div style={{ fontSize: 12, color: "#8899cc" }}>
                      {sch.backupMode} · {sch.retentionDays}d retention · {sch.cronExpression || "Manual"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: sch.enabled ? "#4ade80" : "#f87171" }}>
                      {sch.enabled ? "✅ Active" : "⛔ Disabled"}
                    </span>
                    <span style={{ fontSize: 12, color: "#8899cc" }}>
                      {sch.lastRunAt ? `Last: ${new Date(sch.lastRunAt).toLocaleDateString("vi-VN")}` : "Never"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Jobs */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>🔄 Recent Backup Jobs</h2>
          {loading ? <div style={{ color: "#8899cc" }}>Loading...</div> : jobs.length === 0 ? (
            <div style={{ color: "#8899cc", fontSize: 13 }}>No backup jobs yet. Schedules will trigger automatically.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {jobs.slice(0, 20).map((job) => (
                <div key={job.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 16px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div>
                    <div style={{ fontSize: 13 }}>
                      {job.triggeredBy === "schedule" ? "⏰ Scheduled" : job.triggeredBy === "manual" ? "👤 Manual" : "🔧 API"}
                    </div>
                    <div style={{ fontSize: 12, color: "#8899cc" }}>
                      {new Date(job.createdAt).toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600,
                      color: job.status === "COMPLETED" ? "#4ade80"
                        : job.status === "FAILED" ? "#f87171"
                        : ["PENDING", "RUNNING"].includes(job.status) ? "#facc15" : "#8899cc",
                    }}>
                      {job.status === "COMPLETED" ? "✅ Completed"
                        : job.status === "FAILED" ? "❌ Failed"
                        : job.status === "RUNNING" ? "🔄 Running"
                        : "⏳ Pending"}
                    </div>
                    {job.totalSize && (
                      <div style={{ fontSize: 11, color: "#8899cc", marginTop: 2 }}>
                        {(job.totalSize / 1024 / 1024).toFixed(1)} MB
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
