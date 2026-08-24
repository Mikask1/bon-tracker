export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">Sedang offline</h1>
      <p className="text-sm text-muted-foreground">
        Halaman ini belum tersimpan. Invoice yang sudah dimuat tetap bisa dilihat,
        dan invoice baru akan tersinkron saat online kembali.
      </p>
    </div>
  );
}
