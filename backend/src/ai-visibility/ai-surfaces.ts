/*
 * =========================================================
 * AI SEARCH SURFACE MODEL 1.0 (Phase 6 / Part 2 + 20).
 *
 * Provider/surface abstraction: every AI surface declares
 * explicit capability metadata. Surfaces that cannot be
 * queried programmatically are UNAVAILABLE — never
 * fabricated. Provider-specific semantics are preserved
 * by the normalization layer (ai-observation.ts); this
 * file only declares what each surface CAN do.
 * =========================================================
 */

export type AiSurfaceId =
  | 'GOOGLE_AI_OVERVIEWS'
  | 'GOOGLE_AI_MODE'
  | 'CHATGPT'
  | 'COPILOT'
  | 'BING_AI'
  | 'GEMINI'
  | 'PERPLEXITY'
  | 'CLAUDE';

export type AiSurfaceAvailability =
  | 'LIVE_API'
  | 'MANUAL_OBSERVATION'
  | 'UNAVAILABLE';

export interface AiSurfaceCapabilities {
  promptExecution: boolean;
  webRetrieval: boolean;
  citationVisibility: boolean;
  sourceUrlVisibility: boolean;
  sourceDomainVisibility: boolean;
  mentionDetection: boolean;
  competitorDetection: boolean;
  positionDetectable: boolean;
  geography: boolean;
  language: boolean;
  historicalData: boolean;
  apiAvailable: boolean;
}

export interface AiSurfaceDefinition {
  id: AiSurfaceId;
  displayName: string;
  provider: string;
  availability: AiSurfaceAvailability;
  observationMethod: string;
  limitations: string;
  capabilities: AiSurfaceCapabilities;
}

const FULL_ASSISTANT: AiSurfaceCapabilities = {
  promptExecution: true,
  webRetrieval: true,
  citationVisibility: true,
  sourceUrlVisibility: true,
  sourceDomainVisibility: true,
  mentionDetection: true,
  competitorDetection: true,
  positionDetectable: false,
  geography: true,
  language: true,
  historicalData: true,
  apiAvailable: true,
};

export const AI_SURFACES: readonly AiSurfaceDefinition[] = [
  {
    id: 'GOOGLE_AI_OVERVIEWS',
    displayName: 'Google AI Overviews',
    provider: 'Google',
    availability: 'MANUAL_OBSERVATION',
    observationMethod:
      'Manual or Search Console-assisted observation. No public execution API; results vary by query, locale and SERP context.',
    limitations:
      'No programmatic prompt execution. Position/order is not a rank — record presence and cited URLs only.',
    capabilities: {
      ...FULL_ASSISTANT,
      promptExecution: false,
      positionDetectable: false,
      apiAvailable: false,
    },
  },
  {
    id: 'GOOGLE_AI_MODE',
    displayName: 'Google AI Mode',
    provider: 'Google',
    availability: 'MANUAL_OBSERVATION',
    observationMethod:
      'Manual observation inside Google AI Mode. No public execution API.',
    limitations:
      'Conversational follow-ups change answers. Record single-turn prompt + cited sources only.',
    capabilities: {
      ...FULL_ASSISTANT,
      promptExecution: false,
      positionDetectable: false,
      apiAvailable: false,
    },
  },
  {
    id: 'CHATGPT',
    displayName: 'ChatGPT',
    provider: 'OpenAI',
    availability: 'MANUAL_OBSERVATION',
    observationMethod:
      'OpenAI API responses are OPENAI_RESPONSE — never presented as consumer ChatGPT UI. Browsing citations come from manual observation.',
    limitations:
      'API output and ChatGPT UI with browsing are different products. Do not equate them.',
    capabilities: {
      ...FULL_ASSISTANT,
      promptExecution: false,
      apiAvailable: false,
    },
  },
  {
    id: 'COPILOT',
    displayName: 'Microsoft Copilot',
    provider: 'Microsoft',
    availability: 'MANUAL_OBSERVATION',
    observationMethod:
      'Manual observation. No stable execution API for answer/citation capture.',
    limitations:
      'Bing-grounded answers vary by session and region. Citations observable, order not a rank.',
    capabilities: {
      ...FULL_ASSISTANT,
      promptExecution: false,
      positionDetectable: false,
      apiAvailable: false,
    },
  },
  {
    id: 'BING_AI',
    displayName: 'Bing AI answers',
    provider: 'Microsoft',
    availability: 'MANUAL_OBSERVATION',
    observationMethod:
      'Manual observation of Bing generative answers with cited sources.',
    limitations:
      'No execution API. Source ordering is presentation, not ranking.',
    capabilities: {
      ...FULL_ASSISTANT,
      promptExecution: false,
      positionDetectable: false,
      apiAvailable: false,
    },
  },
  {
    id: 'GEMINI',
    displayName: 'Gemini',
    provider: 'Google',
    availability: 'LIVE_API',
    observationMethod:
      'Live execution via Gemini API (GEMINI_RESPONSE). Honest provider label on every record.',
    limitations:
      'API response is not Google Search / AI Overview output. Grounding varies by model.',
    capabilities: { ...FULL_ASSISTANT },
  },
  {
    id: 'PERPLEXITY',
    displayName: 'Perplexity',
    provider: 'Perplexity',
    availability: 'UNAVAILABLE',
    observationMethod:
      'No configured execution path. Recorded only via manual observation until credentials exist.',
    limitations:
      'Marked UNAVAILABLE for execution — never fabricate coverage.',
    capabilities: {
      ...FULL_ASSISTANT,
      promptExecution: false,
      apiAvailable: false,
    },
  },
  {
    id: 'CLAUDE',
    displayName: 'Claude',
    provider: 'Anthropic',
    availability: 'UNAVAILABLE',
    observationMethod:
      'No configured execution path. Recorded only via manual observation until credentials exist.',
    limitations:
      'Marked UNAVAILABLE for execution — never fabricate coverage.',
    capabilities: {
      ...FULL_ASSISTANT,
      promptExecution: false,
      webRetrieval: false,
      citationVisibility: false,
      sourceUrlVisibility: false,
      apiAvailable: false,
    },
  },
];

export function getSurface(
  id: string,
): AiSurfaceDefinition | null {
  const key = String(id ?? '')
    .trim()
    .toUpperCase();
  return (
    AI_SURFACES.find((s) => s.id === key) ?? null
  );
}

export function executableSurfaces(): AiSurfaceDefinition[] {
  return AI_SURFACES.filter(
    (s) =>
      s.availability === 'LIVE_API' &&
      s.capabilities.promptExecution,
  );
}

export function observableSurfaces(): AiSurfaceDefinition[] {
  return AI_SURFACES.filter(
    (s) => s.availability !== 'UNAVAILABLE',
  );
}

export function unavailableSurfaces(): AiSurfaceDefinition[] {
  return AI_SURFACES.filter(
    (s) => s.availability === 'UNAVAILABLE',
  );
}

/*
 * Provider record normalization guard: an API result
 * must never be relabeled as another surface's output.
 * Returns the honest observation type for storage.
 */
export function honestObservationType(
  surfaceId: string,
  viaApi: boolean,
): string {
  const surface = getSurface(surfaceId);
  if (!surface) return 'MANUAL_OBSERVATION';
  if (
    surface.id === 'GEMINI' &&
    viaApi
  ) {
    return 'GEMINI_RESPONSE';
  }
  if (surface.availability === 'LIVE_API' && viaApi) {
    return `${surface.id}_RESPONSE`;
  }
  return 'MANUAL_OBSERVATION';
}
