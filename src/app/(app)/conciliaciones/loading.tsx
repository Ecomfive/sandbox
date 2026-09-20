import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoConciliaciones() {
  return (
    <Pagina ancho="media">
      <Skeleton className="mb-4 h-4 w-full max-w-lg" />
      <SkeletonTable filas={5} columnas={5} />
    </Pagina>
  );
}
