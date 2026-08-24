# Gemini Vision → Structured JSON: Research Notes

**Date:** 2026-08-24  
**SDK:** `@google/genai` v2.18.0 (new unified SDK, NOT deprecated `@google/generative-ai`)  
**Primary sources:** GitHub source, ai.google.dev docs, ai.google.dev/pricing

---

## 1. Model Choice: gemini-2.5-flash vs 2.0-flash

**TL;DR: Use `gemini-2.5-flash`. 2.0-flash is dead.**

| | gemini-2.5-flash | gemini-2.0-flash |
|---|---|---|
| Status | ✅ Current | ❌ Deprecated, shut down 2026-06-01 |
| Input (text/image) | $0.30 / 1M tokens | N/A (gone) |
| Output | $2.50 / 1M tokens | N/A (gone) |
| Free tier | Yes | No |
| Image support | Yes | — |

For a small mobile app doing invoice photo extraction: **`gemini-2.5-flash`** is the right call. There is also `gemini-2.5-flash-lite` which is faster/cheaper but may miss fields on low-quality photos — use it only if latency is critical and you validate output carefully.

> Source: [ai.google.dev/pricing](https://ai.google.dev/pricing), [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)

---

## 2. Passing the Image: Inline Base64 vs Files API

### Inline base64 (preferred for mobile invoice photos)

- **Limit:** Total request (text + system instructions + image bytes) must be **< 20MB**
- Invoice photos are typically 1–5MB → inline is fine
- Supported formats: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`

```ts
// Part shape (confirmed from sdk-samples source)
{
  inlineData: {
    mimeType: 'image/jpeg',
    data: base64String,   // Buffer.from(fileBuffer).toString('base64')
  }
}
```

> Source: [ai.google.dev/gemini-api/docs/vision](https://ai.google.dev/gemini-api/docs/vision), [js-genai interactions_multimodal_input_text_and_image_with_generate_content.ts](https://github.com/googleapis/js-genai/blob/main/sdk-samples/interactions_multimodal_input_text_and_image_with_generate_content.ts)

### Files API (for large/reusable files)

- **Limit:** 2 GB per file, 20 GB project total; files expire after **48 hours**
- Recommended when full request exceeds **100 MB**
- For a typical invoice app, inline is simpler and sufficient

```ts
import { createPartFromUri, GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const file = await ai.files.upload({
  file: imageBlob,
  config: { displayName: 'invoice.jpg' },
});
// poll until file.state !== 'PROCESSING'
const part = createPartFromUri(file.uri!, file.mimeType!);
```

> Source: [ai.google.dev/gemini-api/docs/file-prompting-strategies](https://ai.google.dev/gemini-api/docs/file-prompting-strategies), [js-genai generate_content_with_file_upload.ts](https://github.com/googleapis/js-genai/blob/main/sdk-samples/generate_content_with_file_upload.ts)

---

## 3. Forcing Structured JSON: `responseMimeType` + `responseSchema`

In the new `@google/genai` SDK, these go in the **`config`** field of `generateContent`, NOT in `generationConfig` (that was the old `@google/generative-ai` SDK).

Use the `Type` enum from `@google/genai` for schema types.

```ts
import { GoogleGenAI, Type } from '@google/genai';

const config = {
  responseMimeType: 'application/json',
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      buyer: {
        type: Type.OBJECT,
        properties: {
          name:        { type: Type.STRING },
          address:     { type: Type.STRING },
          phoneNumber: { type: Type.STRING },
        },
        required: ['name', 'address', 'phoneNumber'],
      },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            itemName:  { type: Type.STRING },
            itemQty:   { type: Type.NUMBER },
            unitPrice: { type: Type.NUMBER },
          },
          required: ['itemName', 'itemQty', 'unitPrice'],
        },
      },
    },
    required: ['buyer', 'items'],
  },
};
```

> Source: [js-genai generate_content_with_response_schema.ts](https://github.com/googleapis/js-genai/blob/main/sdk-samples/generate_content_with_response_schema.ts) (official SDK sample, confirmed from raw source), [ai.google.dev/gemini-api/docs/migrate](https://ai.google.dev/gemini-api/docs/migrate)

---

## 4. Minimal Working Server Snippet

```ts
import { readFileSync } from 'node:fs';
import { GoogleGenAI, Type } from '@google/genai';

// SDK auto-reads GEMINI_API_KEY; GOOGLE_API_KEY is also accepted
// (sdk-samples use: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function extractInvoice(imagePath: string) {
  const data = readFileSync(imagePath).toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Extract the buyer info and line items from this invoice. Return only the JSON, no explanation.',
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          buyer: {
            type: Type.OBJECT,
            properties: {
              name:        { type: Type.STRING },
              address:     { type: Type.STRING },
              phoneNumber: { type: Type.STRING },
            },
            required: ['name', 'address', 'phoneNumber'],
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                itemName:  { type: Type.STRING },
                itemQty:   { type: Type.NUMBER },
                unitPrice: { type: Type.NUMBER },
              },
              required: ['itemName', 'itemQty', 'unitPrice'],
            },
          },
        },
        required: ['buyer', 'items'],
      },
    },
  });

  return JSON.parse(response.text!);
}
```

**Install:** `bun add @google/genai`  
**Env var:** `GEMINI_API_KEY=your-key` (set in `.env.local`)

---

## 5. Failure / Partial Extraction

When `responseMimeType: 'application/json'` and `responseSchema` are set:

- The model **must** return syntactically valid JSON conforming to the schema. If it cannot, the API returns an error rather than a malformed response.
- **Missing field on the invoice:** The model will return an empty string `""` or `0` for that field — it satisfies the schema but semantically empty. Fields are not omitted even when `required` is set; they get a zero-value instead.
- **Completely unreadable image:** The API may return a `SAFETY` or `OTHER` finish reason with no text. Always check `response.candidates?.[0]?.finishReason`.

**Defensive wrapper:**

```ts
export async function safeExtractInvoice(imagePath: string) {
  const response = await ai.models.generateContent({ /* ... */ });

  const reason = response.candidates?.[0]?.finishReason;
  if (reason && reason !== 'STOP') {
    throw new Error(`Gemini stopped with reason: ${reason}`);
  }

  try {
    return JSON.parse(response.text!);
  } catch {
    throw new Error(`Invalid JSON from model: ${response.text}`);
  }
}
```

> Source: [ai.google.dev/gemini-api/docs/structured-output](https://ai.google.dev/gemini-api/docs/structured-output)

---

## Quick Reference

| Question | Answer |
|---|---|
| SDK package | `@google/genai` (v2.18.0+) |
| Env var | `GEMINI_API_KEY` (also `GOOGLE_API_KEY`) |
| Model | `gemini-2.5-flash` (2.0-flash is shut down) |
| Image inline limit | 20 MB total request |
| Files API limit | 2 GB / file, 48 h TTL |
| Schema location | `config.responseSchema` (NOT `generationConfig`) |
| Schema type helpers | `Type` enum from `@google/genai` |
| Response access | `response.text` → `JSON.parse()` |
