import { Injectable } from '@nestjs/common';

import { AiProviderError } from './provider.errors';
import {
  ExecutePromptInput,
  ExecutePromptOutput,
  LiveAiProvider,
  ProviderCapabilities,
} from './provider.interface';
import { postProviderJson } from './provider.http';

const PROVIDER_TIMEOUT_MS = 60000;

/*
 * OpenAI Chat Completions API.
 * Result is an OPENAI_RESPONSE — an API result,
 * never presented as the consumer ChatGPT UI.
 */
@Injectable()
export class OpenAiProvider implements LiveAiProvider {
  readonly id = 'OPENAI' as const;
  readonly displayName = 'OpenAI';

  isConfigured(): boolean {
    return Boolean(
      process.env.OPENAI_API_KEY?.trim(),
    );
  }

  getModel(): string {
    return (
      process.env.OPENAI_MODEL?.trim() ||
      'gpt-4o-mini'
    );
  }

  getCapabilities(): ProviderCapabilities {
    return {
      citations: false,
      usageMetadata: true,
      streaming: false,
    };
  }

  async executePrompt(
    input: ExecutePromptInput,
  ): Promise<ExecutePromptOutput> {
    const apiKey =
      process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new AiProviderError(
        'OPENAI',
        'PROVIDER_NOT_CONFIGURED',
        'OpenAI is not configured. Set OPENAI_API_KEY on the backend.',
      );
    }

    const model = this.getModel();
    const started = Date.now();

    const payload = await postProviderJson({
      provider: 'OPENAI',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model,
        temperature: 0.2,
        max_tokens: input.maxOutputTokens,
        messages: [
          {
            role: 'user',
            content: input.prompt,
          },
        ],
      },
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });

    const choices = Array.isArray(
      payload?.choices,
    )
      ? payload.choices
      : [];

    const text = String(
      choices[0]?.message?.content ?? '',
    ).trim();

    if (!text) {
      throw new AiProviderError(
        'OPENAI',
        'PROVIDER_ERROR',
        'OpenAI returned no text for this prompt',
      );
    }

    const usage = payload?.usage ?? {};

    return {
      text,
      model:
        typeof payload?.model === 'string' &&
        payload.model.trim()
          ? payload.model
          : model,
      resultType: 'OPENAI_RESPONSE',
      resultLabel: 'LIVE_PROVIDER_RESULT',
      citations: [],
      usage: {
        inputTokens:
          typeof usage?.prompt_tokens ===
          'number'
            ? usage.prompt_tokens
            : null,
        outputTokens:
          typeof usage?.completion_tokens ===
          'number'
            ? usage.completion_tokens
            : null,
        totalTokens:
          typeof usage?.total_tokens ===
          'number'
            ? usage.total_tokens
            : null,
      },
      latencyMs: Date.now() - started,
    };
  }
}
