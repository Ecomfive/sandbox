import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoPlanCompras() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={5} grafica={false} filas={12} columnas={8} />
    </Pagina>
  );
}
