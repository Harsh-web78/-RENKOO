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
 * Google Gemini API (Generative Language REST).
 * Result is a GEMINI_RESPONSE — never presented as
 * Google AI Overview, AI Mode, or Google Search.
 */
@Injectable()
export class GeminiProvider implements LiveAiProvider {
  readonly id = 'GEMINI' as const;
  readonly displayName = 'Gemini';

  isConfigured(): boolean {
    return Boolean(
      process.env.GEMINI_API_KEY?.trim(),
    );
  }

  getModel(): string {
    /*
     * Default follows the Gemini API's own
     * guidance for current stable Flash models.
     * Override with GEMINI_MODEL when needed.
     */
    return (
      process.env.GEMINI_MODEL?.trim() ||
      'gemini-3.6-flash'
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
      process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      throw new AiProviderError(
        'GEMINI',
        'PROVIDER_NOT_CONFIGURED',
        'Gemini is not configured. Set GEMINI_API_KEY on the backend.',
      );
    }

    const model = this.getModel();
    const started = Date.now();

    const payload = await postProviderJson({
      provider: 'GEMINI',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: {
        'x-goog-api-key': apiKey,
      },
      body: {
        contents: [
          {
            role: 'user',
            parts: [{ text: input.prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens:
            input.maxOutputTokens,
        },
      },
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });

    const candidates = Array.isArray(
      payload?.candidates,
    )
      ? payload.candidates
      : [];

    const parts: string[] = [];

    for (const candidate of candidates) {
      const contentParts = Array.isArray(
        candidate?.content?.parts,
      )
        ? candidate.content.parts
        : [];

      for (const part of contentParts) {
        if (
          typeof part?.text === 'string' &&
          part.text.trim()
        ) {
          parts.push(part.text);
        }
      }
    }

    const text = parts.join('\n').trim();

    if (!text) {
      const blockReason = String(
        payload?.promptFeedback
          ?.blockReason ?? '',
      );

      throw new AiProviderError(
        'GEMINI',
        'PROVIDER_ERROR',
        blockReason
          ? 'Gemini returned no text for this prompt (blocked)'
          : 'Gemini returned no text for this prompt',
      );
    }

    const usage = payload?.usageMetadata ?? {};

    return {
      text,
      model,
      resultType: 'GEMINI_RESPONSE',
      resultLabel: 'LIVE_PROVIDER_RESULT',
      citations: [],
      usage: {
        inputTokens:
          typeof usage?.promptTokenCount ===
          'number'
            ? usage.promptTokenCount
            : null,
        outputTokens:
          typeof usage?.candidatesTokenCount ===
          'number'
            ? usage.candidatesTokenCount
            : null,
        totalTokens:
          typeof usage?.totalTokenCount ===
          'number'
            ? usage.totalTokenCount
            : null,
      },
      latencyMs: Date.now() - started,
    };
  }
}
