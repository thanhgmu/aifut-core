"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ─── AWL BRACE SYNTAX — TYPES ───────────────────────────── */
interface AwlBraceNode {
  type: "trigger" | "execute" | "condition" | "loop" | "wait" | "transform" | "subflow" | "output" | "log" | "send";
  value: string;
  params?: Record<string, string>;
}

interface AwlBraceDocument {
  workflowName: string;
  nodes: AwlBraceNode[];
  raw: string;
}

/* ─── EXAMPLE ───────────────────────────────────────────── */
const DEFAULT_CODE = `// AWL — AIFUT Workflow Language (Brace Syntax)
// Define automation workflows in plain text

workflow "AutoNotify" {
  trigger: on_payment_success;
  execute: send_zalo_zns;
}

workflow "OrderPipeline" {
  trigger: webhook "/order/created";
  condition: order.total >= 500000 -> "premium";
  send: zalo_zns "{{customer.phone}}";
  wait: 7200s;
  condition: order.delivered == true;
  send: zalo_zns "review_request";
  log: "pipeline complete";
}

workflow "DailyReport" {
  trigger: cron "0 8 * * 1-5";
  execute: query_weekly_stats;
  transform: format "html";
  send: email "{{manager.email}}";
}`;

/* ─── BRACE PARSER ──────────────────────────────────────── */

/**
 * Parse AWL brace-syntax into structured AST nodes.
 * Supports: workflow, trigger, execute, send, condition, wait,
 *           transform, loop, subflow, log, output.
 */
function parseAwlBrace(raw: string): {
  workflowName: string;
  nodes: AwlBraceNode[];
  success: boolean;
  error?: string;
  line?: number;
} {
  const lines = raw.split("\n");
  let workflowName = "";
  const nodes: AwlBraceNode[] = [];
  let inWorkflow = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i];
    const stripped = lineRaw.replace(/\/\/.*$/, "").trim();
    if (!stripped) continue;

    // Detect workflow declaration
    const wfMatch = stripped.match(/^workflow\s+"([^"]+)"\s*\{$/);
    if (wfMatch) {
      if (inWorkflow) {
        return {
          workflowName,
          nodes: [],
          success: false,
          error: `Nested workflow not allowed`,
          line: i + 1,
        };
      }
      workflowName = wfMatch[1];
      inWorkflow = true;
      braceDepth = 1;
      continue;
    }

    // Closing brace
    if (stripped === "}") {
      braceDepth--;
      if (braceDepth <= 0 && inWorkflow) {
        inWorkflow = false;
      }
      continue;
    }

    // Opening brace inside
    if (stripped.includes("{") && !stripped.startsWith("workflow")) {
      braceDepth++;
    }

    if (!inWorkflow) continue;

    // Parse semicolon-terminated statements
    if (!stripped.endsWith(";")) {
      return {
        workflowName,
        nodes: [],
        success: false,
        error: `Missing semicolon at end of statement`,
        line: i + 1,
      };
    }

    const stmt = stripped.replace(/;\s*$/, "").trim();

    // trigger: type [config];
    const triggerMatch = stmt.match(/^trigger\s*:\s*(.+)$/);
    if (triggerMatch) {
      const val = triggerMatch[1].trim();
      const params = extractParams(val);
      nodes.push({ type: "trigger", value: params.primary, params: params.extra });
      continue;
    }

    // execute: action;
    const execMatch = stmt.match(/^execute\s*:\s*(.+)$/);
    if (execMatch) {
      nodes.push({ type: "execute", value: execMatch[1].trim() });
      continue;
    }

    // condition: expr -> label;
    const condMatch = stmt.match(/^condition\s*:\s*(.+)$/);
    if (condMatch) {
      const val = condMatch[1].trim();
      const params = extractParams(val);
      nodes.push({ type: "condition", value: params.primary, params: params.extra });
      continue;
    }

    // send: channel "target";
    const sendMatch = stmt.match(/^send\s*:\s*(.+)$/);
    if (sendMatch) {
      const val = sendMatch[1].trim();
      const params = extractParams(val);
      nodes.push({ type: "send", value: params.primary, params: params.extra });
      continue;
    }

    // wait: duration;
    const waitMatch = stmt.match(/^wait\s*:\s*(.+)$/);
    if (waitMatch) {
      nodes.push({ type: "wait", value: waitMatch[1].trim() });
      continue;
    }

    // transform: type [...];
    const tformMatch = stmt.match(/^transform\s*:\s*(.+)$/);
    if (tformMatch) {
      const val = tformMatch[1].trim();
      const params = extractParams(val);
      nodes.push({ type: "transform", value: params.primary, params: params.extra });
      continue;
    }

    // loop: over [...];
    const loopMatch = stmt.match(/^loop\s*:\s*(.+)$/);
    if (loopMatch) {
      const val = loopMatch[1].trim();
      const params = extractParams(val);
      nodes.push({ type: "loop", value: params.primary, params: params.extra });
      continue;
    }

    // subflow: name;
    const subMatch = stmt.match(/^subflow\s*:\s*(.+)$/);
    if (subMatch) {
      nodes.push({ type: "subflow", value: subMatch[1].trim() });
      continue;
    }

    // log: message;
    const logMatch = stmt.match(/^log\s*:\s*(.+)$/);
    if (logMatch) {
      nodes.push({ type: "log", value: logMatch[1].trim() });
      continue;
    }

    // output: field;
    const outMatch = stmt.match(/^output\s*:\s*(.+)$/);
    if (outMatch) {
      nodes.push({ type: "output", value: outMatch[1].trim() });
      continue;
    }

    // Unrecognized statement
    return {
      workflowName,
      nodes: [],
      success: false,
      error: `Unrecognized statement`,
      line: i + 1,
    };
  }

  if (!workflowName) {
    return {
      workflowName: "",
      nodes: [],
      success: false,
      error: `Missing workflow declaration`,
      line: 1,
    };
  }

  if (nodes.length === 0) {
    return {
      workflowName,
      nodes: [],
      success: false,
      error: `Workflow body is empty`,
      line: 1,
    };
  }

  return { workflowName, nodes, success: true };
}

