import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoBalanceGeneral() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={4} grafica={false} filas={16} columnas={7} />
    </Pagina>
  );
}
