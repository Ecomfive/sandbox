import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoInventario() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 mb-4 h-4 w-full max-w-md" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <SkeletonTable filas={6} columnas={5} />
    </Pagina>
  );
}
