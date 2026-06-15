import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { IndustryTemplatesService } from './workflows/industry-templates.service';
import { TemplatePackService } from './workflows/template-pack.service';

export interface SearchResult {
  type: 'template' | 'pack' | 'api' | 'guide';
  title: string;
  description: string;
  url: string;
  category: string;
  rank: number;
  keywords: string[];
}

@Injectable()
export class SearchService {
  private searchIndex: SearchResult[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: IndustryTemplatesService,
    private readonly packs: TemplatePackService,
  ) {}

  /** Build and cache the search index */
  async buildIndex(): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    let rank = 1000;

    // Templates from the service
    const allTemplates = this.templates.getAll();
    for (const tpl of allTemplates) {
      results.push({
        type: 'template',
        title: tpl.name,
        description: tpl.description,
        url: `/templates/${this.mapIndustryToPack(tpl.industry)}`,
        category: tpl.industry || 'general',
        rank: rank--,
        keywords: [tpl.name, tpl.description, tpl.industry, tpl.slug].filter(Boolean),
      });
    }

    // Template packs
    const allPacks = this.packs.getAllPacks();
    for (const pack of allPacks) {
      results.push({
        type: 'pack',
        title: pack.name,
        description: pack.tagline,
        url: `/templates/${pack.id}`,
        category: pack.industry,
        rank: rank--,
        keywords: [pack.name, pack.description, pack.industry, ...pack.highlights].filter(Boolean),
      });

      // Each template in the pack
      for (const tpl of pack.templates) {
        results.push({
          type: 'template',
          title: tpl.name,
          description: tpl.description,
          url: `/templates/${pack.id}`,
          category: tpl.industry,
          rank: rank--,
          keywords: [tpl.name, tpl.description, tpl.industry].filter(Boolean),
        });
      }
    }

    this.searchIndex = results;
    return results;
  }

  /** Search across all indexed content */
  search(query: string, options?: { limit?: number; type?: string; category?: string }): SearchResult[] {
    if (!query || query.trim().length === 0) return [];

    const normalized = query.toLowerCase().trim();
    const words = normalized.split(/\s+/).filter(Boolean);

    let results = this.searchIndex.filter((item) => {
      // Match if ANY keyword contains ANY search word
      return words.some((word) =>
        item.keywords.some((kw) => kw.toLowerCase().includes(word)),
      );
    });

    // Filter by type
    if (options?.type) {
      results = results.filter((r) => r.type === options.type);
    }

    // Filter by category
    if (options?.category) {
      results = results.filter((r) => r.category === options.category);
    }

    // Rank by relevance: exact matches first, then by keyword density
    results.sort((a, b) => {
      const aExact = words.some((w) => a.keywords.some((k) => k.toLowerCase() === w));
      const bExact = words.some((w) => b.keywords.some((k) => k.toLowerCase() === w));
      if (aExact !== bExact) return aExact ? -1 : 1;
      return b.rank - a.rank;
    });

    return results.slice(0, options?.limit || 50);
  }

  /** Get search suggestions (autocomplete) */
  suggest(query: string): string[] {
    if (!query || query.length < 2) return [];

    const word = query.toLowerCase();
    const suggestions = new Set<string>();

    for (const item of this.searchIndex) {
      for (const kw of item.keywords) {
        if (kw.toLowerCase().includes(word) && kw.toLowerCase() !== word) {
          suggestions.add(kw);
        }
      }
    }

    return Array.from(suggestions).slice(0, 10);
  }

  private mapIndustryToPack(industry: string): string {
    const map: Record<string, string> = {
      food: 'food-beverage',
      retail: 'retail-ecommerce',
      healthcare: 'healthcare-wellness',
      automotive: 'automotive-logistics',
      logistics: 'automotive-logistics',
      education: 'education-services',
      services: 'professional-services',
      beauty: 'beauty-fitness',
      fitness: 'beauty-fitness',
      hospitality: 'hospitality-travel',
      travel: 'hospitality-travel',
      legal: 'professional-services',
      accounting: 'professional-services',
      insurance: 'professional-services',
      realestate: 'professional-services',
    };
    return map[industry] || 'professional-services';
  }
}
