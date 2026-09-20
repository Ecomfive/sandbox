import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoInteligenciaCompetitiva() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-8">
      <div>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <SkeletonTable filas={6} columnas={5} />
    </Pagina>
  );
}
