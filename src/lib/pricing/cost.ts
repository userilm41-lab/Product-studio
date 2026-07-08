import type { ImageUsage } from "../engine/types";
import { RATES, getModelRates } from "./rates";

/**
 * Cost metering (Plan §4). Computes the TRUE unit cost of a generation from the
 * model's reported token usage and the rates config — no margin added. Returns
 * a per-step breakdown for the "This image cost £X" display.
 */

export interface CostLine {
  label: string;
  usd: number;
  detail?: string;
}

export interface CostBreakdown {
  totalUsd: number;
  /** Display convenience, via config FX (not a billed conversion). */
  totalGbpPence: number;
  lines: CostLine[];
  /** Explicit: this figure carries no margin. */
  marginUsd: 0;
  ratesAsOf: string;
  fxGbpPerUsd: number;
}

function priceImageUsd(model: string, usage: ImageUsage): { usd: number; detail: string } {
  const rates = getModelRates(model);
  if (!rates) {
    return { usd: 0, detail: `no rates for ${model} — verify pricing config` };
  }
  const usd =
    (usage.inputTextTokens * rates.inputTextPerMTok +
      usage.inputImageTokens * rates.inputImagePerMTok +
      usage.outputImageTokens * rates.outputImagePerMTok) /
    1_000_000;
  const detail = `${usage.outputImageTokens} img + ${usage.inputTextTokens} txt tok · ${model}`;
  return { usd, detail };
}

export interface CostInputs {
  /** Image-model calls this generation made (AI render and/or scene). */
  images?: { label: string; model: string; usage: ImageUsage }[];
  /** Wall-clock seconds of local processing (segmentation + composite). */
  computeSeconds: number;
  /** True if an LLM was used to orchestrate the prompt (none yet). */
  llmPromptUsed?: boolean;
}

export function computeCost(inputs: CostInputs): CostBreakdown {
  const lines: CostLine[] = [];

  for (const call of inputs.images ?? []) {
    const { usd, detail } = priceImageUsd(call.model, call.usage);
    lines.push({ label: call.label, usd, detail });
  }

  // Prompt orchestration is rule-based for now — no model call, no cost.
  lines.push({
    label: "Prompt orchestration",
    usd: 0,
    detail: inputs.llmPromptUsed ? "LLM" : "rule-based, no model call",
  });

  const computeUsd = inputs.computeSeconds * RATES.computeUsdPerSecond;
  lines.push({
    label: "Processing",
    usd: computeUsd,
    detail:
      RATES.computeUsdPerSecond === 0
        ? "self-hosted (local CPU), not metered"
        : `${inputs.computeSeconds.toFixed(1)}s compute`,
  });

  const totalUsd = lines.reduce((sum, l) => sum + l.usd, 0);
  const totalGbpPence = Math.round(totalUsd * RATES.fx.gbpPerUsd * 100);

  return {
    totalUsd,
    totalGbpPence,
    lines,
    marginUsd: 0,
    ratesAsOf: RATES.asOf,
    fxGbpPerUsd: RATES.fx.gbpPerUsd,
  };
}
