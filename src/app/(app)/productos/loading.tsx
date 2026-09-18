import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoProductos() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="mt-2 mb-6 h-4 w-72" />
      <Skeleton className="mb-4 h-16 w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
