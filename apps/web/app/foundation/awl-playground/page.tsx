"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────

type AwlTrigger = {
  kind: "schedule" | "webhook" | "event" | "manual";
  config?: Record<string, any>;
};

type AwlStep = {
  id: string;
  name: string;
  type: "action" | "send" | "condition" | "wait" | "transform" | "loop" | "subflow";
  config?: Record<string, any>;
  depends_on?: string[];
  retry?: { max?: number; delay?: number };
  timeout?: number;
};

type AwlDocument = {
  awl: string;
  workflow: string;
  name: string;
  description?: string;
  category?: string;
  industry?: string;
  version?: string;
  trigger?: AwlTrigger;
  steps: AwlStep[];
};

// ── Templates ──────────────────────────────────────────────────────────

const TEMPLATES: Record<string, AwlDocument> = {
  "order-confirm": {
    awl: "0.1",
    workflow: "order-confirm",
    name: "Xác nhận đơn hàng",
    description: "Gửi Zalo confirm → chờ 2h → kiểm tra trạng thái → gửi review",
    category: "order",
    industry: "retail",
    trigger: { kind: "event", config: { event: "order.created" } },
    steps: [
      { id: "send-zalo", name: "Gửi Zalo xác nhận", type: "send", config: { channel: "zalo", template: "order_confirm_vi" } },
      { id: "wait-2h", name: "Chờ 2 tiếng", type: "wait", config: { seconds: 7200 }, depends_on: ["send-zalo"] },
      { id: "check-delivery", name: "Kiểm tra đã giao chưa", type: "condition", config: { field: "order.status", equals: "delivered" }, depends_on: ["wait-2h"] },
      { id: "ask-review", name: "Yêu cầu đánh giá", type: "send", config: { channel: "zalo", template: "review_request_vi" }, depends_on: ["check-delivery"] },
    ],
  },
  "booking-reminder": {
    awl: "0.1",
    workflow: "booking-reminder",
    name: "Nhắc lịch hẹn Spa",
    description: "Xác nhận → nhắc 2h trước → feedback",
    category: "booking",
    industry: "beauty",
    trigger: { kind: "event", config: { event: "booking.created" } },
    steps: [
      { id: "confirm", name: "Gửi xác nhận", type: "send", config: { channel: "zalo", template: "booking_confirm_vi" } },
      { id: "wait-2h", name: "Chờ 2 tiếng", type: "wait", config: { seconds: 7200 }, depends_on: ["confirm"] },
      { id: "remind", name: "Nhắc lịch hẹn", type: "send", config: { channel: "zalo", template: "booking_remind_vi" } },
      { id: "feedback", name: "Gửi survey", type: "send", config: { channel: "email", template: "feedback_request" }, depends_on: ["remind"] },
    ],
  },
  "cron-report": {
    awl: "0.1",
    workflow: "weekly-report",
    name: "Báo cáo hàng tuần",
    description: "Gửi email báo cáo mỗi sáng thứ Hai",
    category: "report",
    industry: "services",
    trigger: { kind: "schedule", config: { cron: "0 8 * * 1" } },
    steps: [
      { id: "gather", name: "Thu thập dữ liệu", type: "action", config: { action: "query_weekly_stats" } },
      { id: "build", name: "Tạo báo cáo", type: "transform", config: { format: "html" }, depends_on: ["gather"] },
      { id: "send", name: "Gửi email", type: "send", config: { channel: "email", template: "weekly_report", to: "{{manager.email}}" }, depends_on: ["build"] },
    ],
  },
};

// ── Validation ─────────────────────────────────────────────────────────

type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  steps: number;
  nodeTypes: Record<string, number>;
};

