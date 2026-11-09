import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoNomina() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={4} filas={12} columnas={8} />
    </Pagina>
  );
}
