import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoPaquete() {
  return (
    <Pagina ancho="media">
      <CargandoAF4 kpis={4} grafica={false} filas={14} columnas={3} />
    </Pagina>
  );
}
