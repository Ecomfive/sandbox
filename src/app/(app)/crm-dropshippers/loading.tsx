import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoDropshippers() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-4 w-72" />
      <div>
        <Skeleton className="h-5 w-40" />
        <div className="mt-3 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-40" />
        <div className="mt-3">
          <SkeletonTable filas={5} columnas={4} />
        </div>
      </div>
    </Pagina>
  );
}
