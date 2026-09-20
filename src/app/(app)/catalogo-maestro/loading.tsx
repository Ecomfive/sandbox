import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonKpiGroup, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoCatalogoMaestro() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <SkeletonKpiGroup cantidad={3} />
      <SkeletonTable filas={5} columnas={6} />
    </Pagina>
  );
}
