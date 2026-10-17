/** Sin la migración 0112 no hay de dónde leer los puestos: se avisa en una caja neutra con su punto ámbar. */
export function AvisoSinMigracion() {
  return (
    <p role="status" className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-3 text-sm">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
      Falta correr la migración 0112 (Puestos) en Supabase.
    </p>
  );
}
