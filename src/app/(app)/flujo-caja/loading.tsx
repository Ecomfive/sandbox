import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

export default function CargandoFlujoCaja() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={6} filas={14} columnas={13} />
    </Pagina>
  );
}
