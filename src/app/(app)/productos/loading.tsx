import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoProductos() {
  return (
    <Pagina ancho="ancha">
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-4 h-16 w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </Pagina>
  );
}
