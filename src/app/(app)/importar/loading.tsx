import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoImportar() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={0} grafica={false} filas={0} />
    </Pagina>
  );
}
