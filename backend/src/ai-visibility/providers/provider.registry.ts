import { Injectable } from '@nestjs/common';

import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';
import {
  KnownAiProviderId,
  LiveAiProvider,
  LiveAiProviderId,
} from './provider.interface';

export type ProviderConnectionState =
  | 'CONNECTED'
  | 'NOT_CONFIGURED'
  | 'NOT_CONNECTED';

export interface LiveProviderState {
  id: LiveAiProviderId;
  displayName: string;
  configured: boolean;
  state:
    | 'CONNECTED'
    | 'NOT_CONFIGURED';
  resultType:
    | 'GEMINI_RESPONSE'
    | 'OPENAI_RESPONSE';
}

export interface DeclaredProviderState {
  id: KnownAiProviderId;
  displayName: string;
  configured: false;
  state: 'NOT_CONFIGURED';
  resultType: null;
}

/*
 * Pluggable registry. Adding a provider means
 * implementing LiveAiProvider and registering it
 * here — callers stay unchanged. Perplexity and
 * Anthropic are declared but not configured.
 */
@Injectable()
export class AiProviderRegistry {
  private readonly providers: Map<
    LiveAiProviderId,
    LiveAiProvider
  >;

  constructor(
    private readonly gemini: GeminiProvider,
    private readonly openai: OpenAiProvider,
  ) {
    const entries: Array<
      [LiveAiProviderId, LiveAiProvider]
    > = [
      [gemini.id, gemini],
      [openai.id, openai],
    ];

    this.providers = new Map(entries);
  }

  get(
    id: LiveAiProviderId,
  ): LiveAiProvider | null {
    return (
      this.providers.get(id) ?? null
    );
  }

  listLiveStates(): LiveProviderState[] {
    return [
      {
        id: 'GEMINI',
        displayName: 'Gemini',
        configured: this.gemini.isConfigured(),
        state: this.gemini.isConfigured()
          ? 'CONNECTED'
          : 'NOT_CONFIGURED',
        resultType: 'GEMINI_RESPONSE',
      },
      {
        id: 'OPENAI',
        displayName: 'OpenAI',
        configured: this.openai.isConfigured(),
        state: this.openai.isConfigured()
          ? 'CONNECTED'
          : 'NOT_CONFIGURED',
        resultType: 'OPENAI_RESPONSE',
      },
    ];
  }

  /*
   * Full honesty matrix for the UI, including
   * providers and Google surfaces that are not
   * connected. Google AI Search / AI Overview
   * entries are NOT_CONNECTED unless obtained
   * from the actual Google product/API.
   */
  listDeclaredStates(): Array<
    LiveProviderState | DeclaredProviderState
  > {
    return [
      ...this.listLiveStates(),
      {
        id: 'PERPLEXITY',
        displayName: 'Perplexity',
        configured: false,
        state: 'NOT_CONFIGURED',
        resultType: null,
      },
      {
        id: 'ANTHROPIC',
        displayName: 'Anthropic',
        configured: false,
        state: 'NOT_CONFIGURED',
        resultType: null,
      },
    ];
  }

  googleSearchState(
    googleConnected: boolean,
  ): ProviderConnectionState {
    return googleConnected
      ? 'CONNECTED'
      : 'NOT_CONNECTED';
  }
}
