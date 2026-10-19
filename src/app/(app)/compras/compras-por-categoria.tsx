"use client";

import { useMemo, useState } from "react";
import { BotonBarra, CabeceraTarjeta, Segmentado, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { rutaLegible } from "@/lib/categorias/taxonomia";
import { comprasPorCategoria, SIN_CATEGORIA, SIN_PRODUCTOS } from "@/lib/compras/por-categoria";
import type { Periodo } from "@/lib/compras/unidades-mes";
import type { FilaCompra } from "./def-compras";
import { entero, usd } from "./calculos-compras";

const PERIODOS: { valor: Periodo | "todo"; etiqueta: string }[] = [
  { valor: "este_anio", etiqueta: "Este año" },
  { valor: "ultimos_12", etiqueta: "Últimos 12 meses" },
  { valor: "anio_pasado", etiqueta: "Año pasado" },
  { valor: "todo", etiqueta: "Todo" },
];
const VISIBLES = 12;

/**
 * «Compras por categoría»: qué categorías de producto se compran más (unidades, valor, compras y su parte del total), en el
 * periodo elegido. La categoría sale de los productos vinculados a cada compra; las que no tienen productos van aparte.
 */
export function ComprasPorCategoria({ compras, dia }: { compras: FilaCompra[]; dia: string }) {
  const [periodo, setPeriodo] = useState<Periodo | "todo">("este_anio");
  const [todas, setTodas] = useState(false);
  const filas = useMemo(() => comprasPorCategoria(compras, periodo, dia), [compras, periodo, dia]);
  const total = filas.reduce((s, f) => s + f.unidades, 0);
  const maximo = Math.max(1, ...filas.filter((f) => f.categoria !== SIN_PRODUCTOS).map((f) => f.unidades));
  const vistas = todas ? filas : filas.slice(0, VISIBLES);

  return (
    <section aria-labelledby="d-categorias" className="min-w-0 rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="d-categorias" titulo="Compras por categoría">
        <Segmentado etiqueta="Periodo de compras por categoría" opciones={PERIODOS} valor={periodo} alCambiar={setPeriodo} />
      </CabeceraTarjeta>
      {filas.length === 0 ? (
        <p className="m-0 px-4 py-3 text-sm text-muted-foreground">No hay compras en este periodo con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse">
            <thead>
              <tr>
                {["Categoría", "Unidades", "% unidades", "Valor", "Compras"].map((t, i) => (
                  <th key={t} scope="col" className={`${claseTh} ${i ? "text-right" : ""} ${t === "Unidades" ? "w-[30%]" : ""}`}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vistas.map((f) => {
                const aparte = f.categoria === SIN_PRODUCTOS || f.categoria === SIN_CATEGORIA;
                return (
                  <tr key={f.categoria}>
                    <th scope="row" className={`${claseTd} max-w-[28rem] truncate text-left font-normal ${aparte ? "text-muted-foreground italic" : ""}`}>
                      {aparte ? f.categoria : rutaLegible(f.categoria)}
                    </th>
                    <td className={claseTd}>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 rounded-full bg-muted">
                          {!aparte && <span className="barra-neon block h-1.5 rounded-full" style={{ width: `${Math.max(2, (f.unidades / maximo) * 100)}%` }} />}
                        </span>
                        <b className="w-20 text-right font-semibold tabular-nums">{entero(f.unidades)}</b>
                      </span>
                    </td>
                    <td className={`${claseTd} text-right tabular-nums`}>{total ? `${((f.unidades / total) * 100).toFixed(1)} %` : "—"}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{usd(f.valor)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{entero(f.compras)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filas.length > VISIBLES && (
        <div className="flex justify-center p-2">
          <BotonBarra onClick={() => setTodas((v) => !v)}>{todas ? "Ver menos" : `Ver las ${filas.length} categorías`}</BotonBarra>
        </div>
      )}
    </section>
  );
}
