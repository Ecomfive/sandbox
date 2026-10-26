import { Pagina } from "@/components/ui/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoDropshippers() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-[480px] w-full rounded-xl" />
    </Pagina>
  );
}
