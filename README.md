# Cadence Studio

B2B AI product-image tool. A shop owner shoots a product on their phone; we
return a clean, catalog-ready image. **The product itself never changes** —
its original pixels are composited onto the new background by construction.

## Status: M4 — Regenerate + version history

The product is segmented once and the cutout cached by `productId`; regenerate
re-runs only the scene, so it's ~7× faster (skips segmentation) and the product
is byte-identical across versions — it provably cannot drift. The UI keeps a
version filmstrip (thumbnail, template, cost, time) with select, download, and
side-by-side compare. Cache is in-memory for now; moves to object storage in M6.

## Earlier: M3 — Transparent cost metering

Every generation reports its **true, margin-free cost**, computed from the
model's reported token usage against a versioned rates config
(`src/lib/pricing/`) — never a hardcoded per-image number. The UI shows
"This image cost £X" with an expandable per-step breakdown. Static templates
cost ~£0 (local only); a `gpt-image-2` medium scene ≈ £0.04.

## Earlier: M2 — Studio-mode scene generation

Two paths, both preserving the product by construction:

- **Static templates** (M1): composite onto a solid/gradient background —
  instant, offline, marketplace-safe.
- **Scene templates** (M2, "AI" badge): GPT Image generates an *empty* scene
  from an orchestrated prompt, then the original product cutout is composited
  onto it. The model never paints the product.

Pipeline: upload → isolate (cutout) → [prompt orchestration → GPT scene] →
composite original pixels → export 2048px PNG.

## Run

```bash
npm install        # downloads the bundled segmentation model (~148 MB)
# Scene templates need an OpenAI key in .env.local:
#   OPENAI_API_KEY=sk-...
#   SCENE_MODEL=gpt-image-2   SCENE_QUALITY=medium   SCENE_SIZE=1024x1024  (optional overrides)
npm run dev        # http://localhost:3002
```

Server binds to **port 3002**. Without a key, static templates still work; scene
templates return a 503.

## Architecture

- `src/lib/engine/types.ts` — swappable `Segmenter` / `SceneGenerator`
  interfaces + normalised `ImageUsage` (for M3 cost metering).
- `src/lib/engine/scene.ts` — GPT Image scene generator (OpenAI); model is
  config, captures usage tokens.
- `src/lib/engine/prompt.ts` — prompt orchestration (empty-scene guard + owner
  art direction).
- `src/lib/engine/segment.ts` — local ONNX background removal (offline). A
  hosted BiRefNet/RMBG-2.0 impl can drop in behind the same interface.
- `src/lib/engine/composite.ts` — **fidelity core**: pastes the original
  product cutout onto a freshly built background.
- `src/lib/templates.ts` — M1 static-background templates (become
  generated-scene seeds in M2).
- `src/app/api/generate/route.ts` — `POST` upload+templateId → PNG.
- `src/app/page.tsx` — mobile-first capture/upload UI.

## Next phases

M2 scene generation (GPT Image) · M3 cost metering · M4 regenerate + versions ·
M5 relight + detail restore + shadows · M6 B2B layer · M7 fast mode + model A/B.
See `incoming/PLAN-product-studio.md`.
