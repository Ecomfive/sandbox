import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function Cargando() {
  return (
    <Pagina ancho="media">
      <CargandoAF4 kpis={0} grafica={false} filas={8} columnas={5} />
    </Pagina>
  );
}
