import { AiProviderError } from './provider.errors';

/*
 * Minimal authenticated POST helper for provider
 * REST APIs. Secrets stay in headers constructed
 * here; failures are normalized to safe codes.
 * Response bodies are never echoed into errors.
 */
export async function postProviderJson(params: {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, params.timeoutMs);

  let response: Response;

  try {
    response = await fetch(params.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...params.headers,
      },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });
  } catch (error: any) {
    if (
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError'
    ) {
      throw new AiProviderError(
        params.provider,
        'PROVIDER_TIMEOUT',
        `${params.provider} request timed out after ${params.timeoutMs}ms`,
      );
    }

    throw new AiProviderError(
      params.provider,
      'PROVIDER_ERROR',
      `${params.provider} request failed before a response was received`,
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: any = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    return payload;
  }

  const status = response.status;
  const messageText = String(
    payload?.error?.message ??
      payload?.message ??
      '',
  ).toLowerCase();

  if (status === 401 || status === 403) {
    const looksLikeKeyProblem =
      messageText.includes('key') ||
      messageText.includes('api') ||
      messageText.includes('auth') ||
      messageText.includes('credential') ||
      messageText.includes('permission') ||
      messageText.length === 0;

    throw new AiProviderError(
      params.provider,
      looksLikeKeyProblem
        ? 'INVALID_PROVIDER_KEY'
        : 'PROVIDER_ERROR',
      looksLikeKeyProblem
        ? `${params.provider} rejected the configured API key`
        : `${params.provider} refused the request (status ${status})`,
    );
  }

  if (status === 429) {
    const quota =
      messageText.includes('quota') ||
      messageText.includes('billing') ||
      messageText.includes('exceed') ||
      messageText.includes('limit');

    throw new AiProviderError(
      params.provider,
      quota ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
      quota
        ? `${params.provider} quota is exhausted`
        : `${params.provider} rate limit was hit; retry later`,
    );
  }

  if (status === 400 && messageText.includes('model')) {
    throw new AiProviderError(
      params.provider,
      'PROVIDER_ERROR',
      `${params.provider} does not support the configured model`,
    );
  }

  throw new AiProviderError(
    params.provider,
    'PROVIDER_ERROR',
    `${params.provider} returned status ${status}`,
  );
}
