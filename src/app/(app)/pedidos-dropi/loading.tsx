import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonKpiGroup, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoPedidosDropi() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-64 rounded-md" />
      </div>
      <SkeletonKpiGroup cantidad={4} />
      <SkeletonTable filas={8} columnas={6} />
    </Pagina>
  );
}
