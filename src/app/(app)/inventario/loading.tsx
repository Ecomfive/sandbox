import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoInventario() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-3">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </Pagina>
  );
}
