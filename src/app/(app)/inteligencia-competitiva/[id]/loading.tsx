import { Skeleton } from "@/components/ui/skeleton";

export default function CargandoDetalleProveedor() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Skeleton className="h-5 w-64" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </main>
  );
}
