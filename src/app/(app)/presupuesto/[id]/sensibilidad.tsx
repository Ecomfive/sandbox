import { CLASE_FILA_AF4, claseCeldaAF4, claseNumeroAF4, claseSigno } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { dinero, porcentaje, puntos } from "@/lib/af4/formato";
import type { CeldaSensibilidad } from "@/lib/finanzas/presupuesto";
import { DesplazableX } from "@/components/ui/desplazable-x";

/**
 * La matriz de sensibilidad del escenario: EBITDA del año (y, debajo, el valor de empresa) si los ingresos cambian
 * ±5/10/20 % y el margen bruto ±2/5 puntos. La celda del medio es el presupuesto tal cual.
 */
export function Sensibilidad({ matriz, multiplo }: { matriz: CeldaSensibilidad[][]; multiplo: number }) {
  const columnas = matriz[0] ?? [];
  return (
    <MarcoAF4 id="titulo-sensibilidad" titulo="Sensibilidad" detalle={`EBITDA anual y valor de empresa (${multiplo}×) · USD`} sinRelleno>
      <DesplazableX ariaLabel="Sensibilidad del EBITDA anual a ingresos y margen bruto" className="rounded-b-xl">
        <table className="tabla-datos w-full text-[13px]">
          <caption className="sr-only">EBITDA anual y valor de empresa según el cambio de los ingresos (filas) y del margen bruto (columnas)</caption>
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={`${claseEncabezadoColumna} text-left whitespace-nowrap`}>
                Ingresos \ Margen bruto
              </th>
              {columnas.map((c) => (
                <th key={c.deltaMargen} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  {c.deltaMargen === 0 ? "Presupuesto" : puntos(c.deltaMargen, 0)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matriz.map((fila) => (
              <tr key={fila[0].deltaIngresos} className={CLASE_FILA_AF4.seccion}>
                <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                  {fila[0].deltaIngresos === 0 ? "Presupuesto" : porcentaje(fila[0].deltaIngresos, { decimales: 0, conSigno: true })}
                </th>
                {fila.map((c) => {
                  const centro = c.deltaIngresos === 0 && c.deltaMargen === 0;
                  return (
                    <td key={c.deltaMargen} className={`${claseNumeroAF4} font-normal ${centro ? "bg-accent font-semibold" : ""}`}>
                      <span className={`block ${claseSigno(c.ebitda)}`}>{dinero(c.ebitda)}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        <span className="sr-only">Valor de empresa </span>
                        {dinero(c.valorEmpresa)}
                      </span>
                      {centro && <span className="sr-only"> (presupuesto tal cual)</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </DesplazableX>
    </MarcoAF4>
  );
}
