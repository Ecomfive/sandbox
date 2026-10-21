import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoPublicacionesDropi() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-5 w-56" />
      <SkeletonTable filas={10} columnas={8} />
    </Pagina>
  );
}
