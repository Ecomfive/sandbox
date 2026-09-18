import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoConciliaciones() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="mt-2 mb-6 h-4 w-full max-w-lg" />
      <SkeletonTable filas={5} columnas={5} />
    </main>
  );
}
