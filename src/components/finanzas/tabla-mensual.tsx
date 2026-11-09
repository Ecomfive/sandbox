import type { ReactNode } from "react";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { mesCorto, type PorMes } from "@/lib/finanzas/eerr";

export type TipoFilaMensual = "seccion" | "detalle" | "resultado" | "grupo";

export interface FilaMensual {
  clave: string;
  etiqueta: string;
  tipo: TipoFilaMensual;
  valores: PorMes;
  /** Lo que va en la columna Total (por defecto la suma de los meses; `null` = vacío, p. ej. un saldo). */
  total?: number | null;
}

const CLASE_FILA: Record<TipoFilaMensual, string> = {
  grupo: "border-t-2 border-border font-semibold",
  seccion: "border-t border-border font-medium",
  detalle: "text-muted-foreground",
  resultado: "border-t border-border font-semibold",
};

/**
 * Un estado por mes (filas de conceptos, columnas de meses y total), como el Estado de resultados: tabla de resumen
 * fijo, sin barra de herramientas. La columna de conceptos queda fija al desplazarse de lado.
 */
export function TablaMensual({
  id,
  titulo,
  meses,
  filas,
  formato,
  accion,
  ariaLabel,
}: {
  id: string;
  titulo: string;
  meses: string[];
  filas: FilaMensual[];
  formato: (v: number) => string;
  /** A la derecha del título (la descarga). */
  accion?: ReactNode;
  ariaLabel: string;
}) {
  const texto = (v: number | null | undefined) => (v === null || v === undefined ? "" : Math.abs(v) < 0.005 ? "—" : formato(v));
  const rojo = (f: FilaMensual, v: number | null | undefined) => (f.tipo !== "detalle" && v !== null && v !== undefined && v < -0.005 ? "text-destructive" : "");
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={id} className="text-sm font-semibold">
          {titulo}
        </h2>
        {accion}
      </div>
      <ContenedorTabla ariaLabel={ariaLabel}>
        <table className="tabla-datos w-full text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={`${claseEncabezadoColumna} sticky left-0 z-10 bg-muted`}>
                Concepto
              </th>
              {meses.map((m) => (
                <th key={m} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  {mesCorto(m)}
                </th>
              ))}
              <th scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const tot = f.total === undefined ? meses.reduce((a, m) => a + (f.valores[m] ?? 0), 0) : f.total;
              return (
                <tr key={f.clave} className={CLASE_FILA[f.tipo]}>
                  <th
                    scope="row"
                    className={`${claseCeldaColumna} sticky left-0 z-10 bg-card text-left font-[inherit] whitespace-nowrap ${f.tipo === "detalle" ? "pl-8" : ""}`}
                  >
                    {f.etiqueta}
                  </th>
                  {meses.map((m) => (
                    <td key={m} className={`${claseCeldaColumna} text-right tabular-nums whitespace-nowrap ${rojo(f, f.valores[m])}`}>
                      {texto(f.valores[m])}
                    </td>
                  ))}
                  <td className={`${claseCeldaColumna} bg-muted/40 text-right font-medium tabular-nums whitespace-nowrap ${rojo(f, tot)}`}>
                    {texto(tot)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ContenedorTabla>
    </section>
  );
}
