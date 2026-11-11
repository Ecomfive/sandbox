import type { OpcionPeriodo, PeriodoAF4 } from "@/lib/af4/periodo";
import { ControlSegmentado } from "./control-segmentado";
import { SelectorEnlace } from "./selector-enlace";

/**
 * El período de una página financiera, igual en todo el portal: los accesos rápidos (últimos N meses, año a la fecha)
 * como botones y un mes suelto en una lista desplegable. `href` arma la dirección de cada clave con los demás filtros.
 * Solo en el servidor (recibe una función).
 */
export function ControlPeriodo({
  periodo,
  opciones,
  href,
}: {
  periodo: PeriodoAF4;
  opciones: { rapidos: OpcionPeriodo[]; meses: OpcionPeriodo[] };
  href: (clave: string) => string;
}) {
  const rapidos = opciones.rapidos.map((o) => ({ ...o, href: href(o.valor) }));
  const meses = opciones.meses.map((o) => ({ ...o, href: href(o.valor) }));
  return (
    <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-1.5">
      {rapidos.length > 0 && <ControlSegmentado etiqueta="Elegir período" opciones={rapidos} elegido={periodo.clave} maxBotones={8} />}
      {meses.length > 0 && <SelectorEnlace etiqueta="Elegir mes" vacio="Mes…" opciones={meses} elegido={periodo.tipo === "mes" ? periodo.clave : null} />}
    </div>
  );
}
