import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonKpiGroup, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoPedidosDropi() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-4 w-80" />
      <SkeletonKpiGroup cantidad={4} />
      <SkeletonTable filas={8} columnas={6} />
    </Pagina>
  );
}
