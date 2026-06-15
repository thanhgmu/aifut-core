import { Controller, Get, Query, OnModuleInit } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController implements OnModuleInit {
  constructor(private readonly search: SearchService) {}

  async onModuleInit() {
    await this.search.buildIndex();
  }

  @Get()
  async search(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
  ) {
    if (!query) {
      return { results: [], query: '' };
    }
    const results = this.search.search(query, {
      limit: Number(limit) || 20,
      type,
      category,
    });
    return { query, total: results.length, results };
  }

  @Get('suggest')
  suggest(@Query('q') query?: string) {
    if (!query) return { suggestions: [] };
    return { query, suggestions: this.search.suggest(query) };
  }

  @Get('rebuild')
  async rebuild() {
    const count = await this.search.buildIndex();
    return { rebuilt: true, indexed: count.length };
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'search',
      status: 'active',
      indexedTypes: ['template', 'pack'],
      rankLogic: 'keyword match + category filter',
    };
  }
}
