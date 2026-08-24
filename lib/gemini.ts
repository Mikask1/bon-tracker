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
  },
  required: ['buyer', 'items', 'grandTotal'],
};

const PROMPT =
  'Ini foto sebuah nota/invoice penjualan toko. Ekstrak data pembeli ' +
  '(nama, alamat, nomor telepon) dan daftar barang (nama barang, jumlah/qty, ' +
  'harga satuan dalam rupiah sebagai bilangan bulat tanpa titik). ' +
  'Diskon/potongan harga dimasukkan sebagai baris barang tersendiri dengan ' +
  'harga satuan NEGATIF (mis. potongan Rp5.000 → unitPrice -5000). ' +
  'Pajak (PPN) dan biaya tambahan/surcharge lain juga dimasukkan sebagai baris ' +
  'barang tersendiri dengan harga positif. ' +
  'Ekstrak juga grandTotal: total keseluruhan yang TERTERA di nota sebagai ' +
  'bilangan bulat rupiah (bukan hasil hitunganmu — baca angka totalnya). ' +
  'Jika suatu field tidak terbaca, kembalikan string kosong atau 0. ' +
  'Kembalikan HANYA JSON dengan bentuk {"buyer":{"name","address","phoneNumber"},' +
  'PASTIKAN JUMLAH SEMUA ITEM SESUAI DENGAN GRANDTOTAL YANG TERTERA' +
  '"items":[{"itemName","itemQty","unitPrice"}],"grandTotal":0}, tanpa penjelasan.';

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
