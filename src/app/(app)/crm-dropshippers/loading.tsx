import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoDropshippers() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </Pagina>
  );
}
