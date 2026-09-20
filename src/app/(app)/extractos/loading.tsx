import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoExtractos() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-5 w-64" />
        <Skeleton className="mt-2 mb-4 h-4 w-full max-w-md" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <div>
        <Skeleton className="h-5 w-40" />
        <div className="mt-3 flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    </Pagina>
  );
}
