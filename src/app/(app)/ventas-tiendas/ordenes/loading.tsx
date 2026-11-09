import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoOrdenes() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={0} grafica={false} filas={14} columnas={8} />
    </Pagina>
  );
}
