// Piezas comunes de Optimizar deuda, Refinanciamiento, Covenants y Capital para crecer: una tabla simple con las clases
// del Portal AF4 (encabezado de tabla, cifras alineadas, negativos con «−» por `dinero`) y el punto de estado.

import type { ReactNode } from "react";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseCeldaAF4, claseNumeroAF4 } from "@/components/af4/estilos-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";

export interface ColumnaSimple {
  etiqueta: string;
  numero?: boolean;
}

/** Una tabla de filas y columnas fijas dentro de un marco AF4. La primera columna es el encabezado de cada fila. */
export function TablaSimple({ id, titulo, detalle, columnas, filas, pie, accion }: { id: string; titulo: string; detalle?: ReactNode; columnas: ColumnaSimple[]; filas: { clave: string; celdas: ReactNode[]; resaltar?: boolean }[]; pie?: ReactNode[]; accion?: ReactNode }) {
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} accion={accion} sinRelleno>
      <div className="overflow-x-auto" role="region" aria-labelledby={id} tabIndex={0}>
        <table className="tabla-datos w-full text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              {columnas.map((c) => (
                <th key={c.etiqueta} scope="col" className={`${claseEncabezadoColumna} ${c.numero ? "text-right" : "text-left"}`}>
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className={`border-t border-border/60 ${f.resaltar ? "font-medium" : ""}`}>
                {f.celdas.map((c, k) =>
                  k === 0 ? (
                    <th key={k} scope="row" className={`${claseCeldaAF4} text-left font-normal`}>
                      {c}
                    </th>
                  ) : (
                    <td key={k} className={columnas[k]?.numero ? claseNumeroAF4 : claseCeldaAF4}>
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
          {pie && (
            <tfoot>
              <tr className="border-t-[3px] border-double border-border-control font-semibold">
                {pie.map((c, k) =>
                  k === 0 ? (
                    <th key={k} scope="row" className={`${claseCeldaAF4} text-left`}>
                      {c}
                    </th>
                  ) : (
                    <td key={k} className={columnas[k]?.numero ? claseNumeroAF4 : claseCeldaAF4}>
                      {c}
                    </td>
                  ),
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </MarcoAF4>
  );
}

const PUNTO = { success: "bg-success", warning: "bg-warning", destructive: "bg-destructive", neutral: "bg-muted-foreground" } as const;

/** Un punto de color con su texto (el estado se lee, no solo se ve). */
export function Punto({ tono, children }: { tono: keyof typeof PUNTO; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[tono]}`} />
      {children}
    </span>
  );
}

/** Un filtro con campos de la barra de contexto (envía por GET, la dirección se puede copiar). */
export function FiltroCampos({ accion, campos, ocultos = {} }: { accion: string; campos: { nombre: string; etiqueta: string; valor: string; placeholder?: string; ancho?: string }[]; ocultos?: Record<string, string> }) {
  return (
    <form method="get" action={accion} className="flex flex-wrap items-end gap-2">
      {Object.entries(ocultos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {campos.map((c) => (
        <label key={c.nombre} className="flex flex-col gap-0.5">
          <span className={labelClassSm}>{c.etiqueta}</span>
          <input name={c.nombre} defaultValue={c.valor} inputMode="decimal" placeholder={c.placeholder} className={`${fieldClassSm} ${c.ancho ?? "w-28"}`} />
        </label>
      ))}
      <button type="submit" className={`${claseAccionAF4} ${anilloFoco}`}>
        Calcular
      </button>
    </form>
  );
}
