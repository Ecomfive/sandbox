import { Pagina } from "@/components/ui/pagina";
import { SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoProductosTest() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <SkeletonTable filas={10} columnas={8} />
    </Pagina>
  );
}
