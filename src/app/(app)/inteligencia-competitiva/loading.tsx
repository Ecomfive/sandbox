import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoInteligenciaCompetitiva() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <SkeletonTable filas={6} columnas={5} />
    </main>
  );
}
