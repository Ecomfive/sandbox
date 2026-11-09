import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoProductosUE() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={5} filas={12} columnas={9} />
    </Pagina>
  );
}
