// ═══════════════════════════════════════════════════════════════════════════
// sandbox-executor.service.ts — Pure-JS Sandboxed Code Execution
// ═══════════════════════════════════════════════════════════════════════════
// KHÔNG dùng child_process.spawn (né Windows SAC trigger).
// Dùng Node.js `vm` module cho JavaScript execution — chạy hoàn toàn
// in-process, không spawn binary → không bị Smart App Control chặn.
//
// Python execution được ghi nhận là NOT AVAILABLE trong môi trường
// Windows local; developer có thể cài Python riêng nếu cần.
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import * as vm from 'vm';

type SandboxLanguage = 'javascript' | 'python';

export interface SandboxExecutionResult {
  success: boolean;
  logs: string[];
  durationMs: number;
  exitCode: number | null;
  error?: string;
}

// ── Context timeout (ms) ──────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_LOG_LINES = 200;

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class SandboxExecutorService {
  private readonly logger = new Logger(SandboxExecutorService.name);
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = parseInt(process.env.SANDBOX_TIMEOUT_MS ?? '5000', 10) || DEFAULT_TIMEOUT_MS;
  }

  /**
   * executeCode
   * ───────────
   * Thực thi code trong sandbox cô lập.
   * - JavaScript: dùng vm.Script với time-boxing, context giới hạn
   * - Python: không hỗ trợ trên Windows local (trả về lỗi thân thiện)
   *
   * Không spawn child process → không trigger Windows Smart App Control.
   */
  async executeCode(
    tenantId: string,
    language: SandboxLanguage,
    code: string,
  ): Promise<SandboxExecutionResult> {
    if (language === 'python') {
      return {
        success: false,
        logs: ['Python execution is not available in this sandbox environment.'],
        durationMs: 0,
        exitCode: null,
        error: 'Python execution not available. Use JavaScript or install Python locally.',
      };
    }

    return this.executeJavaScript(tenantId, code);
  }

  private async executeJavaScript(
    tenantId: string,
    code: string,
  ): Promise<SandboxExecutionResult> {
    const startedAt = Date.now();
    const logs: string[] = [];

    // ── Captured console ──────────────────────────────────────────────
    const sandboxConsole = {
      log: (...args: unknown[]) => this.captureLog(logs, 'log', args),
      info: (...args: unknown[]) => this.captureLog(logs, 'info', args),
      warn: (...args: unknown[]) => this.captureLog(logs, 'warn', args),
      error: (...args: unknown[]) => this.captureLog(logs, 'error', args),
      debug: (...args: unknown[]) => this.captureLog(logs, 'debug', args),
    };

    // ── Sandbox context — tối thiểu, chỉ expose console + Math + JSON ─
    const sandbox = {
      console: sandboxConsole,
      Math,
      JSON,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      setTimeout: undefined, // Block timer access
      setInterval: undefined,
      setImmediate: undefined,
      require: undefined,
      process: undefined,
      global: undefined,
      globalThis: undefined,
      __dirname: undefined,
      __filename: undefined,
      Buffer: undefined,
      AIFUT_TENANT_ID: tenantId,
    };

    const context = vm.createContext(sandbox);

    try {
      const script = new vm.Script(`
        (function() {
          ${code}
        })();
      `);

      const result = script.runInContext(context, {
        timeout: this.timeoutMs,
        displayErrors: true,
        breakOnSigint: true,
      });

      const durationMs = Date.now() - startedAt;

      return {
        success: true,
        logs,
        durationMs,
        exitCode: 0,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = error?.message ?? 'Unknown sandbox error';

      return {
        success: false,
        logs: [...logs, `Error: ${errorMessage}`],
        durationMs,
        exitCode: 1,
        error: errorMessage,
      };
    }
  }

  private captureLog(
    logs: string[],
    level: string,
    args: unknown[],
  ): void {
    if (logs.length >= MAX_LOG_LINES) return;

    const formatted = args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');

    logs.push(`[${level.toUpperCase()}] ${formatted}`);
  }
}
