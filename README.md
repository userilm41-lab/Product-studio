# Cadence Studio

B2B AI product-image tool. A shop owner shoots a product on their phone; we
return a clean, catalog-ready image. **The product itself never changes** —
its original pixels are composited onto the new background by construction.

## Status: M1 — Isolate + composite spine

Upload (phone camera) → background removal (cutout) → composite onto a static
template background → export PNG. No scene generation yet; this proves the
fidelity core end-to-end.

## Run

```bash
npm install        # downloads the bundled segmentation model (~148 MB)
npm run dev        # http://localhost:3002
```

Server binds to **port 3002**.

## Architecture

- `src/lib/engine/types.ts` — swappable `Segmenter` interface.
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
