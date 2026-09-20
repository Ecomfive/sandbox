import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonKpiGrid } from "@/components/ui/skeleton";

export default function CargandoDashboard() {
  return (
    <Pagina ancho="ancha">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>
      <div className="mt-6">
        <SkeletonKpiGrid cantidad={5} />
      </div>
      <Skeleton className="mt-6 h-[420px] w-full" />
    </Pagina>
  );
}
