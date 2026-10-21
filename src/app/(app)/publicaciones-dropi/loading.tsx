import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoPublicacionesDropi() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        ))}
      </div>
    </Pagina>
  );
}
