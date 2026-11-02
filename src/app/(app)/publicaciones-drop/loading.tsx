import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoPublicacionesDrop() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </Pagina>
  );
}
