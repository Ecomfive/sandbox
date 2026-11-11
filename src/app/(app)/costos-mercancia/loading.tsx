import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoCostos() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={4} grafica={false} filas={10} columnas={7} />
    </Pagina>
  );
}
