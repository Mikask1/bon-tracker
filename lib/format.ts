// Integer rupiah formatting: 1500000 -> "Rp 1.500.000"
export function formatRupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
