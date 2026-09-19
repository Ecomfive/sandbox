import { Skeleton, SkeletonKpiGroup, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoPedidosDropi() {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-8 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-64 rounded-md" />
      </div>
      <SkeletonKpiGroup cantidad={4} />
      <SkeletonTable filas={8} columnas={6} />
    </main>
  );
}
