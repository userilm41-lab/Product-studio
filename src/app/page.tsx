"use client";

import { useCallback, useRef, useState } from "react";
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from "@/lib/templates";

type Status = "idle" | "working" | "done" | "error";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [status, setStatus] = useState<Status>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setSourceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setResultUrl(null);
    setStatus("idle");
    setError(null);
    setElapsedMs(null);
  }, []);

  const generate = useCallback(async () => {
    if (!file) return;
    setStatus("working");
    setError(null);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("templateId", templateId);
      const res = await fetch("/api/generate", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setElapsedMs(Number(res.headers.get("X-Generation-Ms")) || null);
      const blob = await res.blob();
      setResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }, [file, templateId]);

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
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-neutral-700">Background</h2>
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATES.map((t) => {
            const active = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-neutral-900 ring-1 ring-neutral-900"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">
                  {t.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 3: generate */}
      <button
        type="button"
        disabled={!file || status === "working"}
        onClick={generate}
        className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === "working" ? "Working — isolating & compositing…" : "Generate image"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Result */}
      {resultUrl && status === "done" && (
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
            <img src={resultUrl} alt="Generated product image" className="w-full" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <a
              href={resultUrl}
              download="cadence-studio.png"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Download PNG
            </a>
            {elapsedMs != null && (
              <span className="text-xs text-neutral-400">{(elapsedMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
