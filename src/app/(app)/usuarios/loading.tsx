import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoUsuarios() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <Skeleton className="h-5 w-48" />
        <div className="mt-3">
          <SkeletonTable filas={4} columnas={4} />
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-40" />
        <div className="mt-3">
          <SkeletonTable filas={4} columnas={5} />
        </div>
      </div>
    </main>
  );
}
