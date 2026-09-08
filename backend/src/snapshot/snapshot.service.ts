import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import * as cheerio from 'cheerio';

import {
  analyzeAiResponse,
} from '../ai-visibility/analysis';
import { AiProviderRegistry } from '../ai-visibility/providers/provider.registry';
import type { LiveAiProviderId } from '../ai-visibility/providers/provider.interface';
import {
  allResolvedPublic,
  buildSnapshotPrompts,
  isSafeFetchTarget,
  normalizeDomain,
  sanitizeBrandDisplay,
  secondLevelName,
  snapshotEnv,
  truncateExcerpt,
} from './snapshot-guards';
import {
  MonthlyBudget,
  SnapshotCache,
  WindowCounter,
  withTimeout,
} from './snapshot-limits';

const HOMEPAGE_TIMEOUT_MS = 8000;
const HOMEPAGE_MAX_BYTES = 120000;
const RUN_MAX_OUTPUT_TOKENS = 256;
const EXCERPT_CHARS = 300;
/*
 * Snapshot-scoped provider deadline. The shared provider
 * timeout (60s, used by authenticated checks) is untouched —
 * anonymous snapshots stop waiting sooner and normalize the
 * timeout into a per-engine miss.
 */
const SNAPSHOT_PROVIDER_TIMEOUT_MS = 30000;

/*
 * In-memory per-instance state (no Redis this phase).
 * Resets on restart / does not span horizontally —
 * documented on the response limits block.
 */
const resultCache = new SnapshotCache<
  Record<string, unknown>