function validateAwl(doc: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!doc || typeof doc !== "object") {
    return { valid: false, errors: ["Empty document"], warnings: [], steps: 0, nodeTypes: {} };
  }

  if (doc.awl !== "0.1") errors.push("Missing or invalid 'awl' version (expected '0.1')");
  if (!doc.workflow || typeof doc.workflow !== "string") errors.push("Missing 'workflow' (unique key)");
  if (!doc.name) errors.push("Missing 'name'");
  if (!doc.steps || !Array.isArray(doc.steps) || doc.steps.length === 0) errors.push("Missing or empty 'steps'");

  const stepIds = new Set<string>();
  const nodeTypes: Record<string, number> = {};

  for (const step of doc.steps || []) {
    if (!step.id || typeof step.id !== "string") errors.push("Step missing 'id'");
    else {
      if (stepIds.has(step.id)) errors.push(`Duplicate step id: ${step.id}`);
      stepIds.add(step.id);
    }

    if (!step.name) warnings.push(`Step ${step.id || "?"}: missing 'name'`);
    if (!step.type) errors.push(`Step ${step.id || "?"}: missing 'type'`);
    else {
      const validTypes = ["action", "send", "condition", "wait", "transform", "loop", "subflow"];
      if (!validTypes.includes(step.type)) errors.push(`Step ${step.id}: invalid type '${step.type}'`);
      nodeTypes[step.type] = (nodeTypes[step.type] || 0) + 1;
    }

    // Check depends_on references
    if (step.depends_on) {
      if (!Array.isArray(step.depends_on)) errors.push(`Step ${step.id}: 'depends_on' must be an array`);
      else {
        for (const dep of step.depends_on) {
          if (!stepIds.has(dep) && doc.steps.find((s: any) => s.id === dep) === undefined) {
            // Defer this check — might be forward reference
          }
        }
      }
    }
  }

  // Check depends_on references (post-collection)
  for (const step of doc.steps || []) {
    if (step.depends_on && Array.isArray(step.depends_on)) {
      for (const dep of step.depends_on) {
        if (!stepIds.has(dep)) {
          errors.push(`Step ${step.id}: depends_on '${dep}' not found`);
        }
      }
    }
  }

  // Check for orphan steps (no deps and first isn't trigger)
  if (doc.steps && doc.steps.length > 0) {
    const withDeps = new Set<string>();
    doc.steps.forEach((s: any) => (s.depends_on || []).forEach((d: string) => withDeps.add(d)));
    const orphans = doc.steps.filter((s: any) => !withDeps.has(s.id));
    if (orphans.length > 1) {
      // First orphan is the entry point (trigger), rest are unconnected
      for (let i = 1; i < orphans.length; i++) {
        warnings.push(`Step '${orphans[i].id}' has no incoming dependencies (orphan)`);
      }
    }
  }

  // Check trigger config
  if (doc.trigger) {
    const validKinds = ["schedule", "webhook", "event", "manual"];
    if (!validKinds.includes(doc.trigger.kind)) errors.push(`Invalid trigger kind: ${doc.trigger.kind}`);
    if (doc.trigger.kind === "schedule" && !doc.trigger.config?.cron) warnings.push("Schedule trigger has no cron expression");
    if (doc.trigger.kind === "event" && !doc.trigger.config?.event) warnings.push("Event trigger has no event type");
    if (doc.trigger.kind === "webhook" && !doc.trigger.config?.endpoint) warnings.push("Webhook trigger has no endpoint");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    steps: doc.steps?.length || 0,
    nodeTypes,
  };
}

// ── Visual Helpers ─────────────────────────────────────────────────────

const STEP_TYPE_ICONS: Record<string, string> = {
  action: "⚡",
  send: "📤",
  condition: "🔀",
  wait: "⏳",
  transform: "🔄",
  loop: "🔄",
  subflow: "🔗",
};

const TRIGGER_ICONS: Record<string, string> = {
  schedule: "🕐",
  webhook: "🔗",
  event: "📨",
  manual: "👆",
};

// ── Component ──────────────────────────────────────────────────────────

