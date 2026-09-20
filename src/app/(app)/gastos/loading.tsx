import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonKpiGroup, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoGastos() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-4 w-72" />
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
