import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoDetalleProveedor() {
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <Skeleton className="h-5 w-64" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </Pagina>
  );
}
