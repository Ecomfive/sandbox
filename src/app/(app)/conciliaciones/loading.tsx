import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoConciliaciones() {
  return (
    <Pagina ancho="media">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="mt-2 mb-6 h-4 w-full max-w-lg" />
      <SkeletonTable filas={5} columnas={5} />
    </Pagina>
  );
}
