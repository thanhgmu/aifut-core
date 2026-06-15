import { Controller, Get, Param, Query } from '@nestjs/common';
import { TemplatePackService, TemplatePack } from './template-pack.service';

@Controller('template-packs')
export class TemplatePackController {
  constructor(private readonly packs: TemplatePackService) {}

  @Get()
  getAll(): TemplatePack[] {
    return this.packs.getAllPacks();
  }

  @Get(':id')
  getById(@Param('id') id: string): TemplatePack | undefined {
    return this.packs.getPackById(id);
  }

  @Get('industry/:industry')
  getByIndustry(@Param('industry') industry: string): TemplatePack[] {
    return this.packs.getPacksByIndustry(industry);
  }

  @Get('stats/capabilities')
  capabilities() {
    return {
      capability: 'template-packs',
      status: 'active',
      packCount: this.packs.getAllPacks().length,
      totalTemplates: this.packs.getAllPacks().reduce((s, p) => s + p.templateCount, 0),
      industries: [...new Set(this.packs.getAllPacks().map((p) => p.industry))],
    };
  }
}
