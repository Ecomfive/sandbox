import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoLibro() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={2} grafica={false} filas={10} columnas={7} />
    </Pagina>
  );
}
