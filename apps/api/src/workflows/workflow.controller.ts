import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, UsePipes, ValidationPipe } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { WorkflowService } from "./workflow.service";
@Controller("workflows")
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService, private readonly prisma: PrismaService) {}
  private async resolveTenantId(tenantSlug: string): Promise<string> {
    if (!tenantSlug || tenantSlug === "playground") return "playground";
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      return tenant ? tenant.id : "playground";
    } catch {
      return "playground";
    }
  }
  @Post("templates")
  async createTemplate(@Headers("x-tenant-slug") tenantSlug: string, @Body() body: any) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.createTemplate({ tenantId, ...body });
  }
  @Get("templates")
  async listTemplates(@Headers("x-tenant-slug") tenantSlug: string) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.listTemplates(tenantId);
  }
  @Get("templates/:key")
  async getTemplate(@Headers("x-tenant-slug") tenantSlug: string, @Param("key") key: string) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.getTemplate(tenantId, key);
  }
  @Post("awl/compile")
  async awlCompile(@Headers("x-tenant-slug") tenantSlug: string, @Body() body: any) {
    const tenantId = await this.resolveTenantId(tenantSlug || "playground");
    return this.workflow.compileAWL(tenantId, body.code || "");
  }
  @Post("templates/:key/execute")
  async execute(@Headers("x-tenant-slug") tenantSlug: string, @Param("key") key: string, @Body() body: any) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.workflow.executeWorkflow(tenantId, key, body);
  }
}
