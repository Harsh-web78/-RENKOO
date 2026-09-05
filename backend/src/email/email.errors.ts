/*
 * Coded email provider errors.
 *
 * Codes are safe to expose to API consumers:
 * they describe provider state, never secrets.
 */
export type EmailErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'SENDER_NOT_VERIFIED'
  | 'SEND_FAILED';

export class EmailProviderError extends Error {
  readonly code: EmailErrorCode;

  constructor(
    code: EmailErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EmailProviderError';
    this.code = code;
  }
}