>();
const ipLimiter = new WindowCounter();
const domainLimiter = new WindowCounter();
const monthlyBudget = new MonthlyBudget();

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(
    SnapshotService.name,
  );

  constructor(
    private readonly providers: AiProviderRegistry,
  ) {}

  async runSnapshot(
    rawDomain: unknown,
    clientIp: string,
  ): Promise<Record<string, unknown>> {
    const env = snapshotEnv();
    const normalized =
      normalizeDomain(rawDomain);

    if (!normalized) {
      throw new BadRequestException(
        'That domain could not be verified. Enter a public website domain such as acme.com.',
      );
    }

    if (
      !ipLimiter.allow(
        `snapshot-ip:${clientIp || 'unknown'}`,
        env.maxRequestsPerIpPerHour,
        60 * 60 * 1000,
      )
    ) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message:
            'Too many snapshot requests from this address. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cached = resultCache.get(
      `snapshot:${normalized}`,
    );
    if (cached) {
      return { ...cached, cached: true };
    }

    if (
      !domainLimiter.allow(
        `snapshot-domain:${normalized}`,
        env.maxRequestsPerDomainPerDay,
        24 * 60 * 60 * 1000,
      )
    ) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message:
            'This domain reached the free snapshot limit for today. Please try again tomorrow.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return resultCache.dedupe(
      `snapshot:${normalized}`,
      async () => {
        const fresh = await this.buildFresh(
          normalized,
          env,
        );
        resultCache.set(
          `snapshot:${normalized}`,
          fresh,
          env.cacheTtlHours * 60 * 60 * 1000,
        );
        return { ...fresh, cached: false };
      },
    );
  }

  async readCached(
    rawDomain: unknown,
  ): Promise<Record<string, unknown>> {
    const normalized =
      normalizeDomain(rawDomain);

    if (!normalized) {
      throw new BadRequestException(
        'That domain could not be verified.',
      );
    }

    const cached = resultCache.get(
      `snapshot:${normalized}`,
    );
    if (!cached) {
      throw new NotFoundException(
        'No snapshot is cached for this domain yet. Run a fresh snapshot first.',
      );
    }

    return { ...cached, cached: true };
  }

  private async buildFresh(
    normalized: string,
    env: ReturnType<typeof snapshotEnv>,
  ): Promise<Record<string, unknown>> {
    const liveIds: LiveAiProviderId[] = (
      ['GEMINI', 'OPENAI'] as LiveAiProviderId[]
    ).filter((id) =>
      this.providers.get(id)?.isConfigured(),
    );

    const declared =
      this.providers.listDeclaredStates();
    const enginesTested = liveIds;
    const enginesUnavailable = [
      ...declared
        .filter(
          (state) =>
            !state.configured ||
            !liveIds.includes(
              state.id as LiveAiProviderId,
            ),
        )
        .map((state) => ({
          id: state.id,
          displayName: state.displayName,
          state: state.state,
          reason:
            state.id === 'PERPLEXITY' ||
            state.id === 'ANTHROPIC'
              ? 'Not connected. Only OpenAI and Gemini API results are tested in this snapshot.'
              : 'Not configured. Set the provider API key on the backend to include it.',
        })),
      {
        id: 'GOOGLE_AI_SEARCH',
        displayName: 'Google AI Overviews / AI Search',
        state: 'NOT_CONNECTED',
        reason:
          'Google AI Overviews and AI Mode are not connected. This snapshot never presents Gemini API results as Google Search output.',
      },
    ];

    if (liveIds.length === 0) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          message:
            'AI checks are temporarily unavailable. Please try again later.',
          enginesUnavailable,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const brand = await this.brandFor(
      normalized,
    );
    const prompts = buildSnapshotPrompts(
      brand.display,
      normalized,
    );
    const plannedCalls =
      prompts.length * liveIds.length;

    if (!monthlyBudget.use(plannedCalls, env.monthlyCallBudget)) {
      throw new HttpException(
        {
          code: 'BUDGET_EXHAUSTED',
          message:
            "We've reached the free snapshot capacity for now. Please try again later.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const brandTerms = [
      brand.display,
      normalized,
      secondLevelName(normalized),
    ].filter(
      (term, index, all) =>
        term &&
        term !== 'this business' &&
        all.indexOf(term) === index,
    );

    const calls: Array<{
      prompt: string;
      providerId: LiveAiProviderId;
    }> = [];
    for (const providerId of liveIds) {
      for (const prompt of prompts) {
        calls.push({ prompt, providerId });
      }
    }

    const settled = await Promise.all(
      calls.map(async (call) => {
        const provider = this.providers.get(
          call.providerId,
        );
        if (!provider) {
          return {
            ...call,
            ok: false as const,
            error: 'Provider unavailable',
          };
        }
        try {
          const output = await withTimeout(
            provider.executePrompt({
              prompt: call.prompt,
              maxOutputTokens:
                RUN_MAX_OUTPUT_TOKENS,
            }),
            SNAPSHOT_PROVIDER_TIMEOUT_MS,
            `Snapshot ${call.providerId} check`,
          );
          return {
            ...call,
            ok: true as const,
            output,
          };
        } catch (error: any) {
          const message = String(
            error?.message ??
              'Provider request failed',
          ).slice(0, 160);
          this.logger.warn(
            `Snapshot provider failed (${call.providerId}): ${message}`,
          );
          return {
            ...call,
            ok: false as const,
            error:
              'This engine did not return a result for this check.',
          };
        }
      }),
    );

    const results: Array<
      Record<string, unknown>
    > = [];
    let mentionedCount = 0;

    for (const item of settled) {
      if (!item.ok) {
        results.push({
          prompt: item.prompt,
          provider: item.providerId,
          providerDisplayName:
            item.providerId === 'GEMINI'
              ? 'Gemini'
              : 'OpenAI',
          resultType:
            item.providerId === 'GEMINI'
              ? 'GEMINI_RESPONSE'
              : 'OPENAI_RESPONSE',
          resultLabel:
            'API result — not the consumer app',
          mentioned: null,
          excerpt: '',
          competitorMentions: [],
          error: item.error,
        });
        continue;
      }

      const analysis = analyzeAiResponse({
        text: item.output.text,
        brandTerms:
          brandTerms.length > 0
            ? brandTerms
            : [normalized],
        competitors: [],
      });

      const excerpt =
        analysis.brandOccurrences[0]?.contexts[0] ??
        truncateExcerpt(
          item.output.text,
          EXCERPT_CHARS,
        );

      if (analysis.mentioned) {
        mentionedCount += 1;
      }

      results.push({
        prompt: item.prompt,
        provider: item.providerId,
        providerDisplayName:
          item.output.resultType ===
          'GEMINI_RESPONSE'
            ? 'Gemini'
            : 'OpenAI',
        model: item.output.model,
        resultType: item.output.resultType,
        resultLabel:
          'API result — not the consumer app',
        mentioned: analysis.mentioned,
        excerpt: truncateExcerpt(
          excerpt,
          EXCERPT_CHARS,
        ),
        competitorMentions: [],
      });
    }

    const totalChecks = results.filter(
      (r) => r.mentioned !== null,
    ).length;

    if (totalChecks === 0) {
      throw new HttpException(
        {
          code: 'PROVIDER_ERROR',
          message:
            'AI checks are temporarily unavailable. Please try again later.',
          enginesUnavailable,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      domain: normalized,
      normalizedDomain: normalized,
      brand: brand.display,
      brandConfidence: brand.confidence,
      enginesTested,
      enginesUnavailable,
      prompts,
      results,
      summary: {
        mentionedCount,
        totalChecks,
        note: `Your brand was mentioned in ${mentionedCount} of ${totalChecks} tested responses. Based on the prompts tested in this snapshot only — not all AI answers.`,
      },
      competitorsNote:
        'Competitor tracking requires a RENKOO workspace with tracked competitors. No competitor claims are made from this snapshot.',
      citationsNote: 'NO_CITATIONS_LIVE',
      citationsReason:
        'Citations are not available from these live API checks. Provider text responses do not include source metadata.',
      providerStates: declared,
      generatedAt: new Date().toISOString(),
      cached: false,
      limits: {
        maxCallsPerRun: env.maxCallsPerRun,
        cacheTtlHours: env.cacheTtlHours,
        note: 'In-memory limits reset when the backend restarts or scales horizontally.',
      },
      cta: {
        label: 'Track this continuously',
        href: `/signup?domain=${encodeURIComponent(normalized)}`,
      },
    };
  }

  /*
   * DNS-rebinding guard: every hostname (initial + each
   * redirect hop) is resolved and ALL addresses must be
   * public before any bytes are fetched. DNS failure or
   * any non-public address falls back to hostname terms.
   */
  private async hostResolvesPublic(
    hostname: string,
  ): Promise<boolean> {
    let records: Array<{ address: string }>;
    try {
      records = await lookup(hostname, {
        all: true,
      });
    } catch {
      return false;
    }
    return allResolvedPublic(
      records.map((r) => r.address),
    );
  }

  /*
   * Brand extraction: homepage <title> / og:site_name only.
   * Fetched content is UNTRUSTED — only a sanitized display
   * string leaves this function. Redirects are followed
   * manually (max 3) with per-hop DNS + target validation.
   * Any failure falls back to hostname-derived terms with
   * lowered confidence.
   */
  private async brandFor(
    normalized: string,
  ): Promise<{
    display: string;
    confidence: 'homepage' | 'hostname-only';
  }> {
    const fallback =
      secondLevelName(normalized);
    const none = {
      display: fallback,
      confidence: 'hostname-only' as const,
    };

    try {
      if (
        !(await this.hostResolvesPublic(
          normalized,
        ))
      ) {
        return none;
      }

      let current = `https://${normalized}`;
      let response: Response | null = null;

      for (let hop = 0; hop <= 3; hop += 1) {
        if (!isSafeFetchTarget(current)) {
          return none;
        }
        const hopHost = new URL(current)
          .hostname;
        if (
          !(await this.hostResolvesPublic(
            hopHost,
          ))
        ) {
          return none;
        }

        const controller =
          new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          HOMEPAGE_TIMEOUT_MS,
        );

        try {
          response = await fetch(current, {
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              'User-Agent':
                'RENKOOBot/1.0 (+https://renkoo.online)',
              Accept: 'text/html',
            },
          });
        } finally {
          clearTimeout(timer);
        }

        if (
          response.status >= 300 &&
          response.status < 400
        ) {
          const location = response.headers
            .get('location')
            ?.trim();
          if (!location || hop === 3) {
            return none;
          }
          try {
            current = new URL(
              location,
              current,
            ).toString();
          } catch {
            return none;
          }
          await response.arrayBuffer().catch(
            () => null,
          );
          response = null;
          continue;
        }

        break;
      }

      if (!response || !response.ok) {
        return none;
      }

      if (
        !isSafeFetchTarget(response.url)
      ) {
        return none;
      }

      const contentType =
        response.headers.get('content-type') ??
        '';
      if (
        !contentType.includes('text/html')
      ) {
        return none;
      }

      const lengthHeader =
        response.headers.get('content-length');
      if (
        lengthHeader &&
        Number(lengthHeader) >
          HOMEPAGE_MAX_BYTES * 3
      ) {
        return none;
      }

      const html = (
        await response.text()
      ).slice(0, HOMEPAGE_MAX_BYTES);
      const $ = cheerio.load(html);
      const siteName =
        $('meta[property="og:site_name"]')
          .attr('content') ?? '';
      const title = $('title')
        .first()
        .text();
      const candidate = (
        siteName || title
      )
        .split(/[-|·•:]/)[0]
        .trim();

      if (!candidate) {
        return none;
      }

      return {
        display: sanitizeBrandDisplay(
          candidate,
          fallback,
        ),
        confidence: 'homepage',
      };
    } catch {
      return {
        display: fallback,
        confidence: 'hostname-only',
      };
    }
  }
}