function extractParams(input: string): {
  primary: string;
  extra: Record<string, string>;
} {
  // Detect chained params like: zalo_zns "{{phone}}" option="premium"
  const tokens = input.match(/(?:"[^"]*"|[^\s"]+)+/g) || [];
  const extra: Record<string, string> = {};
  const quotedArgs: string[] = [];

  for (const t of tokens) {
    const eqIdx = t.indexOf("=");
    if (eqIdx > 0) {
      const key = t.slice(0, eqIdx).trim();
      const val = t.slice(eqIdx + 1).trim().replace(/"/g, "");
      extra[key] = val;
    } else {
      quotedArgs.push(t.replace(/"/g, ""));
    }
  }

  return { primary: quotedArgs.join(" "), extra };
}

/* ─── DSL VALIDATION ────────────────────────────────────── */

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  typeDistribution: Record<string, number>;
}

function validateWorkflow(nodes: AwlBraceNode[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const typeDist: Record<string, number> = {};

  if (nodes.length === 0) {
    return { valid: false, errors: ["Empty workflow"], warnings: [], nodeCount: 0, typeDistribution: {} };
  }

  const hasTrigger = nodes.some((n) => n.type === "trigger");
  if (!hasTrigger) {
    errors.push("Missing trigger: every workflow needs an event source");
  }

  for (const node of nodes) {
    typeDist[node.type] = (typeDist[node.type] || 0) + 1;

    if (node.type === "trigger") {
      const validTriggers = ["on_payment_success", "webhook", "cron", "on_order_created", "on_lead", "on_booking"];
      const primary = node.value.split(" ")[0];
      if (!primary) errors.push(`Trigger value is empty`);
    }

    if (node.type === "send") {
      const validChannels = ["zalo_zns", "zalo", "email", "sms", "slack", "webhook", "telegram", "whatsapp"];
      const channel = node.value.split(" ")[0];
      if (channel && !validChannels.some((c) => channel.includes(c))) {
        warnings.push(`Unknown send channel "${channel}"`);
      }
      if (!node.value) errors.push(`Send statement missing target`);
    }

    if (node.type === "wait") {
      const dur = node.value;
      if (!dur.match(/^\d+[smhd]$/)) {
        warnings.push(`Wait duration "${dur}" may have unexpected format (use e.g. 30s, 5m, 2h)`);
      }
    }

    if (node.type === "condition") {
      if (!node.value.includes("==") && !node.value.includes(">=") && !node.value.includes("<=")) {
        warnings.push(`Condition "${node.value}" may need an operator (==, >=, <=)`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    nodeCount: nodes.length,
    typeDistribution: typeDist,
  };
}

/* ─── AST GENERATION ────────────────────────────────────── */

interface AstNode {
  kind: string;
  value: string;
  params?: Record<string, string>;
  meta: {
    type: string;
    label: string;
    icon: string;
  };
}

interface AstDocument {
  version: string;
  workflow: string;
  trigger: AstNode | null;
  steps: AstNode[];
  edges: Array<{ from: string; to: string }>;
}

function generateAst(doc: AwlBraceDocument): AstDocument {
  const steps: AstNode[] = [];
  let trigger: AstNode | null = null;
  let prevId: string | null = null;
  const edges: Array<{ from: string; to: string }> = [];

  for (let i = 0; i < doc.nodes.length; i++) {
    const n = doc.nodes[i];
    const meta = getNodeMeta(n.type, i);
    const astNode: AstNode = {
      kind: n.type,
      value: n.value,
      params: n.params,
      meta,
    };

    if (n.type === "trigger") {
      trigger = astNode;
      prevId = `trigger-0`;
    } else {
      steps.push(astNode);
      const currentId = `${n.type}-${i}`;
      if (prevId) {
        edges.push({ from: prevId, to: currentId });
      }
      prevId = currentId;
    }
  }

  return {
    version: "0.1",
    workflow: doc.workflowName,
    trigger,
    steps,
    edges,
  };
}

function getNodeMeta(type: string, idx: number): { type: string; label: string; icon: string } {
  const map: Record<string, { label: string; icon: string }> = {
    trigger: { label: "Trigger", icon: "🔌" },
    execute: { label: "Execute", icon: "⚡" },
    send: { label: "Send", icon: "📤" },
    condition: { label: "Condition", icon: "🔀" },
    wait: { label: "Wait", icon: "⏳" },
    transform: { label: "Transform", icon: "🔄" },
    loop: { label: "Loop", icon: "🔁" },
    subflow: { label: "Subflow", icon: "🔗" },
    output: { label: "Output", icon: "📊" },
    log: { label: "Log", icon: "📝" },
  };
  const m = map[type] || { label: type, icon: "📦" };
  return { type, label: m.label, icon: m.icon };
}

/* ─── UI COMPONENT ──────────────────────────────────────── */

export default function AwlPlaygroundPage() {
  const [codeInput, setCodeInput] = useState(DEFAULT_CODE);
  const [parsed, setParsed] = useState<AwlBraceDocument | null>(null);
  const [astJson, setAstJson] = useState<AstDocument | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [compileLoading, setCompileLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [compileResult, setCompileResult] = useState<"ok" | "error" | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  /* ── Compile (→ Backend API) ──────────────────────── */
  const handleCompile = useCallback(() => {
    setCompileLoading(true);
    setCompileResult(null);

    fetch("/api/workflows/awl/compile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-slug": "local",
      },
      body: JSON.stringify({ code: codeInput }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // Thành công — map response backend sang frontend types
          const ast = data.ast;
          const workflowName = ast.workflow?.name || "Unnamed";

          // Chuyển đổi trigger + steps → AwlBraceNode[]
          const nodes: AwlBraceNode[] = [];
          if (ast.trigger) {
            nodes.push({
              type: "trigger" as const,
              value: ast.trigger.value || ast.trigger.kind,
            });
          }
          for (const step of ast.steps || []) {
            nodes.push({
              type: (step.type === "action" ? "execute" : step.type) as AwlBraceNode["type"],
              value: step.value || step.name || step.id,
              params: step.config ? Object.fromEntries(
                Object.entries(step.config).map(([k, v]) => [k, String(v)])
              ) : undefined,
            });
          }

          // Xây dựng AstDocument từ backend response
          const astDoc: AstDocument = {
            version: "0.1",
            workflow: workflowName,
            trigger: ast.trigger
              ? {
                  kind: ast.trigger.kind,
                  value: ast.trigger.value,
                  meta: {
                    type: ast.trigger.kind,
                    label: ast.trigger.label || "Trigger",
                    icon: ast.trigger.icon || "🔌",
                  },
                }
              : null,
            steps: (ast.steps || []).map((s: any, i: number) => ({
              kind: s.type as string,
              value: s.value || s.name || s.id,
              params: s.config,
              meta: {
                type: s.type as string,
                label: s.label || "Step",
                icon: s.icon || "⚡",
              },
            })),
            edges: (ast.steps || []).map((_: any, i: number) => ({
              from: i === 0 ? `trigger-0` : `${ast.steps[i - 1].type}-${i}`,
              to: `${ast.steps[i].type}-${i + 1}`,
            })),
          };

          const doc: AwlBraceDocument = {
            workflowName,
            nodes,
            raw: codeInput,
          };

          // Validation summary
          const typeDist: Record<string, number> = {};
          for (const n of nodes) {
            typeDist[n.type] = (typeDist[n.type] || 0) + 1;
          }

          setParsed(doc);
          setAstJson(astDoc);
          setValidation({
            valid: true,
            errors: [],
            warnings: [],
            nodeCount: nodes.length,
            typeDistribution: typeDist,
          });
          setCompileResult("ok");
        } else {
          // Thất bại — trích xuất error string + line field
          setParsed(null);
          setAstJson(null);
          setValidation({
            valid: false,
            errors: [
              `Line ${data.line || "?"}: ${data.error || "Compile error"}`,
            ],
            warnings: [],
            nodeCount: 0,
            typeDistribution: {},
          });
          setCompileResult("error");
        }

        setCompileLoading(false);
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      })
      .catch((err: Error) => {
        // Network / fetch lỗi — fallback safety
        setParsed(null);
        setAstJson(null);
        setValidation({
          valid: false,
          errors: [
            `Network error: ${err.message || "Unable to reach backend"}`,
          ],
          warnings: [],
          nodeCount: 0,
          typeDistribution: {},
        });
        setCompileResult("error");
        setCompileLoading(false);
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      });
  }, [codeInput]);

  /* ── AI Translate (simulated) ───────────────────────── */
  const handleAiTranslate = useCallback(() => {
    setAiLoading(true);

    // Simulated AI: turn a "prompt" comment or the code into AWL
    setTimeout(() => {
      const lines = codeInput.split("\n");
      const commentLines = lines
        .filter((l) => l.trim().startsWith("//"))
        .map((l) => l.replace(/\/\/\s*/, "").trim());

      // If there are comments, try to generate from them
      if (commentLines.length > 0) {
        const prompt = commentLines.join(" ");
        const generated = simulateAiGeneration(prompt);
        setCodeInput(generated);
      }

      setAiLoading(false);
    }, 800);
  }, [codeInput]);

  /* ── Format ─────────────────────────────────────────── */
  const handleFormat = useCallback(() => {
    const result = parseAwlBrace(codeInput);
    if (!result.success) return;

    const formatted = formatAwlBrace(result.workflowName, result.nodes);
    setCodeInput(formatted);
  }, [codeInput]);

  const [copySuccess, setCopySuccess] = useState(false);
  const handleCopyAst = useCallback(() => {
    if (!astJson) return;
    navigator.clipboard.writeText(JSON.stringify(astJson, null, 2)).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }, [astJson]);

  /* ── Line count for gutter ──────────────────────────── */
  const lineCount = useMemo(() => codeInput.split("\n").length, [codeInput]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0e1a 0%, #0d1225 50%, #080b16 100%)",
        color: "#e8edff",
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── HEADER ────────────────────────────────────── */}
      <header
        style={{
          padding: "20px 32px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#6d7cff",
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 600,
            }}
          >
            AIFUT Workflow Language
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0", color: "#f0f4ff" }}>
            AWL Playground v0.1
          </h1>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Biên dịch DSL */}
          <button
            onClick={handleCompile}
            disabled={compileLoading}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "none",
              background: compileLoading
                ? "rgba(109,124,255,0.3)"
                : "linear-gradient(135deg, #6d7cff 0%, #5b6aee 100%)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: compileLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: compileLoading
                ? "none"
                : "0 2px 12px rgba(109,124,255,0.25)",
              transition: "all 0.15s",
              opacity: compileLoading ? 0.7 : 1,
            }}
          >
            {compileLoading ? (
              <>
                <Spinner />
                Đang biên dịch…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                  <line x1="12" y1="22" x2="12" y2="15.5" />
                  <polyline points="22 8.5 12 15.5 2 8.5" />
                </svg>
                Biên dịch DSL
              </>
            )}
          </button>

          {/* AI Translate */}
          <button
            onClick={handleAiTranslate}
            disabled={aiLoading}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "1px solid rgba(109,216,255,0.3)",
              background: aiLoading
                ? "rgba(109,216,255,0.08)"
                : "rgba(109,216,255,0.06)",
              color: aiLoading ? "rgba(109,216,255,0.5)" : "#6dd8ff",
              fontWeight: 600,
              fontSize: 14,
              cursor: aiLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s",
              opacity: aiLoading ? 0.7 : 1,
            }}
          >
            {aiLoading ? (
              <>
                <Spinner />
                Đang dịch…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                AI Translate
              </>
            )}
          </button>

          {/* Format */}
          <button
            onClick={handleFormat}
            disabled={compileLoading}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "transparent",
              color: "#9fb0ff",
              fontWeight: 500,
              fontSize: 13,
              cursor: "pointer",
            }}
            title="Format AWL code"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="12" y2="18" />
            </svg>
            <span style={{ marginLeft: 6 }}>Format</span>
          </button>
        </div>
      </header>

      {/* ─── MAIN GRID: Editor + Result ───────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(480px, 1fr) minmax(420px, 1fr)",
          gap: 0,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* ═══ LEFT: EDITOR ═══════════════════════════════ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {/* Editor toolbar */}
          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontSize: 12, color: "#6d7cff", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
              AWL Code Editor
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  setCodeInput("");
                  setParsed(null);
                  setAstJson(null);
                  setValidation(null);
                  setCompileResult(null);
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,80,80,0.2)",
                  background: "transparent",
                  color: "#ff8080",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Clear
              </button>
              <button
                onClick={() => setCodeInput(DEFAULT_CODE)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  color: "#9fb0ff",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Code editor with line numbers */}
          <div
            style={{
              flex: 1,
              display: "flex",
              position: "relative",
              overflow: "auto",
            }}
          >
            {/* Line number gutter */}
            <div
              style={{
                padding: "16px 8px",
                textAlign: "right",
                color: "rgba(255,255,255,0.15)",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 13,
                lineHeight: 1.65,
                minWidth: 40,
                userSelect: "none",
                borderRight: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              ref={editorRef}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              spellCheck={false}
              placeholder={`// Write AWL (brace syntax) here\nworkflow "MyFlow" {\n  trigger: webhook "/hook";\n  execute: action_name;\n}`}
              style={{
                flex: 1,
                padding: "16px 20px",
                border: "none",
                background: "transparent",
                color: "#d4e0ff",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 13,
                lineHeight: 1.65,
                resize: "none",
                outline: "none",
                minHeight: 400,
                tabSize: 2,
                whiteSpace: "pre",
                overflowWrap: "normal",
                overflowX: "auto",
              }}
            />
          </div>

          {/* Bottom status bar */}
          <div
            style={{
              padding: "8px 20px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <span>Ln {lineCount} · Col {codeInput.split("\n").pop()?.length || 0}</span>
            <span>
              {validation
                ? `${validation.nodeCount} node${validation.nodeCount !== 1 ? "s" : ""} · ${validation.valid ? "✓" : "✗"}`
                : "Press Compile to validate"}
            </span>
          </div>
        </div>

        {/* ═══ RIGHT: RESULT PANEL ════════════════════════ */}
        <div
          ref={resultRef}
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: "rgba(0,0,0,0.15)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "#6d7cff", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
              Compiler Output
            </div>
            {astJson && (
              <button
                onClick={handleCopyAst}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(109,124,255,0.2)",
                  background: "transparent",
                  color: "#6d7cff",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                {copySuccess ? "Copied!" : "Copy AST"}
              </button>
            )}
          </div>

          <div
            style={{
              flex: 1,
              padding: 20,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* ── AST JSON Block ──────────────────────── */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                {astJson ? "✔ AST Output" : "AST Output"}
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: 20,
                  borderRadius: 12,
                  background: "#05070f",
                  border: astJson
                    ? "1px solid rgba(80,200,120,0.12)"
                    : validation && !validation.valid
                    ? "1px solid rgba(255,80,80,0.15)"
                    : "1px solid rgba(255,255,255,0.04)",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  color: astJson ? "#c0d4ff" : validation?.errors.length ? "#ffb3b3" : "rgba(255,255,255,0.15)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflow: "auto",
                  maxHeight: 320,
                }}
              >
                {astJson
                  ? JSON.stringify(astJson, null, 2)
                  : validation && validation.errors.length > 0
                  ? `/* ⚠ COMPILATION ERROR */\n\n${validation.errors
                      .map((e) => `// ✗ ${e}`)
                      .join("\n")}${validation.warnings.length > 0 ? `\n\n/* Warnings */\n${validation.warnings.map((w) => `// ⚠ ${w}`).join("\n")}` : ""}`
                  : "// Press \"Biên dịch DSL\" to compile\n// or write AWL code on the left"}
              </pre>
            </div>

            {/* ── Visual Graph ────────────────────────── */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span>Workflow Graph</span>
                {parsed && (
                  <span
                    style={{
                      color: "#6d7cff",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    · {parsed.workflowName}
                  </span>
                )}
              </div>

              {!parsed ? (
                <div
                  style={{
                    padding: "32px 20px",
                    borderRadius: 12,
                    border: "1px dashed rgba(255,255,255,0.06)",
                    background: "rgba(0,0,0,0.1)",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.2)",
                    fontSize: 13,
                    lineHeight: 2,
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
                  Compile an AWL workflow to see the
                  <br />
                  visual execution graph here.
                </div>
              ) : (
                <FlowChart
                  workflowName={parsed.workflowName}
                  nodes={parsed.nodes}
                  ast={astJson!}
                />
              )}
            </div>

            {/* ── Validation summary ──────────────────── */}
            {validation && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: validation.valid
                    ? "rgba(80,200,120,0.04)"
                    : "rgba(255,80,80,0.04)",
                  border: `1px solid ${
                    validation.valid
                      ? "rgba(80,200,120,0.1)"
                      : "rgba(255,80,80,0.1)"
                  }`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: validation.valid
                        ? "rgba(80,200,120,0.15)"
                        : "rgba(255,80,80,0.15)",
                      color: validation.valid ? "#80e0a0" : "#ff8080",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {validation.valid ? "✓" : "✗"}
                  </span>
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: validation.valid ? "#80e0a0" : "#ff8080",
                      }}
                    >
                      {validation.valid
                        ? "Workflow hợp lệ"
                        : `${validation.errors.length} lỗi biên dịch`}
                    </div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.3)",
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {validation.nodeCount} node{validation.nodeCount !== 1 ? "s" : ""}
                      {validation.warnings.length > 0
                        ? ` · ${validation.warnings.length} warning${validation.warnings.length !== 1 ? "s" : ""}`
                        : ""}
                    </div>
                  </div>
                </div>

                {/* Error details */}
                {validation.errors.length > 0 && (
                  <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                    {validation.errors.map((e, i) => (
                      <div
                        key={`e-${i}`}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          background: "rgba(255,80,80,0.08)",
                          border: "1px solid rgba(255,80,80,0.1)",
                          color: "#ffb3b3",
                          fontSize: 12,
                        }}
                      >
                        ✗ {e}
                      </div>
                    ))}
                  </div>
                )}

                {/* Warning details */}
                {validation.warnings.length > 0 && (
                  <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                    {validation.warnings.map((w, i) => (
                      <div
                        key={`w-${i}`}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          background: "rgba(255,180,80,0.08)",
                          border: "1px solid rgba(255,180,80,0.1)",
                          color: "#ffcc80",
                          fontSize: 12,
                        }}
                      >
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                )}

                {/* Type distribution badges */}
                {Object.keys(validation.typeDistribution).length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    {Object.entries(validation.typeDistribution).map(
                      ([type, count]) => (
                        <span
                          key={type}
                          style={{
                            padding: "2px 10px",
                            borderRadius: 4,
                            background: "rgba(109,124,255,0.08)",
                            color: "#9fb0ff",
                            fontSize: 11,
                            border: "1px solid rgba(109,124,255,0.12)",
                          }}
                        >
                          {getNodeMeta(type, 0).icon} {type}: {count}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ─── FLOW CHART VISUALIZATION ──────────────────────────── */

function FlowChart({
  workflowName,
  nodes,
  ast,
}: {
  workflowName: string;
  nodes: AwlBraceNode[];
  ast: AstDocument;
}) {
  const nodeColors: Record<string, string> = {
    trigger: "#6d7cff",
    execute: "#7c6dff",
    send: "#4da6ff",
    condition: "#ffb366",
    wait: "#66c4ff",
    transform: "#b366ff",
    loop: "#ff66b3",
    subflow: "#66ffb3",
    log: "#66d4aa",
    output: "#ffd666",
  };

  const nodeIcons: Record<string, string> = {
    trigger: "🔌",
    execute: "⚡",
    send: "📤",
    condition: "🔀",
    wait: "⏳",
    transform: "🔄",
    loop: "🔁",
    subflow: "🔗",
    log: "📝",
    output: "📊",
  };

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
          paddingBottom: 14,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            background: "rgba(109,124,255,0.12)",
            color: "#6d7cff",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {workflowName}
        </div>
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
          {nodes.length} node{nodes.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Trigger row */}
      {ast.trigger && (
        <>
          <FlowNode
            icon={nodeIcons[ast.trigger.kind] || "🔌"}
            label={ast.trigger.meta.label}
            value={ast.trigger.value}
            color={nodeColors[ast.trigger.kind] || "#6d7cff"}
          />
          <VerticalArrow />
        </>
      )}

      {/* Step nodes */}
      {ast.steps.map((step, idx) => (
        <div key={idx}>
          <FlowNode
            icon={step.meta.icon}
            label={step.meta.label}
            value={step.value}
            color={nodeColors[step.kind] || "#9fb0ff"}
            params={step.params}
          />
          {idx < ast.steps.length - 1 && <VerticalArrow />}
        </div>
      ))}

      {/* Terminal */}
      {ast.steps.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 14px",
            borderRadius: 8,
            background: "rgba(80,200,120,0.06)",
            border: "1px dashed rgba(80,200,120,0.15)",
            color: "#80e0a0",
            fontSize: 11,
            textAlign: "center",
          }}
        >
          ✓ End
        </div>
      )}
    </div>
  );
}

function FlowNode({
  icon,
  label,
  value,
  color,
  params,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  params?: Record<string, string>;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${color}22`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#e8edff" }}>
            {label}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 12,
              marginTop: 2,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {value.length > 60 ? value.slice(0, 60) + "…" : value}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
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
            {label}
          </span>
        </div>
      </div>

      {params && Object.keys(params).length > 0 && (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {Object.entries(params).map(([k, v]) => (
            <span
              key={k}
              style={{
                padding: "1px 8px",
                borderRadius: 4,
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.35)",
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {k}={v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function VerticalArrow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "4px 0",
        color: "rgba(255,255,255,0.08)",
        fontSize: 16,
        lineHeight: 1,
      }}
    >
      ↓
    </div>
  );
}

/* ─── SPINNER ───────────────────────────────────────────── */

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "awl-spin 0.8s linear infinite" }}
    >
      <style>{`@keyframes awl-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.4 31.4"
        strokeLinecap="round"
        opacity={0.3}
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.4 31.4"
        strokeLinecap="round"
        opacity={0.8}
        strokeDashoffset="10"
      />
    </svg>
  );
}

/* ─── FORMAT HELPER ─────────────────────────────────────── */

function formatAwlBrace(name: string, nodes: AwlBraceNode[]): string {
  const lines: string[] = [];
  lines.push(`workflow "${name}" {`);

  for (const n of nodes) {
    let line = "  ";
    switch (n.type) {
      case "trigger":
        line += `trigger: ${n.value}`;
        break;
      case "execute":
        line += `execute: ${n.value}`;
        break;
      case "send":
        line += `send: ${n.value}`;
        break;
      case "condition":
        line += `condition: ${n.value}`;
        break;
      case "wait":
        line += `wait: ${n.value}`;
        break;
      case "transform":
        line += `transform: ${n.value}`;
        break;
      case "loop":
        line += `loop: ${n.value}`;
        break;
      case "subflow":
        line += `subflow: ${n.value}`;
        break;
      case "log":
        line += `log: ${n.value}`;
        break;
      case "output":
        line += `output: ${n.value}`;
        break;
    }

    // Append extra params
    if (n.params && Object.keys(n.params).length > 0) {
      for (const [k, v] of Object.entries(n.params)) {
        line += ` ${k}="${v}"`;
      }
    }

    line += ";";
    lines.push(line);
  }

  lines.push("}");
  return lines.join("\n");
}

/* ─── SIMULATED AI GENERATION ──────────────────────────── */

function simulateAiGeneration(prompt: string): string {
  const normalized = prompt.toLowerCase();

  if (normalized.includes("order") || normalized.includes("đơn hàng")) {
    return `// AI generated from: ${prompt}
workflow "OrderAutoNotify" {
  trigger: on_order_created;
  send: zalo_zns "{{customer.phone}}";
  condition: order.total >= 500000 -> "premium";
  send: zalo_zns "premium_thanks";
  log: "order processed";
}`;
  }

  if (normalized.includes("reminder") || normalized.includes("nhắc")) {
    return `// AI generated from: ${prompt}
workflow "BookingReminder" {
  trigger: on_booking;
  send: zalo_zns "{{customer.phone}}";
  wait: 2h;
  send: zalo_zns "booking_reminder";
  send: email "{{customer.email}}";
}`;
  }

  if (normalized.includes("report") || normalized.includes("báo cáo")) {
    return `// AI generated from: ${prompt}
workflow "WeeklyReport" {
  trigger: cron "0 8 * * 1";
  execute: query_weekly_stats;
  transform: format "html";
  send: email "{{manager.email}}";
  log: "report sent";
}`;
  }

  // Default fallback
  return `// AI generated from: "${prompt}"
workflow "AIWorkflow" {
  trigger: on_payment_success;
  execute: process_data;
  condition: result == "ok";
  send: zalo_zns "{{customer.phone}}";
  log: "complete";
}`;
}
