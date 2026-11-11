import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoPresupuestoDetalle() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={6} grafica={false} filas={10} columnas={14} />
    </Pagina>
  );
}
