// ============================================================================
// lib/sandbox-format.ts
// Formatting utilities for the Developer Sandbox Console and Webhook
// Inspector UI.  BigInt-safe helpers so virtual-cost values > 2^53 are
// never silently truncated, plus latency and HTTP-status colour helpers.
// ============================================================================

// ---------------------------------------------------------------------------
// BigInt-safe virtual cost formatter
// ---------------------------------------------------------------------------

/**
 * Format a virtual-cost BigInt string (serialised from the backend as a
 * JSON string to avoid precision loss) into a human-readable display
 * string with thousands separators and the " Credits" suffix.
 *
 * Accepts both `string` and `number` inputs for maximum flexibility:
 *  - Strings are parsed via `BigInt()` (safe for arbitrary-precision
 *    values > 2^53).
 *  - Numbers are converted for convenience (though callers are encouraged
 *    to pass BigInt-serialised strings when consuming trace data).
 *
 * Edge-case handling (always returns a valid display string):
 *  - Empty / non-numeric / NaN input  →  "0 Credits"
 *  - Negative values                  →  "0 Credits"
 *  - Zero / fractions                 →  "0 Credits" (rounded down)
 *
 * @example
 *   formatSimulatedCredits("1250")           // "1,250 Credits"
 *   formatSimulatedCredits("9999999999999")  // "9,999,999,999,999 Credits"
 *   formatSimulatedCredits(1500)             // "1,500 Credits"
 *   formatSimulatedCredits("")               // "0 Credits"
 */
export function formatSimulatedCredits(amount: string | number): string {
  let big: bigint;

  try {
    if (typeof amount === "number") {
      if (!Number.isFinite(amount) || amount <= 0) return "0 Credits";
      // Round down to avoid showing micro-fractions of a credit
      big = BigInt(Math.floor(amount));
    } else {
      const trimmed = amount.trim();
      if (trimmed === "") return "0 Credits";
      big = BigInt(trimmed);
      if (big <= 0n) return "0 Credits";
    }
  } catch {
    // BigInt() throws on invalid syntax; fall back to safe default
    return "0 Credits";
  }

  return `${big.toLocaleString("en-US")} Credits`;
}

// ---------------------------------------------------------------------------
// Virtual cost shorthand (vCU — for compact table cells)
// ---------------------------------------------------------------------------

/**
 * Compact virtual-cost formatter for table cells where space is tight.
 * Renders the same BigInt-safe value with the shorter "vCU" suffix.
 *
 * @example
 *   formatVirtualCost("1250")           // "1,250 vCU"
 *   formatVirtualCost("9999999999999")  // "9,999,999,999,999 vCU"
 *   formatVirtualCost("")               // "0 vCU"
 */
export function formatVirtualCost(raw: string): string {
  const base = formatSimulatedCredits(raw);
  // Replace the " Credits" suffix with " vCU"
  if (base === "0 Credits") return "0 vCU";
  return base.replace(/ Credits$/, " vCU");
}

// ---------------------------------------------------------------------------
// Latency formatter
// ---------------------------------------------------------------------------

/**
 * Format a millisecond latency value into a human-readable duration string.
 *   - < 1000 ms  →  "Xms"   (e.g. "142ms")
 *   - ≥ 1000 ms  →  "X.Ys"  (e.g. "1.4s",  "12.7s")
 *
 * Edge cases: NaN, Infinity, negatives → "0ms".
 *
 * @example
 *   formatLatency(58)    // "58ms"
 *   formatLatency(1000)  // "1.0s"
 *   formatLatency(1650)  // "1.7s"
 */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// HTTP status → colour for badge / dot rendering
// ---------------------------------------------------------------------------

export type StatusColor = "green" | "gray" | "amber" | "red";

const STATUS_COLOUR_MAP: Record<number, StatusColor> = {
  2: "green",
  3: "gray",
  4: "amber",
  5: "red",
};

/**
 * Map an HTTP status code (or undefined/null) to a semantic colour key
 * suitable for badge/dot rendering in the webhook-inspector panel.
 *
 *   - 2xx → "green"
 *   - 3xx → "gray"
 *   - 4xx → "amber"
 *   - 5xx → "red"
 *   - missing / non-standard → "gray"
 *
 * @example
 *   statusCodeColor(200)  // "green"
 *   statusCodeColor(500)  // "red"
 *   statusCodeColor(undefined)  // "gray"
 */
export function statusCodeColor(code?: number | null): StatusColor {
  if (code === undefined || code === null) return "gray";
  const hundredGroup = Math.floor(code / 100);
  return STATUS_COLOUR_MAP[hundredGroup] ?? "gray";
}

// ---------------------------------------------------------------------------
// Trace action type → icon label (optional display helper)
// ---------------------------------------------------------------------------

/**
 * Map a sandbox action-type string to a human-readable display label
 * suitable for tooltips or accessible labels in the trace list.
 *
 * @example
 *   actionTypeLabel("AI_ROUTING")     // "AI Routing"
 *   actionTypeLabel("CONNECTOR_EXEC") // "Connector Execution"
 *   actionTypeLabel("WORKFLOW_RUN")   // "Workflow Run"
 */
export function actionTypeLabel(action: string): string {
  switch (action) {
    case "AI_ROUTING":
      return "AI Routing";
    case "CONNECTOR_EXEC":
      return "Connector Execution";
    case "WORKFLOW_RUN":
      return "Workflow Run";
    default:
      // Fallback: sentence-case the raw key
      return action
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
