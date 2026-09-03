import { Injectable } from '@nestjs/common';

interface Opportunity {
  id: string;
  type: string;
  title: string;
  description: string;
  recommendation: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priorityScore: number;
  impactScore: number;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  affectedPages: number;
}

@Injectable()
export class OpportunityService {
  generate(comparison: any): Opportunity[] {
    const opportunities: Opportunity[] = [];

    for (const metric of comparison.metrics ?? []) {
      if (metric.winner !== 'COMPETITOR') continue;

      const gap = Math.abs(Number(metric.gap ?? 0));

      const affectedPages = Number(
        metric.affectedPages ?? 0,
      );

      const priority = this.getPriority(gap);
      const impactScore = Math.min(
        100,
        Math.round(
          gap * 1.2 +
          Math.min(affectedPages, 20) * 2,
        ),
      );

      opportunities.push({
        id: `metric-${this.slug(metric.metric)}`,
        type: 'SEO_METRIC_GAP',
        title: `Improve ${metric.metric}`,
        description:
          `Competitor is ahead by ${gap.toFixed(1)} points.`,
        recommendation: this.recommendation(
          metric.metric,
        ),
        priority,
        priorityScore: this.priorityScore(
          priority,
          impactScore,
        ),
        impactScore,
        effort: this.getEffort(
          metric.metric,
        ),
        affectedPages,
      });
    }

    for (const page of comparison.pageGaps ?? []) {
      if (!page.gaps?.length) continue;

      const gapCount = page.gaps.length;
      const affectedPages = 1;

      const priority =
        gapCount >= 4
          ? 'CRITICAL'
          : gapCount >= 3
            ? 'HIGH'
            : gapCount === 2
              ? 'MEDIUM'
              : 'LOW';

      const impactScore = Math.min(
        100,
        gapCount * 25,
      );

      opportunities.push({
        id: `page-${this.slug(page.url)}`,
        type: 'PAGE_GAP',
        title: `Improve page ${page.url}`,
        description: page.gaps.join(' '),
        recommendation:
          'Resolve the highest-impact SEO gaps on this page first.',
        priority,
        priorityScore: this.priorityScore(
          priority,
          impactScore,
        ),
        impactScore,
        effort:
          gapCount >= 4
            ? 'HIGH'
            : gapCount >= 2
              ? 'MEDIUM'
              : 'LOW',
        affectedPages,
      });
    }

    return opportunities.sort(
      (a, b) =>
        b.priorityScore -
        a.priorityScore,
    );
  }

  private getPriority(
    gap: number,
  ): Opportunity['priority'] {
    if (gap >= 40) return 'CRITICAL';
    if (gap >= 25) return 'HIGH';
    if (gap >= 10) return 'MEDIUM';
    return 'LOW';
  }

  private priorityScore(
    priority: Opportunity['priority'],
    impactScore: number,
  ): number {
    const multiplier = {
      CRITICAL: 1.4,
      HIGH: 1.2,
      MEDIUM: 1.0,
      LOW: 0.7,
    }[priority];

    return Math.min(
      100,
      Math.round(
        impactScore * multiplier,
      ),
    );
  }

  private getEffort(
    metric: string,
  ): Opportunity['effort'] {
    const value =
      metric.toLowerCase();

    if (
      value.includes('structured') ||
      value.includes('internal links') ||
      value.includes('content')
    ) {
      return 'HIGH';
    }

    if (
      value.includes('title') ||
      value.includes('meta') ||
      value.includes('canonical') ||
      value.includes('alt')
    ) {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  private recommendation(
    metric: string,
  ): string {
    const value = metric.toLowerCase();

    if (value.includes('title')) {
      return 'Create unique, descriptive and search-intent-focused title tags for affected pages.';
    }

    if (value.includes('meta')) {
      return 'Add unique, compelling meta descriptions aligned with page search intent.';
    }

    if (value.includes('h1')) {
      return 'Ensure every important indexable page has one clear, descriptive H1.';
    }

    if (value.includes('canonical')) {
      return 'Add correct canonical URLs and verify canonical consistency.';
    }

    if (value.includes('structured data')) {
      return 'Add relevant valid Schema.org structured data to pages where the competitor has stronger coverage.';
    }

    if (value.includes('word count')) {
      return 'Expand thin pages with useful, original content that directly satisfies search intent.';
    }

    if (value.includes('internal links')) {
      return 'Strengthen contextual internal linking between related pages and important commercial pages.';
    }

    if (value.includes('alt')) {
      return 'Add meaningful alt text to informative images and avoid empty or generic image descriptions.';
    }

    if (value.includes('thin content')) {
      return 'Improve pages with insufficient useful content instead of adding text purely to increase word count.';
    }

    if (value.includes('slow')) {
      return 'Investigate Core Web Vitals, image weight, JavaScript execution and server response time.';
    }

    return 'Investigate the competitor gap and prioritize the affected pages based on business value.';
  }

  private slug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
}
