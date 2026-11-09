import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function Cargando() {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <CargandoAF4 kpis={5} grafica filas={10} columnas={8} />
    </Pagina>
  );
}
