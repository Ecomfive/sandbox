import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoCohortes() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={6} grafica={false} filas={8} columnas={11} />
    </Pagina>
  );
}
