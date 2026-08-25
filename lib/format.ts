// Integer rupiah formatting: 1500000 -> "Rp 1.500.000"
export function formatRupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

// "Senin, 1 Januari 2026", Indonesian locale, local time.
export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

// Day heading for the ledger list: "Senin, 1 Januari" — the year is dropped in the
// current year, where repeating it on every heading says nothing.
export function formatDayHeading(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return new Intl.DateTimeFormat('id-ID', opts).format(d);
}
