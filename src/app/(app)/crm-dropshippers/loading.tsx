import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoDropshippers() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div>
        <Skeleton className="h-5 w-40" />
        <div className="mt-3 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-40" />
        <div className="mt-3">
          <SkeletonTable filas={5} columnas={4} />
        </div>
      </div>
    </main>
  );
}
