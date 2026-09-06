/*
 * Normalized AI provider failures.
 *
 * Codes are safe to expose to API consumers.
 * They never carry keys, tokens, or raw provider
 * payloads.
 */
export type AiProviderErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'INVALID_PROVIDER_KEY'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ERROR';

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly provider: string;

  constructor(
    provider: string,
    code: AiProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.provider = provider;
    this.code = code;
  }
}
