import { CargandoAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";

/** Lo que se ve mientras carga una cartera (mismo ancho y mismos bloques que la página, para que no salte). */
export function CargandoCartera() {
  return (
    <Pagina ancho="ancha">
      <CargandoAF4 kpis={4} filas={10} columnas={9} />
    </Pagina>
  );
}
