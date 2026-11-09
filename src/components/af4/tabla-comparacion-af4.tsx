import type { ReactNode } from "react";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { CLASE_FILA_AF4, FONDO_FILA_AF4, claseCeldaAF4, claseNumeroAF4, type PesoFilaAF4 } from "./estilos-af4";
import { MarcoAF4 } from "./marco-af4";
import { DesplazableX } from "@/components/ui/desplazable-x";

export interface ColumnaComparacionAF4 {
  clave: string;
  etiqueta: ReactNode;
  /** Cifras: a la derecha y tabulares (por defecto sí, salvo la primera columna, que es la de conceptos). */
  numerica?: boolean;
  /** Una referencia (el mes anterior, el presupuesto): en gris, para que lo actual resalte. */
  atenuada?: boolean;
}

export interface FilaComparacionAF4 {
  clave: string;
  /** Lo que va en la columna de conceptos (texto o un botón que despliega el detalle). */
  etiqueta: ReactNode;
  /** El peso visual de la fila (como en `TablaFinanciera`); por defecto, una línea normal. */
  peso?: PesoFilaAF4;
  /** Una celda por columna (sin la de conceptos), ya formateada. */
  celdas: ReactNode[];
}

/**
 * Una tabla de comparación del Portal AF4 (real contra presupuesto, este mes contra el anterior, las tiendas): conceptos
 * en filas y columnas de distinto tipo (montos, %, desvíos con su punto). Es la hermana de `TablaFinanciera` cuando las
 * columnas no son períodos que se suman. Mismo marco, mismas filas (filetes de subtotal y doble filete del total) y sin
 * partirse entre dos páginas al imprimir. Sirve en el servidor y en el cliente (no guarda estado).
 */
export function TablaComparacionAF4({
  id,
  titulo,
  detalle,
  accion,
  ariaLabel,
  etiquetaConcepto = "Concepto",
  columnas,
  grupos,
  filas,
  pie,
}: {
  id: string;
  titulo: ReactNode;
  detalle?: ReactNode;
  accion?: ReactNode;
  /** Qué muestra la tabla, para lectores de pantalla. */
  ariaLabel: string;
  etiquetaConcepto?: ReactNode;
  columnas: ColumnaComparacionAF4[];
  /** Una fila de encabezado de grupos sobre las columnas («Sep 2026», «Acumulado»), con cuántas columnas abarca cada uno. */
  grupos?: { etiqueta: ReactNode; columnas: number }[];
  filas: FilaComparacionAF4[];
  /** Algo debajo de la tabla, dentro del mismo marco (otra tabla, una nota de un error). */
  pie?: ReactNode;
}) {
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} accion={accion} sinRelleno className="break-inside-avoid">
      <DesplazableX ariaLabel={ariaLabel} className="rounded-b-xl">
        <table className="tabla-datos w-full text-[13px]">
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            {grupos && (
              <tr className={claseFilaEncabezado}>
                <td className={`${claseEncabezadoColumna} sticky left-0 z-[5] bg-muted`} />
                {grupos.map((g, i) => (
                  <th key={i} colSpan={g.columnas} scope="colgroup" className={`${claseEncabezadoColumna} border-l border-border text-center whitespace-nowrap`}>
                    {g.etiqueta}
                  </th>
                ))}
              </tr>
            )}
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={`${claseEncabezadoColumna} sticky left-0 z-[5] bg-muted text-left whitespace-nowrap`}>
                {etiquetaConcepto}
              </th>
              {columnas.map((c) => (
                <th key={c.clave} scope="col" className={`${claseEncabezadoColumna} whitespace-nowrap ${c.numerica === false ? "text-left" : "text-right"}`}>
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const peso = f.peso ?? "seccion";
              return (
                <tr key={f.clave} className={`break-inside-avoid ${f.peso ? CLASE_FILA_AF4[peso] : "border-t border-border/60"} ${FONDO_FILA_AF4[peso]}`}>
                  <th scope="row" className={`${claseCeldaAF4} sticky left-0 z-[5] max-w-[22rem] min-w-[10rem] text-left font-[inherit] !whitespace-normal max-sm:max-w-[11rem] ${FONDO_FILA_AF4[peso]} ${peso === "detalle" ? "pl-8" : ""}`}>
                    {f.etiqueta}
                  </th>
                  {columnas.map((c, i) => (
                    <td
                      key={c.clave}
                      className={`${c.numerica === false ? claseCeldaAF4 : claseNumeroAF4} ${c.atenuada && peso !== "subtotal" && peso !== "total" ? "text-muted-foreground" : ""}`}
                    >
                      {f.celdas[i]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DesplazableX>
      {pie}
    </MarcoAF4>
  );
}
