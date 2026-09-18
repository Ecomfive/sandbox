import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoInventario() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 mb-4 h-4 w-full max-w-md" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <SkeletonTable filas={6} columnas={5} />
    </main>
  );
}
