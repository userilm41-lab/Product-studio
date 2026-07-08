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
interface VersionMeta {
  mode: string;
  model: string | null;
  elapsedMs: number;
  reusedCutout: boolean;
  templateId: string;
  templateName: string;
  artDirection: string | null;
}
interface Version {
  versionId: string;
  image: string;
  filename: string;
  createdAt: string;
  cost: Cost;
  meta: VersionMeta;
}
interface GenerateResponse extends Version {
  productId: string;
}

function gbp(usd: number, fx: number): string {
  const value = usd * fx;
  return value >= 1 ? `£${value.toFixed(2)}` : `£${value.toFixed(3)}`;
}
function clock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [artDirection, setArtDirection] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const template = useMemo(() => getTemplate(templateId), [templateId]);
  const sceneMode = template ? isSceneTemplate(template) : false;
  const selected = versions.find((v) => v.versionId === selectedId) ?? null;
  const hasVersions = versions.length > 0;

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    // New photo = new product: reset the locked cutout and version history.
    setFile(f);
    setSourceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setProductId(null);
    setVersions([]);
    setSelectedId(null);
    setCompareMode(false);
    setCompareIds([]);
    setStatus("idle");
    setError(null);
  }, []);

  const generate = useCallback(async () => {
    if (!file && !productId) return;
    setStatus("working");
    setError(null);
    try {
      const body = new FormData();
      body.append("templateId", templateId);
      if (artDirection.trim()) body.append("prompt", artDirection.trim());
      // Reuse the cached cutout when we have one (regenerate); else upload.
      if (productId) body.append("productId", productId);
      else if (file) body.append("image", file);

      const res = await fetch("/api/generate", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

      const resp = data as GenerateResponse;
      setProductId(resp.productId);
      const version: Version = {
        versionId: resp.versionId,
        image: resp.image,
        filename: resp.filename,
        createdAt: resp.createdAt,
        cost: resp.cost,
        meta: resp.meta,
      };
      setVersions((prev) => [version, ...prev]);
      setSelectedId(version.versionId);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }, [file, productId, templateId, artDirection]);

  const onThumbClick = useCallback(
    (id: string) => {
      if (compareMode) {
        setCompareIds((prev) => {
          if (prev.includes(id)) return prev.filter((x) => x !== id);
          return [...prev, id].slice(-2);
        });
      } else {
        setSelectedId(id);
      }
    },
    [compareMode],
  );

  const compareVersions = compareIds
    .map((id) => versions.find((v) => v.versionId === id))
    .filter((v): v is Version => Boolean(v));

  const primaryLabel = status === "working"
    ? sceneMode
      ? "Working — generating scene…"
      : "Working — compositing…"
    : hasVersions
      ? "Generate variation"
      : "Generate image";

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

      {/* Step 3: generate / regenerate */}
      <button
        type="button"
        disabled={(!file && !productId) || status === "working"}
        onClick={generate}
        className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {primaryLabel}
      </button>
      {hasVersions && status !== "working" && (
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          Same locked product, new scene — change the background or art direction for a different look.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Result / version history */}
      {selected && (
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">
              {compareMode ? "Compare" : "Result"}
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                Product locked ✓
              </span>
              {versions.length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setCompareMode((m) => !m);
                    setCompareIds(compareMode ? [] : versions.slice(0, 2).map((v) => v.versionId));
                  }}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    compareMode ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  Compare
                </button>
              )}
            </div>
          </div>

          {/* Viewer: single or two-up */}
          {compareMode ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((i) => {
                const v = compareVersions[i];
                return (
                  <div key={i} className="overflow-hidden rounded-xl border border-neutral-200">
                    {v ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.image} alt="Version" className="w-full" />
                        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-neutral-500">
                          <span>{v.meta.templateName}</span>
                          <span>{gbp(v.cost.totalUsd, v.cost.fxGbpPerUsd)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-xs text-neutral-400">
                        Pick a version below
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
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
                <img src={selected.image} alt="Generated product image" className="w-full" />
              </div>

              {/* Cost (Plan §4) */}
              <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-neutral-600">This image cost</span>
                  <span className="text-base font-semibold">
                    {gbp(selected.cost.totalUsd, selected.cost.fxGbpPerUsd)}
                  </span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-500">Breakdown</summary>
                  <ul className="mt-2 space-y-1">
                    {selected.cost.lines.map((l, i) => (
                      <li key={i} className="flex items-baseline justify-between text-xs">
                        <span className="text-neutral-600">
                          {l.label}
                          {l.detail && <span className="text-neutral-400"> · {l.detail}</span>}
                        </span>
                        <span className="tabular-nums text-neutral-700">
                          {gbp(l.usd, selected.cost.fxGbpPerUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] leading-tight text-neutral-400">
                    No margin. Priced from model usage; rates as of {selected.cost.ratesAsOf}. GBP at{" "}
                    {selected.cost.fxGbpPerUsd}/USD (display only). ${selected.cost.totalUsd.toFixed(4)}.
                  </p>
                </details>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <a
                  href={selected.image}
                  download={selected.filename}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Download PNG
                </a>
                <span className="text-right text-xs text-neutral-400">
                  {selected.meta.model && <span>{selected.meta.model} · </span>}
                  {(selected.meta.elapsedMs / 1000).toFixed(1)}s
                  {selected.meta.reusedCutout && <span> · cached cutout</span>}
                </span>
              </div>
            </>
          )}

          {/* Version filmstrip */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Versions ({versions.length})
              </h3>
              {compareMode && (
                <span className="text-[11px] text-neutral-400">tap two to compare</span>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {versions.map((v) => {
                const isSel = compareMode
                  ? compareIds.includes(v.versionId)
                  : v.versionId === selectedId;
                return (
                  <button
                    key={v.versionId}
                    type="button"
                    onClick={() => onThumbClick(v.versionId)}
                    className={`shrink-0 overflow-hidden rounded-lg border text-left transition ${
                      isSel ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"
                    }`}
                    style={{ width: 96 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.image} alt="Version thumbnail" className="h-24 w-24 object-cover" />
                    <div className="px-1.5 py-1">
                      <div className="truncate text-[10px] font-medium text-neutral-700">
                        {v.meta.templateName}
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-neutral-400">
                        <span>{gbp(v.cost.totalUsd, v.cost.fxGbpPerUsd)}</span>
                        <span>{clock(v.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
