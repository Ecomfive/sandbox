import { Pagina } from "@/components/ui/pagina";
import { SkeletonTable } from "@/components/ui/skeleton";

export default function CargandoCasos() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <SkeletonTable filas={8} columnas={7} />
    </Pagina>
  );
}
