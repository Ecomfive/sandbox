import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoAlertas() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-5 w-64" />
        <Skeleton className="mt-2 mb-4 h-4 w-full max-w-md" />
        <SkeletonTable filas={3} columnas={4} />
      </div>
      <div>
        <Skeleton className="h-5 w-24" />
        <div className="mt-3">
          <SkeletonTable filas={5} columnas={7} />
        </div>
      </div>
    </Pagina>
  );
}
