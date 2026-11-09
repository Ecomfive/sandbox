import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoAjustesEstadoResultados() {
  return (
    <Pagina ancho="angosta">
      <CargandoAF4 kpis={0} grafica={false} filas={2} columnas={2} />
    </Pagina>
  );
}
