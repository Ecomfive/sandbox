import { Skeleton, SkeletonKpiGrid, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoRetiros() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div>
        <Skeleton className="h-5 w-32" />
        <div className="mt-3">
          <SkeletonKpiGrid cantidad={4} />
        </div>
        <Skeleton className="mt-4 h-20 w-full rounded-lg" />
      </div>
      <div>
        <Skeleton className="h-5 w-32" />
        <div className="mt-3">
          <SkeletonTable filas={5} columnas={5} />
        </div>
      </div>
    </main>
  );
}
