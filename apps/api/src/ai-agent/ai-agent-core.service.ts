import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type AgentIntent =
  | 'BUDGET_OPTIMIZATION'
  | 'SYSTEM_HEALTH_CHECK'
  | 'SECURITY_REVIEW'
  | 'INTEGRATION_PLANNING'
  | 'GENERAL_ASSISTANCE';

type AgentRecommendedAction = {
  type: string;
  targetId: string;
  description: string;
};

export type AgentCommandResult = {
  success: boolean;
  intent: AgentIntent;
  confidence: number;
  recommendedActions: AgentRecommendedAction[];
  timestamp: string;
};

type InternalAgentAnalysis = {
  intent: AgentIntent;
  confidence: number;
  recommendedActions: AgentRecommendedAction[];
};

@Injectable()
export class AiAgentCoreService {
  private readonly logger = new Logger(AiAgentCoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processAgentCommand(
    tenantId: string,
    query: string,
  ): Promise<AgentCommandResult> {
    const normalizedTenantId = this.normalizeTenantId(tenantId);
    const normalizedQuery = this.normalizeQuery(query);
    const systemPrompt = this.buildTenantBoundSystemPrompt(normalizedTenantId);
    const analysis = await this.invokeAgentReasoningFlow(
      systemPrompt,
      normalizedTenantId,
      normalizedQuery,
    );

    const result: AgentCommandResult = {
      success: true,
      intent: analysis.intent,
      confidence: analysis.confidence,
      recommendedActions: analysis.recommendedActions,
      timestamp: new Date().toISOString(),
    };

    await this.writeAgentAuditLog(normalizedTenantId, normalizedQuery, result);

    return result;
  }

  private buildTenantBoundSystemPrompt(tenantId: string): string {
    return [
      'You are the isolated AI Agent Core Orchestrator for a single tenant.',
      `Tenant boundary: ${tenantId}.`,
      'Never infer, read, merge, or leak data from another tenant.',
      'Transform the user command into a safe operational intent and recommended backend actions.',
      'Return only structured operational decisions that can be audited.',
    ].join('\n');
  }

  private async invokeAgentReasoningFlow(
    systemPrompt: string,
    tenantId: string,
    query: string,
  ): Promise<InternalAgentAnalysis> {
    void systemPrompt;

    const loweredQuery = query.toLowerCase();

    if (
      loweredQuery.includes('ngân sách') ||
      loweredQuery.includes('budget') ||
      loweredQuery.includes('cost') ||
      loweredQuery.includes('chi phí') ||
      loweredQuery.includes('tối ưu')
    ) {
      return {
        intent: 'BUDGET_OPTIMIZATION',
        confidence: 0.91,
        recommendedActions: [
          {
            type: 'ANALYZE_USAGE_COST',
            targetId: `tenant:${tenantId}:billing`,
            description:
              'Phân tích mức tiêu thụ tài nguyên và phát hiện nhóm chi phí tăng bất thường.',
          },
          {
            type: 'RECOMMEND_MODEL_ROUTING',
            targetId: `tenant:${tenantId}:ai-routing-policy`,
            description:
              'Đề xuất định tuyến mô hình theo độ khó tác vụ để giảm chi phí vận hành AI.',
          },
        ],
      };
    }

    if (
      loweredQuery.includes('lỗi') ||
      loweredQuery.includes('error') ||
      loweredQuery.includes('bug') ||
      loweredQuery.includes('sự cố') ||
      loweredQuery.includes('kiểm tra hệ thống')
    ) {
      return {
        intent: 'SYSTEM_HEALTH_CHECK',
        confidence: 0.88,
        recommendedActions: [
          {
            type: 'SCAN_RECENT_ERRORS',
            targetId: `tenant:${tenantId}:system-logs`,
            description:
              'Quét log gần nhất để gom nhóm lỗi theo module, endpoint và mức độ ảnh hưởng.',
          },
          {
            type: 'OPEN_INCIDENT_DRAFT',
            targetId: `tenant:${tenantId}:incident`,
            description:
              'Tạo bản nháp sự cố kèm phạm vi ảnh hưởng và bước xử lý khuyến nghị.',
          },
        ],
      };
    }

    if (
      loweredQuery.includes('bảo mật') ||
      loweredQuery.includes('security') ||
      loweredQuery.includes('audit') ||
      loweredQuery.includes('permission') ||
      loweredQuery.includes('quyền')
    ) {
      return {
        intent: 'SECURITY_REVIEW',
        confidence: 0.84,
        recommendedActions: [
          {
            type: 'REVIEW_ACCESS_POLICY',
            targetId: `tenant:${tenantId}:access-control`,
            description:
              'Rà soát chính sách phân quyền, token và hành vi truy cập nhạy cảm.',
          },
          {
            type: 'EXPORT_SECURITY_AUDIT_SUMMARY',
            targetId: `tenant:${tenantId}:audit-log`,
            description:
              'Tổng hợp dấu vết bảo mật để phục vụ kiểm toán nội bộ của tenant.',
          },
        ],
      };
    }

    if (
      loweredQuery.includes('tích hợp') ||
      loweredQuery.includes('integration') ||
      loweredQuery.includes('kết nối') ||
      loweredQuery.includes('api') ||
      loweredQuery.includes('webhook')
    ) {
      return {
        intent: 'INTEGRATION_PLANNING',
        confidence: 0.82,
        recommendedActions: [
          {
            type: 'MAP_INTEGRATION_REQUIREMENTS',
            targetId: `tenant:${tenantId}:integration-plan`,
            description:
              'Chuyển yêu cầu tích hợp thành danh sách endpoint, webhook và dữ liệu cần đồng bộ.',
          },
          {
            type: 'VALIDATE_CONNECTOR_SCOPE',
            targetId: `tenant:${tenantId}:connector-policy`,
            description:
              'Kiểm tra phạm vi quyền của connector trước khi kích hoạt luồng tích hợp.',
          },
        ],
      };
    }

    return {
      intent: 'GENERAL_ASSISTANCE',
      confidence: 0.67,
      recommendedActions: [
        {
          type: 'CREATE_AGENT_TASK_DRAFT',
          targetId: `tenant:${tenantId}:agent-task`,
          description:
            'Tạo bản nháp tác vụ Agent để người vận hành xác nhận trước khi thực thi.',
        },
      ],
    };
  }

  private async writeAgentAuditLog(
    tenantId: string,
    query: string,
    result: AgentCommandResult,
  ): Promise<void> {
    const prismaClient = this.prisma as unknown as {
      auditLog?: {
        create: (args: {
          data: {
            tenantId: string;
            action: string;
            targetType: string;
            targetId: string;
            metadata: Record<string, unknown>;
          };
        }) => Promise<unknown>;
      };
      telemetryLog?: {
        create: (args: {
          data: {
            tenantId: string;
            event: string;
            payload: Record<string, unknown>;
          };
        }) => Promise<unknown>;
      };
    };

    try {
      if (prismaClient.auditLog?.create) {
        await prismaClient.auditLog.create({
          data: {
            tenantId,
            action: 'AI_AGENT_COMMAND_PROCESSED',
            targetType: 'AI_AGENT_CORE',
            targetId: `tenant:${tenantId}:ai-agent-core`,
            metadata: {
              query,
              intent: result.intent,
              confidence: result.confidence,
              recommendedActions: result.recommendedActions,
              timestamp: result.timestamp,
            },
          },
        });

        return;
      }

      if (prismaClient.telemetryLog?.create) {
        await prismaClient.telemetryLog.create({
          data: {
            tenantId,
            event: 'AI_AGENT_COMMAND_PROCESSED',
            payload: {
              query,
              result,
            },
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to persist AI Agent audit log for tenant ${tenantId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private normalizeTenantId(tenantId: string): string {
    const normalizedTenantId = tenantId?.trim();

    if (!normalizedTenantId) {
      throw new Error('tenantId is required for AI Agent isolation boundary.');
    }

    return normalizedTenantId;
  }

  private normalizeQuery(query: string): string {
    const normalizedQuery = query?.trim();

    if (!normalizedQuery) {
      throw new Error('query is required for AI Agent command processing.');
    }

    return normalizedQuery;
  }
}
