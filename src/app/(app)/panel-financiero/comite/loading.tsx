import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoComite() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={7} grafica={false} filas={7} columnas={11} />
    </Pagina>
  );
}
