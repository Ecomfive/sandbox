import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoCierreDelMes() {
  return (
    <Pagina ancho="media">
      <CargandoAF4 kpis={4} grafica={false} filas={11} columnas={3} />
    </Pagina>
  );
}
