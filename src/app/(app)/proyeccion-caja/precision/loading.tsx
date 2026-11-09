import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoPrecision() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={4} grafica={false} filas={12} columnas={6} />
    </Pagina>
  );
}
