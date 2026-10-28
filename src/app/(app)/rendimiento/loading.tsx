import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoRendimiento() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-9 w-80" />
      <SkeletonTable filas={6} columnas={7} />
    </Pagina>
  );
}
