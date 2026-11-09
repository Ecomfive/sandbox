import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoMarketing() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={4} filas={6} columnas={8} />
    </Pagina>
  );
}
