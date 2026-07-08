"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  isSceneTemplate,
  type Template,
} from "@/lib/templates";

type Status = "idle" | "working" | "done" | "error";
type Quality = "draft" | "standard" | "high";
type Finish = "ai" | "instant";

// Hints from measured renders (standard ~£0.05/45s, high ~£0.17/2min).
const QUALITY_OPTIONS: { id: Quality; label: string; hint: string }[] = [
  { id: "draft", label: "Draft", hint: "fast · ~£0.01" },
  { id: "standard", label: "Standard", hint: "~45s · ~£0.05" },
  { id: "high", label: "High", hint: "best · ~2min · ~£0.17" },
];

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
  finish?: Finish;
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

/** Poll payload from /api/generation/:id (also the 202 shape from POST). */
interface GenerationStatus {
  versionId: string;
  productId: string;
  status: "processing" | "done" | "error";
  error?: string | null;
  createdAt: string;
  image?: string | null;
  filename?: string;
  cost?: Cost | null;
  meta?: VersionMeta;
}

const EMPTY_COST: Cost = {
  totalUsd: 0,
  totalGbpPence: 0,
  lines: [],
  ratesAsOf: "",
  fxGbpPerUsd: 0.79,
};

function gbp(usd: number, fx: number): string {
  const value = usd * fx;
  if (value === 0) return "free";
  return value >= 1 ? `£${value.toFixed(2)}` : `£${value.toFixed(3)}`;
}
function clock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** CSS background matching the template's static backdrop, for swatch dots. */
function swatchStyle(t: Template): React.CSSProperties {
  if (t.background.kind === "solid")
    return { background: t.background.color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" };
  const { from, to, angle } = t.background;
  return {
    background: `linear-gradient(${angle}deg, ${from}, ${to})`,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
  };
}

/** One version thumbnail — shared by the desktop rail and the mobile strip. */
function VersionThumb({
  v,
  isSel,
  onClick,
}: {
  v: Version;
  isSel: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${v.meta.templateName} · ${gbp(v.cost.totalUsd, v.cost.fxGbpPerUsd)} · ${clock(v.createdAt)}`}
      className={`relative shrink-0 overflow-hidden rounded-xl transition ${
        isSel
          ? "ring-2 ring-neutral-900 ring-offset-2 ring-offset-[#f7f6f4]"
          : "ring-1 ring-black/[0.06] hover:ring-neutral-300"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={v.image} alt="Version thumbnail" className="h-20 w-20 object-cover" />
      {v.meta.mode === "ai" && (
        <span className="absolute right-1 top-1 rounded-full bg-white/85 px-1 text-[9px] shadow-sm">
          ✨
        </span>
      )}
    </button>
  );
}

/** Itemised cost — styled like a till receipt. */
function Receipt({ v }: { v: Version | null }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.08)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        Receipt
      </p>
      {v ? (
        <>
          <p className="mt-1.5 text-sm font-medium text-neutral-800">{v.meta.templateName}</p>
          <p className="text-[11px] text-neutral-400">
            {clock(v.createdAt)} · {v.meta.mode === "ai" ? "✨ AI Studio" : "⚡ Exact"}
            {v.meta.model && <> · {v.meta.model}</>}
          </p>

          <ul className="mt-3 space-y-2 border-t border-dashed border-neutral-200 pt-3">
            {v.cost.lines.map((l, i) => (
              <li key={i} className="text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-neutral-600">{l.label}</span>
                  <span className="tabular-nums text-neutral-700">
                    {gbp(l.usd, v.cost.fxGbpPerUsd)}
                  </span>
                </div>
                {l.detail && <p className="text-[10px] text-neutral-400">{l.detail}</p>}
              </li>
            ))}
            {v.cost.lines.length === 0 && (
              <li className="text-[11px] text-neutral-400">No model calls — free.</li>
            )}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-neutral-200 pt-2.5">
            <span className="text-sm font-semibold text-neutral-900">Total</span>
            <span className="text-sm font-semibold tabular-nums text-neutral-900">
              {gbp(v.cost.totalUsd, v.cost.fxGbpPerUsd)}
            </span>
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-neutral-400">
            No margin — priced from model usage.
            {v.cost.ratesAsOf && <> Rates as of {v.cost.ratesAsOf}.</>} GBP at{" "}
            {v.cost.fxGbpPerUsd}/USD (display only). ${v.cost.totalUsd.toFixed(4)} ·{" "}
            {(v.meta.elapsedMs / 1000).toFixed(1)}s
            {v.meta.reusedCutout && <> · cached cutout</>}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          Each render is itemised here — model tokens, processing, total. No margin.
        </p>
      )}
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [artDirection, setArtDirection] = useState("");
  const [quality, setQuality] = useState<Quality>("standard");
  const [finish, setFinish] = useState<Finish>("ai");
  const [elapsed, setElapsed] = useState(0);
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
  const aiPass = finish === "ai" || sceneMode; // will a model render run?

  // Tick an elapsed counter while generating so a long render doesn't feel hung.
  useEffect(() => {
    if (status !== "working") return;
    setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 250);
    return () => clearInterval(t);
  }, [status]);
  const selected = versions.find((v) => v.versionId === selectedId) ?? null;

  const pickFile = useCallback((f: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    // New photo = new product: reset the locked source and version history.
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
      body.append("finish", finish);
      if (aiPass) body.append("quality", quality);
      if (artDirection.trim()) body.append("prompt", artDirection.trim());
      // Reuse the stored product photo when we have one (regenerate); else upload.
      if (productId) body.append("productId", productId);
      else if (file) body.append("image", file);

      const res = await fetch("/api/generate", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as GenerationStatus & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setProductId(data.productId);

      // The render runs server-side in the background (long renders outlive
      // proxy timeouts) — poll until it lands. Transient poll failures are
      // ignored; the render itself is unaffected by them.
      let result: GenerationStatus = data;
      const deadline = Date.now() + 5 * 60_000;
      while (result.status === "processing" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          const poll = await fetch(`/api/generation/${data.versionId}`);
          if (poll.ok) result = (await poll.json()) as GenerationStatus;
        } catch {
          /* transient network error — keep polling */
        }
      }
      if (result.status === "error") throw new Error(result.error ?? "Generation failed.");
      if (result.status !== "done" || !result.image) {
        throw new Error("The render is taking unusually long — check versions in a minute.");
      }

      const version: Version = {
        versionId: result.versionId,
        image: result.image,
        filename: result.filename ?? "product.png",
        createdAt: result.createdAt,
        cost: result.cost ?? EMPTY_COST,
        meta: result.meta ?? {
          mode: "ai",
          model: null,
          elapsedMs: 0,
          reusedCutout: false,
          templateId,
          templateName: "",
          artDirection: null,
        },
      };
      setVersions((prev) => [version, ...prev]);
      setSelectedId(version.versionId);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }, [file, productId, templateId, artDirection, quality, finish, aiPass]);

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

  const working = status === "working";

  const versionsHeader = (
    <div className="flex items-center justify-between">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        Versions · {versions.length}
      </h2>
      {versions.length >= 2 && (
        <button
          type="button"
          onClick={() => {
            setCompareMode((m) => !m);
            setCompareIds(compareMode ? [] : versions.slice(0, 2).map((v) => v.versionId));
          }}
          className={`text-[11px] font-medium transition ${
            compareMode ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-700"
          }`}
        >
          {compareMode ? "Done" : "Compare"}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* ── Top bar ── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pb-2 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-[13px] text-white">
            ✦
          </div>
          <span className="text-[15px] font-semibold tracking-tight">ILM Product Studio</span>
        </div>
        <span className="text-xs text-neutral-400">AI product photography</span>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20 pt-4">
        <div className="lg:grid lg:grid-cols-[96px_minmax(0,1fr)_248px] lg:items-start lg:gap-5">
          {/* ── Left rail: versions (desktop) ── */}
          <aside className="hidden lg:block">
            {versions.length > 0 && (
              <>
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  Versions · {versions.length}
                </h2>
                {versions.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompareMode((m) => !m);
                      setCompareIds(
                        compareMode ? [] : versions.slice(0, 2).map((v) => v.versionId),
                      );
                    }}
                    className={`mt-1 text-[11px] font-medium transition ${
                      compareMode ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-700"
                    }`}
                  >
                    {compareMode ? "✕ Done" : "Compare"}
                  </button>
                )}
                {compareMode && (
                  <p className="mt-1 text-[10px] leading-tight text-neutral-400">
                    tap two to compare
                  </p>
                )}
                <div className="mt-2.5 flex max-h-[70vh] flex-col gap-2 overflow-y-auto pb-1 pr-1">
                  {versions.map((v) => (
                    <VersionThumb
                      key={v.versionId}
                      v={v}
                      isSel={
                        compareMode
                          ? compareIds.includes(v.versionId)
                          : v.versionId === selectedId
                      }
                      onClick={() => onThumbClick(v.versionId)}
                    />
                  ))}
                </div>
              </>
            )}
          </aside>

          {/* ── Centre: canvas + command bar ── */}
          <div className="lg:col-start-2">
            <div className="relative overflow-hidden rounded-3xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-16px_rgba(0,0,0,0.08)]">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />

              {compareMode && compareVersions.length > 0 ? (
                /* Two-up compare inside the canvas */
                <div className="grid h-[56vh] min-h-[380px] grid-cols-2 divide-x divide-neutral-100">
                  {[0, 1].map((i) => {
                    const v = compareVersions[i];
                    return (
                      <div key={i} className="relative flex items-center justify-center p-4">
                        {v ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={v.image}
                              alt="Version"
                              className="max-h-full max-w-full rounded-xl object-contain"
                            />
                            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-neutral-600 shadow-sm ring-1 ring-black/5 backdrop-blur">
                              {v.meta.templateName} · {gbp(v.cost.totalUsd, v.cost.fxGbpPerUsd)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-neutral-400">
                            Pick a second version
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : selected || sourceUrl ? (
                <div className="relative flex h-[56vh] min-h-[380px] items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected ? selected.image : sourceUrl!}
                    alt={selected ? "Generated product image" : "Your product photo"}
                    className={`max-h-full max-w-full object-contain transition ${
                      working ? "opacity-30 blur-[1px]" : ""
                    } ${selected ? "" : "p-6"}`}
                  />

                  {/* Rendering overlay */}
                  {working && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
                      <span className="text-sm font-medium text-neutral-700">
                        {aiPass ? "Rendering" : "Compositing"}… {elapsed}s
                      </span>
                      {aiPass && (
                        <span className="text-[11px] text-neutral-400">
                          {quality === "draft"
                            ? "drafts take a few seconds"
                            : quality === "high"
                              ? "~2 minutes, worth it"
                              : "~30–60s, worth it"}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Ready hint before the first render */}
                  {!selected && !working && (
                    <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/85 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm backdrop-blur">
                      Ready — press Generate
                    </span>
                  )}

                  {/* Source chip / swap */}
                  {sourceUrl && !working && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="group absolute left-3 top-3 flex items-center gap-2 rounded-xl bg-white/90 p-1 pr-2.5 shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-white"
                      title="Use a different photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sourceUrl} alt="Source" className="h-8 w-8 rounded-lg object-cover" />
                      <span className="text-[11px] font-medium text-neutral-500 group-hover:text-neutral-800">
                        Change
                      </span>
                    </button>
                  )}

                  {/* Fidelity badge + download */}
                  {selected && !working && (
                    <>
                      <span
                        className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm ring-1 ring-black/5 backdrop-blur ${
                          selected.meta.mode === "ai"
                            ? "bg-white/90 text-violet-700"
                            : "bg-white/90 text-emerald-700"
                        }`}
                      >
                        {selected.meta.mode === "ai" ? "✨ AI render" : "Pixel-exact ✓"}
                      </span>
                      <a
                        href={selected.image}
                        download={selected.filename}
                        className="absolute bottom-3 right-3 rounded-full bg-neutral-900 px-3.5 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-neutral-700"
                      >
                        Download
                      </a>
                    </>
                  )}
                </div>
              ) : (
                /* Empty state: dropzone */
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    pickFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className={`flex h-[56vh] min-h-[380px] w-full flex-col items-center justify-center gap-3 transition ${
                    dragOver ? "bg-neutral-50" : "hover:bg-neutral-50/60"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-xl">
                    📷
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-neutral-800">Drop a product photo</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      or click to shoot / browse — any angle, any background
                    </p>
                  </div>
                </button>
              )}
            </div>

            {/* ── Command bar ── */}
            <div className="mt-4 rounded-2xl bg-white p-2 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.10)]">
              <div className="flex items-center gap-2 px-2 pt-1">
                <input
                  type="text"
                  value={artDirection}
                  onChange={(e) => setArtDirection(e.target.value)}
                  disabled={!aiPass}
                  placeholder={
                    aiPass
                      ? "Describe the look — optional, e.g. warmer light, shot slightly from above"
                      : "Art direction applies to AI renders"
                  }
                  className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-neutral-800 placeholder-neutral-400 outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={(!file && !productId) || working}
                  onClick={generate}
                  className="shrink-0 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {working ? `${elapsed}s…` : "Generate"}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 px-1 pb-1 pt-2.5">
                {/* Background chips */}
                {TEMPLATES.map((t) => {
                  const active = t.id === templateId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      title={t.description}
                      className={`flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-xs font-medium transition ${
                        active
                          ? "bg-neutral-900 text-white"
                          : "text-neutral-600 ring-1 ring-inset ring-neutral-200 hover:ring-neutral-300"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full" style={swatchStyle(t)} />
                      {t.name}
                    </button>
                  );
                })}

                <span className="mx-1 h-4 w-px bg-neutral-200" />

                {/* Finish toggle */}
                <div className="flex rounded-full bg-neutral-100 p-0.5">
                  {(
                    [
                      { id: "ai", label: "✨ AI Studio" },
                      { id: "instant", label: "⚡ Exact" },
                    ] as { id: Finish; label: string }[]
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFinish(f.id)}
                      title={
                        f.id === "ai"
                          ? "Re-shoots your photo — clean edges, real lighting & shadows"
                          : "Free local cutout — pixel-exact product, rougher edges"
                      }
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        finish === f.id
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Quality (only when a model render will run) */}
                {aiPass && (
                  <div className="flex rounded-full bg-neutral-100 p-0.5">
                    {QUALITY_OPTIONS.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setQuality(q.id)}
                        title={q.hint}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          quality === q.id
                            ? "bg-white text-neutral-900 shadow-sm"
                            : "text-neutral-500 hover:text-neutral-700"
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          {/* ── Right rail: receipt (desktop) ── */}
          <aside className="hidden lg:block">
            <Receipt v={compareMode ? null : selected} />
          </aside>
        </div>

        {/* ── Phone: versions strip + receipt at the bottom ── */}
        <div className="mt-6 space-y-5 lg:hidden">
          {versions.length > 0 && (
            <section>
              {versionsHeader}
              {compareMode && (
                <p className="mt-1 text-[11px] text-neutral-400">tap two to compare</p>
              )}
              <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
                {versions.map((v) => (
                  <VersionThumb
                    key={v.versionId}
                    v={v}
                    isSel={
                      compareMode ? compareIds.includes(v.versionId) : v.versionId === selectedId
                    }
                    onClick={() => onThumbClick(v.versionId)}
                  />
                ))}
              </div>
            </section>
          )}
          {selected && !compareMode && <Receipt v={selected} />}
        </div>
      </main>
    </div>
  );
}
