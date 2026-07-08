"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { TEMPLATES, DEFAULT_TEMPLATE_ID, getTemplate, isSceneTemplate } from "@/lib/templates";

type Status = "idle" | "working" | "done" | "error";

interface CostLine {
  label: string;
  usd: number;
  detail?: string;
}
interface Cost {
  totalUsd: number;
  totalGbpPence: number;
  lines: CostLine[];
  ratesAsOf: string;
  fxGbpPerUsd: number;
}
interface GenerateResponse {
  image: string;
  filename: string;
  cost: Cost;
  meta: { mode: string; model: string | null; elapsedMs: number };
}

function gbp(usd: number, fx: number): string {
  const value = usd * fx;
  return value >= 1 ? `£${value.toFixed(2)}` : `£${value.toFixed(3)}`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [artDirection, setArtDirection] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const template = useMemo(() => getTemplate(templateId), [templateId]);
  const sceneMode = template ? isSceneTemplate(template) : false;

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setSourceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setResult(null);
    setStatus("idle");
    setError(null);
  }, []);

  const generate = useCallback(async () => {
    if (!file) return;
    setStatus("working");
    setError(null);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("templateId", templateId);
      if (artDirection.trim()) body.append("prompt", artDirection.trim());

      const res = await fetch("/api/generate", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setResult(data as GenerateResponse);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }, [file, templateId, artDirection]);

  const workingLabel = sceneMode
    ? "Working — isolating & generating scene…"
    : "Working — isolating & compositing…";

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cadence Studio</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Shoot your product, get a clean catalog image.{" "}
          <span className="font-medium text-neutral-700">The product never changes.</span>
        </p>
      </header>

      {/* Step 1: upload / capture */}
      <section className="mb-6">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-white text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-700"
        >
          {sourceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sourceUrl} alt="Your product" className="h-full w-full rounded-lg object-contain p-2" />
          ) : (
            <>
              <span className="text-3xl">📷</span>
              <span className="text-sm font-medium">Take or choose a photo</span>
            </>
          )}
        </button>
        {sourceUrl && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 text-xs font-medium text-neutral-500 underline underline-offset-2"
          >
            Choose a different photo
          </button>
        )}
      </section>

      {/* Step 2: template */}
      <section className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-700">Background</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => {
            const active = t.id === templateId;
            const scene = isSceneTemplate(t);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`relative rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-neutral-900 ring-1 ring-neutral-900"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                {scene && (
                  <span className="absolute right-2 top-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700">
                    AI
                  </span>
                )}
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">
                  {t.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2b: art direction (scene templates only) */}
      {sceneMode && (
        <section className="mb-6">
          <label htmlFor="art" className="mb-1 block text-sm font-medium text-neutral-700">
            Art direction <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <input
            id="art"
            type="text"
            value={artDirection}
            onChange={(e) => setArtDirection(e.target.value)}
            placeholder="e.g. warmer morning light, a few eucalyptus leaves to the side"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </section>
      )}

      {/* Step 3: generate */}
      <button
        type="button"
        disabled={!file || status === "working"}
        onClick={generate}
        className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === "working" ? workingLabel : "Generate image"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Result */}
      {result && status === "done" && (
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Result</h2>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Product locked ✓
            </span>
          </div>
          <div
            className="overflow-hidden rounded-xl border border-neutral-200"
            style={{
              backgroundImage:
                "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.image} alt="Generated product image" className="w-full" />
          </div>

          {/* Cost (Plan §4: true unit cost, no margin, expandable breakdown) */}
          <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-neutral-600">This image cost</span>
              <span className="text-base font-semibold">
                {gbp(result.cost.totalUsd, result.cost.fxGbpPerUsd)}
              </span>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-neutral-500">Breakdown</summary>
              <ul className="mt-2 space-y-1">
                {result.cost.lines.map((l, i) => (
                  <li key={i} className="flex items-baseline justify-between text-xs">
                    <span className="text-neutral-600">
                      {l.label}
                      {l.detail && <span className="text-neutral-400"> · {l.detail}</span>}
                    </span>
                    <span className="tabular-nums text-neutral-700">
                      {gbp(l.usd, result.cost.fxGbpPerUsd)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-tight text-neutral-400">
                No margin. Priced from model usage; rates as of {result.cost.ratesAsOf}. GBP shown
                at {result.cost.fxGbpPerUsd}/USD (display only). ${result.cost.totalUsd.toFixed(4)}.
              </p>
            </details>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <a
              href={result.image}
              download={result.filename}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Download PNG
            </a>
            <span className="text-right text-xs text-neutral-400">
              {result.meta.model && <span>{result.meta.model} · </span>}
              {(result.meta.elapsedMs / 1000).toFixed(1)}s
            </span>
          </div>
        </section>
      )}
    </main>
  );
}
