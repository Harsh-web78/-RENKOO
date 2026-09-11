/*
 * =========================================================
 * LIVE AI PROVIDER ABSTRACTION
 *
 * Pluggable contract for provider-backed prompt
 * execution. Gemini and OpenAI implement this
 * interface. Perplexity, Anthropic, and other
 * providers can be added without changing callers.
 *
 * Result types are provider-specific by design:
 * a Gemini API response is NEVER presented as
 * Google AI Overview / AI Mode / Search, and an
 * OpenAI API response is NEVER presented as the
 * consumer ChatGPT UI.
 * =========================================================
 */

export type LiveAiProviderId =
  | 'GEMINI'
  | 'OPENAI';

export type FutureAiProviderId =
  | 'PERPLEXITY'
  | 'ANTHROPIC';

export type KnownAiProviderId =
  | LiveAiProviderId
  | FutureAiProviderId;

export type LiveProviderResultType =
  | 'GEMINI_RESPONSE'
  | 'OPENAI_RESPONSE';

export type ProviderObservationType =
  | LiveProviderResultType
  | 'GOOGLE_SEARCH_OBSERVATION'
  | 'GOOGLE_AI_SEARCH_OBSERVATION'
  | 'MANUAL_OBSERVATION';

export interface ProviderCitation {
  url: string;
  title?: string | null;
  domain: string;
}

export interface ProviderUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

export interface ProviderCapabilities {
  citations: boolean;
  usageMetadata: boolean;
  streaming: boolean;
  /*
   * Phase 6 additive (optional, never required):
   * whether the provider endpoint accepts an
   * explicit locale / language hint and whether
   * it returns native citation payloads. Absent
   * flags mean UNKNOWN — callers must not assume.
   */
  locationLanguageSupport?: boolean;
  nativeCitations?: boolean;
}

export interface ExecutePromptInput {
  prompt: string;
  maxOutputTokens: number;
}

export interface ExecutePromptOutput {
  text: string;
  model: string;
  resultType: LiveProviderResultType;
  resultLabel: 'LIVE_PROVIDER_RESULT';
  citations: ProviderCitation[];
  usage: ProviderUsage;
  latencyMs: number;
}

export interface LiveAiProvider {
  readonly id: LiveAiProviderId;
  readonly displayName: string;

  isConfigured(): boolean;
  getCapabilities(): ProviderCapabilities;
  executePrompt(
    input: ExecutePromptInput,
  ): Promise<ExecutePromptOutput>;
  /*
   * Phase 6 additive (optional): provider-native
   * citation extraction from raw answer text.
   * Providers without native citation payloads
   * simply omit this; callers fall back to the
   * deterministic ai-citation extractor and must
   * label extracted citations as INFERRED, never
   * as provider-verified.
   */
  extractCitations?(
    text: string,
  ): ProviderCitation[];
}
