import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoWmsUbicaciones() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-5 w-48" />
      <SkeletonTable filas={6} columnas={5} />
    </Pagina>
  );
}
