import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoMotivos() {
  return (
    <Pagina ancho="media" className="flex flex-col gap-4">
      <Skeleton className="h-6 w-96 max-w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </Pagina>
  );
}
