/*
 * =========================================================
 * AI PROVIDER ABSTRACTION
 *
 * Provider-agnostic contracts for future AI search
 * integrations (OpenAI, Anthropic, Google/Gemini,
 * Perplexity, Microsoft/Copilot, Google AI Mode, …).
 *
 * No provider is implemented or connected here.
 * No keys are required. Nothing here performs
 * network calls.
 * =========================================================
 */

export type AiProviderId =
  | 'CHATGPT'
  | 'GOOGLE_AI'
  | 'GEMINI'
  | 'CLAUDE'
  | 'PERPLEXITY'
  | 'OTHER';

export type AiCheckResultStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING';

export interface AiProviderCheckRequest {
  websiteId: string;
  platform: AiProviderId;
  query: string;
}

export interface AiProviderCheckResult {
  status: AiCheckResultStatus;
  mentioned: boolean;
  citationFound: boolean;
  position: number | null;
  citationUrl: string | null;
  competitorNames: string[];
  responseExcerpt: string | null;
  errorMessage: string | null;
  providerMetadata: Record<
    string,
    unknown
  > | null;
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly displayName: string;

  /**
   * True only when the provider is configured
   * (keys, accounts, quotas) and reachable.
   */
  isConfigured(): Promise<boolean>;

  executeCheck(
    request: AiProviderCheckRequest,
  ): Promise<AiProviderCheckResult>;
}

/*
 * Registry of known providers.
 *
 * Intentionally empty: registering a provider
 * requires a real configured integration.
 */
export const AI_PROVIDER_REGISTRY: AiProvider[] =
  [];

export async function listProviderStates(): Promise<
  Array<{
    id: AiProviderId;
    displayName: string;
    connected: boolean;
  }>
> {
  const known: Array<{
    id: AiProviderId;
    displayName: string;
  }> = [
    { id: 'CHATGPT', displayName: 'ChatGPT' },
    {
      id: 'GOOGLE_AI',
      displayName: 'Google AI',
    },
    { id: 'GEMINI', displayName: 'Gemini' },
    { id: 'CLAUDE', displayName: 'Claude' },
    {
      id: 'PERPLEXITY',
      displayName: 'Perplexity',
    },
    { id: 'OTHER', displayName: 'Other' },
  ];

  const states = await Promise.all(
    AI_PROVIDER_REGISTRY.map(
      async (provider) => ({
        id: provider.id,
        displayName:
          provider.displayName,
        connected:
          await provider.isConfigured(),
      }),
    ),
  );

  const connectedIds = new Set(
    states.map((state) => state.id),
  );

  return known.map((provider) => ({
    ...provider,
    connected: connectedIds.has(
      provider.id,
    )
      ? (states.find(
          (state) =>
            state.id ===
            provider.id,
        )?.connected ?? false)
      : false,
  }));
}
