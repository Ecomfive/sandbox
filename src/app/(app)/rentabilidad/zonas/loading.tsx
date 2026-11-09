import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoZonasUE() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={5} filas={10} columnas={9} />
    </Pagina>
  );
}
