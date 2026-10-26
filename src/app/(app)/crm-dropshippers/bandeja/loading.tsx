import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoBandeja() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <Skeleton className="h-10 w-72 rounded-lg" />
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)_280px]">
        <Skeleton className="h-[640px] w-full rounded-l-xl" />
        <Skeleton className="h-[640px] w-full" />
        <Skeleton className="h-[640px] w-full rounded-r-xl" />
      </div>
    </Pagina>
  );
}
