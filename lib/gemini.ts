import { GoogleGenAI, Type } from '@google/genai';
import type { ExtractedInvoice } from '@/types/invoice';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  },
  required: ['buyer', 'items'],
};

// Extract buyer + line items from an invoice photo. Online-only.
export async function extractInvoice(
  base64: string,
  mimeType: string
): Promise<ExtractedInvoice> {
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Ini foto sebuah nota/invoice penjualan toko. Ekstrak data pembeli ' +
              '(nama, alamat, nomor telepon) dan daftar barang (nama barang, jumlah/qty, ' +
              'harga satuan dalam rupiah sebagai bilangan bulat tanpa titik). ' +
              'Jika suatu field tidak terbaca, kembalikan string kosong atau 0. ' +
              'Kembalikan hanya JSON.',
          },
          { inlineData: { mimeType, data: base64 } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const reason = res.candidates?.[0]?.finishReason;
  if (reason && reason !== 'STOP') {
    throw new Error(`Gemini berhenti: ${reason} (foto mungkin tidak terbaca)`);
  }
  return JSON.parse(res.text!) as ExtractedInvoice;
}
