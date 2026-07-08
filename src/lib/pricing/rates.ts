/**
 * Rates config (Plan §4). Model prices change often, so they live here — never
 * inlined in pipeline code — with an "as of" date and a source. Re-verify and
 * bump `asOf` before launch and whenever OpenAI changes pricing.
 *
 * All model rates are USD per 1,000,000 tokens, taken from the OpenAI usage
 * block's token types. GBP is display-only (see `fx`); OpenAI bills in USD.
 */

export interface TokenRatesUsd {
  /** USD per 1M input text tokens. */
  inputTextPerMTok: number;
  /** USD per 1M input image tokens (edits / references). */
  inputImagePerMTok: number;
  /** USD per 1M output image tokens. */
  outputImagePerMTok: number;
}

export interface RatesConfig {
  asOf: string;
  source: string;
  models: Record<string, TokenRatesUsd>;
  /** Display-only FX. Not a billed conversion — set/refresh manually. */
  fx: { gbpPerUsd: number; asOf: string; note: string };
  /** Local compute attribution (segmentation/composite). USD per second. */
  computeUsdPerSecond: number;
}

export const RATES: RatesConfig = {
  asOf: "2026-07-08",
  source: "https://developers.openai.com/api/docs/pricing",
  models: {
    "gpt-image-2": { inputTextPerMTok: 5.0, inputImagePerMTok: 8.0, outputImagePerMTok: 30.0 },
    "gpt-image-1.5": { inputTextPerMTok: 5.0, inputImagePerMTok: 8.0, outputImagePerMTok: 32.0 },
    "gpt-image-1-mini": { inputTextPerMTok: 2.0, inputImagePerMTok: 2.5, outputImagePerMTok: 8.0 },
  },
  fx: {
    gbpPerUsd: 0.79,
    asOf: "2026-07-08",
    note: "Manually set display rate, not a billed conversion. Refresh periodically.",
  },
  // We run segmentation/composite on local CPU, not a metered GPU, so this is
  // 0 for now. Set to a GPU-second rate once workers run on serverless GPU.
  computeUsdPerSecond: 0,
};

/**
 * Resolve rates for a model id, tolerating dated variants
 * (e.g. "gpt-image-2-2026-04-21" -> "gpt-image-2"). Picks the longest matching
 * known model prefix.
 */
export function getModelRates(model: string): TokenRatesUsd | undefined {
  if (RATES.models[model]) return RATES.models[model];
  let best: { key: string; rates: TokenRatesUsd } | undefined;
  for (const [key, rates] of Object.entries(RATES.models)) {
    if (model.startsWith(`${key}-`) && (!best || key.length > best.key.length)) {
      best = { key, rates };
    }
  }
  return best?.rates;
}
