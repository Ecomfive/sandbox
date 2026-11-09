import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function Cargando() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={4} grafica={false} filas={8} columnas={4} />
    </Pagina>
  );
}
