import { GoogleGenAI, Type } from '@google/genai';
import type { ExtractedInvoice } from '@/types/invoice';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Free tier has PER-MODEL rate limits — try newest first, fall through to older,
// then the lite variants, then Gemma, on any failure (429 / unavailable / etc).
const MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview', // no stable "gemini-3-flash"; preview is the 3.0 flash
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
];

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    buyer: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        address: { type: Type.STRING },
        phoneNumber: { type: Type.STRING },
      },
      required: ['name', 'address', 'phoneNumber'],
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          itemName: { type: Type.STRING },
          itemQty: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER },
        },
        required: ['itemName', 'itemQty', 'unitPrice'],
      },
    },
    // Printed grand total on the nota — reconciliation only, never persisted.
    grandTotal: { type: Type.NUMBER },
    // Date printed on the nota, yyyy-mm-dd. Empty string if not present/unreadable.
    invoiceDate: { type: Type.STRING },
    // true if the nota shows a LUNAS/PAID stamp or marking; false otherwise.
    fullyPaid: { type: Type.BOOLEAN },
  },
  required: ['buyer', 'items', 'grandTotal', 'invoiceDate', 'fullyPaid'],
};

const PROMPT =
  'This is a photo of a store sales receipt/invoice. Extract the buyer details ' +
  '(name, address, phone number) and the list of items (item name, quantity, ' +
  'unit price in rupiah as a whole number with no separators). ' +
  'Put any discount as its own line item with a NEGATIVE unit price ' +
  '(e.g. a Rp5,000 discount -> unitPrice -5000). ' +
  'Put taxes (PPN) and any other surcharges as their own line items with a positive price. ' +
  'Also extract grandTotal: the overall total PRINTED on the receipt as a whole ' +
  'rupiah number (read the printed figure, do not compute it yourself). ' +
  'Make sure the sum of all line items equals the printed grandTotal. ' +
  'Also extract invoiceDate: the date printed on the receipt in yyyy-mm-dd format ' +
  '(empty string if there is none). Indonesian receipts usually print the date as ' +
  'DD-MM-YYYY or DD/MM/YYYY — convert it to yyyy-mm-dd. ' +
  'Also detect fullyPaid: true if the receipt shows a LUNAS (or PAID) stamp/marking, ' +
  'false if there is no such stamp. ' +
  'If a field is unreadable, return an empty string or 0. ' +
  'Return ONLY JSON of the shape {"buyer":{"name","address","phoneNumber"},"items":' +
  '[{"itemName","itemQty","unitPrice"}],"grandTotal":0,"invoiceDate":"","fullyPaid":false}, ' +
  'with no explanation.';

// Per-model config: Gemma has no structured output; Gemini 3.x uses thinkingLevel
// (minimal), Gemini 2.5 uses thinkingBudget (0). Sending both to a 3.x model errors.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildConfig(model: string): any {
  if (model.startsWith('gemma')) return undefined;
  const cfg: any = { responseMimeType: 'application/json', responseSchema };
  cfg.thinkingConfig = model.startsWith('gemini-3')
    ? { thinkingLevel: 'MINIMAL' }
    : { thinkingBudget: 0 };
  return cfg;
}

// Gemma doesn't support responseSchema; parse JSON out of its text instead.
function parseJson(text: string): ExtractedInvoice {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  return JSON.parse(cleaned) as ExtractedInvoice;
}

export async function extractInvoice(
  base64: string,
  mimeType: string
): Promise<ExtractedInvoice> {
  let lastErr: unknown;

  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64 } }],
          },
        ],
        config: buildConfig(model),
      });

      const reason = res.candidates?.[0]?.finishReason;
      if (reason && reason !== 'STOP') {
        throw new Error(`finishReason ${reason}`);
      }
      if (!res.text) throw new Error('empty response');
      return parseJson(res.text);
    } catch (e) {
      lastErr = e;
      // next model (rate-limited, unavailable, or unparseable) — keep trying
    }
  }

  throw new Error(
    `Semua model gagal. Terakhir: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}
