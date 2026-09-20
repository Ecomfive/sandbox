import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonKpiGroup, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoRetiros() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-[3_1_39rem]">
          <SkeletonKpiGroup cantidad={4} />
        </div>
        <div className="min-w-0 flex-[2_1_39rem]">
          <SkeletonKpiGroup cantidad={3} />
        </div>
      </div>
      <div>
        <div className="flex justify-end">
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
        <div className="mt-3">
          <SkeletonTable filas={5} columnas={5} />
        </div>
      </div>
    </Pagina>
  );
}