export default function AwlPlaygroundPage() {
  const [yamlInput, setYamlInput] = useState("");
  const [parsedDoc, setParsedDoc] = useState<AwlDocument | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Format a template as YAML-like string
  const formatAwl = useCallback((doc: AwlDocument): string => {
    const lines: string[] = [];
    lines.push(`awl: ${doc.awl}`);
    lines.push(`workflow: ${doc.workflow}`);
    lines.push(`name: ${doc.name}`);
    if (doc.description) lines.push(`description: ${doc.description}`);
    if (doc.category) lines.push(`category: ${doc.category}`);
    if (doc.industry) lines.push(`industry: ${doc.industry}`);
    if (doc.version) lines.push(`version: ${doc.version}`);
    if (doc.trigger) {
      lines.push("trigger:");
      lines.push(`  kind: ${doc.trigger.kind}`);
      if (doc.trigger.config && Object.keys(doc.trigger.config).length > 0) {
        lines.push("  config:");
        for (const [k, v] of Object.entries(doc.trigger.config)) {
          lines.push(`    ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
    lines.push("steps:");
    for (const step of doc.steps || []) {
      lines.push(`  - id: ${step.id}`);
      lines.push(`    name: ${step.name}`);
      lines.push(`    type: ${step.type}`);
      if (step.config && Object.keys(step.config).length > 0) {
        lines.push("    config:");
        for (const [k, v] of Object.entries(step.config)) {
          if (typeof v === "string") lines.push(`      ${k}: ${v}`);
          else lines.push(`      ${k}: ${JSON.stringify(v)}`);
        }
      }
      if (step.depends_on && step.depends_on.length > 0) {
        lines.push(`    depends_on: [${step.depends_on.join(", ")}]`);
      }
      if (step.retry) {
        lines.push(`    retry:`);
        if (step.retry.max) lines.push(`      max: ${step.retry.max}`);
        if (step.retry.delay) lines.push(`      delay: ${step.retry.delay}`);
      }
    }
    return lines.join("\n");
  }, []);

  // Load template
  const loadTemplate = useCallback(
    (key: string) => {
      const tpl = TEMPLATES[key];
      if (tpl) {
        setYamlInput(formatAwl(tpl));
        setActiveTemplate(key);
        parseAndValidate(formatAwl(tpl));
      }
    },
    [formatAwl],
  );

  // Load shared AWL from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("awl");
    if (encoded) {
      try {
        const decoded = decodeURIComponent(atob(encoded));
        if (decoded.trim()) {
          setYamlInput(decoded);
          parseAndValidate(decoded);
        }
      } catch {
        // Invalid share URL — ignore
      }
    }
  }, []);

  // Parse YAML-like text into AWL document
  const parseAndValidate = useCallback((text: string) => {
    if (!text.trim()) {
      setParsedDoc(null);
      setValidation(null);
      return;
    }

    try {
      // Simple YAML-like parser for AWL format
      const lines = text.split("\n");
      const doc: any = { steps: [] };
      let currentStep: any = null;
      let currentSection: string | null = null;
      let currentConfig: any = null;
      let currentRetry: any = null;
      let inSteps = false;
      let inTrigger = false;
      let inTriggerConfig = false;
      let inStepConfig = false;
      let inRetry = false;

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const indent = line.length - trimmed.length;

        // Steps list
        if (trimmed.startsWith("- id:")) {
          if (currentStep && currentStep.id) doc.steps.push(currentStep);
          currentStep = { id: trimmed.replace("- id:", "").trim() };
          currentConfig = null;
          currentRetry = null;
          inSteps = true;
          inStepConfig = false;
          inRetry = false;
          continue;
        }

        // Trigger section
        if (trimmed === "trigger:") {
          inTrigger = true;
          inTriggerConfig = false;
          inSteps = false;
          inStepConfig = false;
          doc.trigger = {};
          continue;
        }

        if (trimmed === "steps:" && !inSteps) {
          inSteps = true;
          inTrigger = false;
          inTriggerConfig = false;
          continue;
        }

        // Key-value pairs
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx > 0) {
          const key = trimmed.slice(0, colonIdx).trim();
          const value = trimmed.slice(colonIdx + 1).trim();

          if (inSteps && currentStep && indent >= 4) {
            // Step fields
            if (key === "depends_on") {
              currentStep[key] = value
                .replace(/^\[/, "")
                .replace(/\]$/, "")
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
            } else if (key === "retry") {
              // Next lines will be retry config
              inRetry = true;
              currentRetry = {};
            } else if (key === "config") {
              inStepConfig = true;
              currentConfig = {};
            } else if (value) {
              currentStep[key] = value;
            }
            if (key !== "config" && key !== "retry" && inStepConfig && currentConfig) {
              currentConfig[key] = parseValue(value);
            }
            if (inRetry && currentRetry && key !== "retry") {
              currentRetry[key] = parseValue(value);
            }
            continue;
          }

          if (inTrigger && indent === 2 && key) {
            if (key === "config") {
              inTriggerConfig = true;
              if (!doc.trigger.config) doc.trigger.config = {};
            } else if (value) {
              doc.trigger[key] = value;
            }
            continue;
          }

          if (inTriggerConfig && indent >= 4 && key) {
            if (!doc.trigger.config) doc.trigger.config = {};
            doc.trigger.config[key] = parseValue(value);
            continue;
          }

          if (inStepConfig && indent === 6 && key && currentConfig) {
            currentConfig[key] = parseValue(value);
            continue;
          }

          if (inRetry && indent === 6 && key && currentRetry) {
            currentRetry[key] = parseValue(value);
            continue;
          }

          // Top-level fields
          if (indent === 0 && value !== undefined) {
            doc[key] = value;
          }
        }
      }

      // Push last step
      if (currentStep && currentStep.id) {
        if (currentConfig) currentStep.config = currentConfig;
        if (currentRetry) currentStep.retry = currentRetry;
        doc.steps.push(currentStep);
      }

      // Assign config/retry to steps that have them from the parser
      // (the simple parser may miss some — let the validator catch errors)

      const result = validateAwl(doc);
      setValidation(result);
      if (result.valid) {
        setParsedDoc(doc as AwlDocument);
      } else {
        setParsedDoc(result.errors.length <= 3 ? (doc as AwlDocument) : null);
      }
    } catch {
      setValidation({ valid: false, errors: ["Parse error: invalid format"], warnings: [], steps: 0, nodeTypes: {} });
      setParsedDoc(null);
    }
  }, []);

  // Parse value from string
  function parseValue(v: string): any {
    if (v === "true") return true;
    if (v === "false") return false;
    if (!isNaN(Number(v)) && v.trim() !== "") return Number(v);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
    return v;
  }

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setYamlInput(text);
      parseAndValidate(text);
    },
    [parseAndValidate],
  );

  // Copy AWL to clipboard
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yamlInput).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }, [yamlInput]);

  // Build workflow graph edges from steps
  const graphEdges = useMemo(() => {
    if (!parsedDoc) return [];
    const edges: { from: string; to: string }[] = [];
    for (const step of parsedDoc.steps) {
      if (step.depends_on) {
        for (const dep of step.depends_on) {
          edges.push({ from: dep, to: step.id });
        }
      }
    }
    // Steps without deps connect from trigger
    const withDeps = new Set(edges.map((e) => e.to));
    for (const step of parsedDoc.steps) {
      if (!withDeps.has(step.id)) {
        edges.push({ from: "trigger", to: step.id });
      }
    }
    return edges;
  }, [parsedDoc]);

  const stepMap = useMemo(() => {
    if (!parsedDoc) return {};
    const map: Record<string, AwlStep> = {};
    for (const s of parsedDoc.steps) map[s.id] = s;
    return map;
  }, [parsedDoc]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1 }}>
            AIFUT Workflow Language
          </div>
          <h1 style={{ fontSize: 28, margin: "4px 0 0" }}>
            AWL Playground v{AWL_VERSION}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/foundation"
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", color: "#f5f7ff", textDecoration: "none", fontSize: 13 }}
          >
            ← Foundation
          </Link>
          <Link
            href="/templates"
            style={{ padding: "8px 16px", borderRadius: 8, background: "#6d7cff", color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}
          >
            Template Packs
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, minHeight: "calc(100vh - 80px)" }}>
        {/* Left: Editor */}
        <div style={{ padding: 24, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Template selector */}
          <div>
            <div style={{ fontSize: 13, color: "#9fb0ff", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Load example
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <button
                  key={key}
                  onClick={() => loadTemplate(key)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: activeTemplate === key ? "1px solid #6d7cff" : "1px solid rgba(255,255,255,0.1)",
                    background: activeTemplate === key ? "rgba(109,124,255,0.1)" : "transparent",
                    color: activeTemplate === key ? "#6d7cff" : "#c8d2ff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: activeTemplate === key ? 700 : 400,
                  }}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 0.5 }}>
                AWL Document
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => setYamlInput("")}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#c8d2ff", cursor: "pointer", fontSize: 11 }}
                >
                  Clear
                </button>
                <button
                  onClick={handleCopy}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(109,124,255,0.3)", background: "transparent", color: "#6d7cff", cursor: "pointer", fontSize: 11 }}
                >
                  {copySuccess ? "Copied!" : "Copy"}
                </button>
                {parsedDoc && (
                  <>
                    <button
                      onClick={() => {
                        const blob = new Blob([yamlInput], { type: 'text/yaml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${parsedDoc.workflow}.yaml`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(80,200,120,0.3)", background: "transparent", color: "#80e0a0", cursor: "pointer", fontSize: 11 }}
                    >
                      ⬇ Export
                    </button>
                    <button
                      onClick={() => {
                        const encoded = btoa(encodeURIComponent(yamlInput));
                        const url = `${window.location.origin}/foundation/awl-playground?awl=${encoded}`;
                        navigator.clipboard.writeText(url).then(() => {
                          setCopySuccess(true);
                          setTimeout(() => setCopySuccess(false), 2000);
                        });
                      }}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,180,80,0.3)", background: "transparent", color: "#ffb366", cursor: "pointer", fontSize: 11 }}
                >
                  🔗 Share
                </button>
              </>
            )}
              </div>
            </div>
            <textarea
              value={yamlInput}
              onChange={handleInputChange}
              placeholder={`# Write AWL here or load an example above\nawl: 0.1\nworkflow: my-workflow\nname: My Workflow\n\nsteps:\n  - id: step-1\n    name: Do something\n    type: action\n    config:\n      action: custom`}
              style={{
                flex: 1,
                width: "100%",
                minHeight: 300,
                padding: 16,
                borderRadius: 12,
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#e8eeff",
                fontFamily: "'Consolas', 'Courier New', monospace",
                fontSize: 13,
                lineHeight: 1.6,
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>

          {/* Validation results */}
          {validation && (
            <div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10 }}>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    background: validation.valid ? "rgba(80,200,120,0.12)" : "rgba(255,80,80,0.12)",
                    color: validation.valid ? "#80e0a0" : "#ff8080",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {validation.valid ? "✓ Valid" : "✗ Invalid"}
                </span>
                <span style={{ color: "#9fb0ff", fontSize: 13 }}>
                  {validation.steps} step{validation.steps !== 1 ? "s" : ""}
                </span>
                {validation.errors.length > 0 && (
                  <span style={{ color: "#ff8080", fontSize: 13 }}>
                    {validation.errors.length} error{validation.errors.length !== 1 ? "s" : ""}
                  </span>
                )}
                {validation.warnings.length > 0 && (
                  <span style={{ color: "#ffb366", fontSize: 13 }}>
                    {validation.warnings.length} warning{validation.warnings.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {validation.errors.length > 0 && (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                  {validation.errors.map((err, i) => (
                    <li key={i} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,80,80,0.08)", color: "#ffb3b3", fontSize: 12, border: "1px solid rgba(255,80,80,0.12)" }}>
                      ✗ {err}
                    </li>
                  ))}
                </ul>
              )}

              {validation.warnings.length > 0 && (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4, marginTop: validation.errors.length > 0 ? 6 : 0 }}>
                  {validation.warnings.map((warn, i) => (
                    <li key={i} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,180,80,0.08)", color: "#ffcc80", fontSize: 12, border: "1px solid rgba(255,180,80,0.12)" }}>
                      ⚠ {warn}
                    </li>
                  ))}
                </ul>
              )}

              {validation.valid && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {Object.entries(validation.nodeTypes).map(([type, count]) => (
                    <span key={type} style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(109,124,255,0.08)", color: "#9fb0ff", fontSize: 11 }}>
                      {STEP_TYPE_ICONS[type] || "📦"} {type}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Visual Preview */}
        <div style={{ padding: 24, background: "rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>
              Workflow Graph {parsedDoc ? `— ${parsedDoc.name}` : ""}
            </div>

            {!parsedDoc ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "#9fb0ff",
                  fontSize: 14,
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 16,
                  border: "1px dashed rgba(255,255,255,0.08)",
                  lineHeight: 1.8,
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 10 }}>📝</div>
                Write an AWL document on the left
                <br />
                or load an example to see the visual workflow graph.
              </div>
            ) : (
              <>
                {/* Workflow info */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    marginBottom: 16,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#9fb0ff", fontSize: 12 }}>Workflow</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{parsedDoc.workflow}</span>
                  </div>
                  {parsedDoc.industry && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#9fb0ff", fontSize: 12 }}>Industry</span>
                      <span style={{ fontSize: 14 }}>{parsedDoc.industry}</span>
                    </div>
                  )}
                  {parsedDoc.trigger && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#9fb0ff", fontSize: 12 }}>Trigger</span>
                      <span style={{ fontSize: 14 }}>
                        {TRIGGER_ICONS[parsedDoc.trigger.kind] || "🔌"} {parsedDoc.trigger.kind}
                      </span>
                    </div>
                  )}
                  {parsedDoc.description && (
                    <div style={{ color: "#c8d2ff", fontSize: 13, marginTop: 4 }}>
                      {parsedDoc.description}
                    </div>
                  )}
                </div>

                {/* Step nodes */}
                <div style={{ display: "grid", gap: 10 }}>
                  {/* Trigger node */}
                  {parsedDoc.trigger && (
                    <NodeCard
                      id={parsedDoc.trigger.kind}
                      name={parsedDoc.trigger.kind.charAt(0).toUpperCase() + parsedDoc.trigger.kind.slice(1)}
                      icon={TRIGGER_ICONS[parsedDoc.trigger.kind] || "🔌"}
                      type="trigger"
                      config={parsedDoc.trigger.config}
                    />
                  )}

                  {/* Edge connectors from trigger */}
                  {graphEdges
                    .filter((e) => e.from === "trigger")
                    .map((e) => (
                      <EdgeLine key={`edge-${e.from}-${e.to}`} from="Trigger" to={stepMap[e.to]?.name || e.to} />
                    ))}

                  {/* Step nodes */}
                  {parsedDoc.steps.map((step, idx) => (
                    <div key={step.id}>
                      <NodeCard
                        id={step.id}
                        name={step.name}
                        icon={STEP_TYPE_ICONS[step.type] || "📦"}
                        type={step.type}
                        config={step.config}
                        dependsOn={step.depends_on}
                        retry={step.retry}
                      />
                      {/* Outgoing edges */}
                      {graphEdges
                        .filter((e) => e.from === step.id)
                        .map((e) => (
                          <EdgeLine
                            key={`edge-${step.id}-${e.to}`}
                            from={step.name}
                            to={stepMap[e.to]?.name || e.to}
                          />
                        ))}
                    </div>
                  ))}
                </div>

                {/* Completion node */}
                {parsedDoc.steps.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 16px",
                      borderRadius: 8,
                      background: "rgba(80,200,120,0.08)",
                      border: "1px dashed rgba(80,200,120,0.2)",
                      color: "#80e0a0",
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    ✓ Workflow complete
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function NodeCard({
  id,
  name,
  icon,
  type,
  config,
  dependsOn,
  retry,
}: {
  id: string;
  name: string;
  icon: string;
  type: string;
  config?: Record<string, any>;
  dependsOn?: string[];
  retry?: { max?: number; delay?: number };
}) {
  const typeColors: Record<string, string> = {
    trigger: "#6d7cff",
    action: "#7c6dff",
    send: "#4da6ff",
    condition: "#ffb366",
    wait: "#66c4ff",
    transform: "#b366ff",
    loop: "#ff66b3",
    subflow: "#66ffb3",
  };

  const color = typeColors[type] || "#9fb0ff";

  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
            <div style={{ color: "#9fb0ff", fontSize: 11, marginTop: 2 }}>
              {id} · {type}
            </div>
          </div>
        </div>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            background: `${color}15`,
            color: color,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {type}
        </span>
      </div>

      {/* Config preview */}
      {config && Object.keys(config).length > 0 && (
        <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 12, lineHeight: 1.5 }}>
          {Object.entries(config)
            .slice(0, 3)
            .map(([k, v]) => (
              <span key={k} style={{ marginRight: 12 }}>
                <span style={{ color: "#9fb0ff" }}>{k}:</span> {String(v).slice(0, 30)}
              </span>
            ))}
        </div>
      )}

      {/* Depends on */}
      {dependsOn && dependsOn.length > 0 && (
        <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 11 }}>
          ⬆ after: {dependsOn.join(", ")}
        </div>
      )}

      {/* Retry */}
      {retry && (
        <div style={{ marginTop: 4, color: "#ffb366", fontSize: 11 }}>
          🔄 retry {retry.max || 3}x, delay {retry.delay || 1}s
        </div>
      )}
    </div>
  );
}

function EdgeLine({ from, to }: { from: string; to: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 0 4px 24px",
        color: "#9fb0ff",
        fontSize: 11,
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.15)" }}>└─</span>
      <span>{from}</span>
      <span style={{ color: "rgba(255,255,255,0.2)" }}>→</span>
      <span style={{ color: "#c8d2ff" }}>{to}</span>
    </div>
  );
}
