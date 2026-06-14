import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface ConnectorCallResult {
  success: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
  durationMs: number;
}

@Injectable()
export class ConnectorExecutorService {
  constructor(private readonly prisma: PrismaService) {}

  async callConnector(input: {
    tenantId: string;
    connectorSlug?: string;
    integrationId?: string;
    action: string;
    payload: any;
    baseUrl?: string;
    method?: string;
    endpoint?: string;
    headers?: Record<string, string>;
  }): Promise<ConnectorCallResult> {
    const start = Date.now();

    let baseUrl = input.baseUrl;
    let apiKey: string | undefined;

    // Resolve from IntegrationConnection if integrationId provided
    if (input.integrationId) {
      const conn = await this.prisma.integrationConnection.findUnique({
        where: { id: input.integrationId },
      });
      if (!conn) throw new NotFoundException(`Integration '${input.integrationId}' not found`);
      baseUrl = conn.targetBaseUrl ?? baseUrl;
      apiKey = conn.secretsRef ?? undefined;
    }

    // Resolve from connector template defaults
    if (!baseUrl) {
      baseUrl = this.getDefaultBaseUrl(input.connectorSlug ?? input.action);
    }

    if (!baseUrl) {
      return {
        success: false,
        error: `No base URL resolved for action '${input.action}'`,
        durationMs: Date.now() - start,
      };
    }

    const method = (input.method ?? 'POST').toUpperCase();
    const endpoint = input.endpoint ?? '';
    const url = `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

    const callHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(input.headers ?? {}),
    };
    if (apiKey) {
      callHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      // Use Node.js built-in fetch
      const response = await fetch(url, {
        method,
        headers: callHeaders,
        body: method !== 'GET' ? JSON.stringify(input.payload) : undefined,
        signal: AbortSignal.timeout(15000), // 15s timeout
      });

      const responseData = response.status !== 204
        ? await response.json().catch(() => response.text())
        : null;

      return {
        success: response.ok,
        statusCode: response.status,
        data: responseData,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message ?? 'Connector call failed',
        durationMs: Date.now() - start,
      };
    }
  }

  /** Simulate connector call for demo/preview mode (no real HTTP) */
  async simulateCall(input: {
    action: string;
    payload: any;
    channel?: string;
  }): Promise<ConnectorCallResult> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    // Simulate based on channel
    if (input.channel === 'zalo') {
      return {
        success: true,
        statusCode: 200,
        data: {
          messageId: `zalo_${Date.now()}`,
          recipient: input.payload?.to ?? 'anonymous',
          status: 'sent',
        },
        durationMs: Date.now() - start,
      };
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        result: `Simulated ${input.action}`,
        timestamp: new Date().toISOString(),
      },
      durationMs: Date.now() - start,
    };
  }

  private getDefaultBaseUrl(connectorSlug: string): string | undefined {
    const urls: Record<string, string> = {
      zalo: 'https://openapi.zalo.me/v2.0',
      shopee: 'https://partner.shopeemobile.com/api/v2',
      google_workspace: 'https://www.googleapis.com',
      webhook: '', // no base URL for raw webhooks
    };
    return urls[connectorSlug.toLowerCase()];
  }
}
