import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonKpiGroup, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoGastos() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-10">
      <div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <SkeletonKpiGroup cantidad={3} />
      <div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-20 w-full rounded-lg" />
      </div>
      <div>
        <Skeleton className="h-5 w-32" />
        <div className="mt-3">
          <SkeletonTable filas={6} columnas={5} />
        </div>
      </div>
    </Pagina>
  );
}
