---
id: 01
title: "Research: Gemini @google/genai vision extraction contract"
type: research
status: resolved
assignee:
blocked_by: []
blocks: []
---

## Question

Using `@google/genai` (current SDK), how do we send an invoice photo to Gemini and get
back structured invoice data reliably?

Resolve:
- Which model for image → structured extraction (e.g. `gemini-2.0-flash` / `-2.5-flash`)?
  Cost + latency + accuracy for a small mobile app.
- How is the image passed — inline base64 vs Files API? Size limits.
- How to force structured JSON output (responseSchema / responseMimeType) matching our
  target shape: `{ buyer:{name,address,phoneNumber}, items:[{itemName,itemQty,unitPrice}] }`.
- Minimal server-side call (tRPC mutation or route handler) — the SDK init, env key
  (`GOOGLE_GENERATIVE_AI_API_KEY` or similar), and a working snippet.
- Failure/partial-extraction handling: what to do when a field is missing (form stays
  editable — user fixes).

## Answer

See `.wayfinder/research/01-gemini-vision.md`. Model `gemini-2.5-flash` ($0.30/$2.50 per 1M
in/out; 2.0-flash dead as of 2026-06-01; `-lite` if latency > accuracy). Image = inline
base64 `{ inlineData:{ mimeType, data } }` (fine < 20MB request → all invoice photos).
Structured JSON via **`config`** (not old `generationConfig`):
`config:{ responseMimeType:'application/json', responseSchema:{ type:Type.OBJECT, ... } }`,
`Type` from `@google/genai`. Env `GEMINI_API_KEY`. With responseSchema the model returns
valid JSON (missing invoice fields → zero-values `""`/`0`, not omitted); check
`candidates[0].finishReason` for SAFETY/OTHER on unreadable images. Full snippet in file.
