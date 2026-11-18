"use client";

import { useState } from "react";
import { DIMENSIONES, type Dimension } from "@/lib/meta-ads/datos";
import { ctr, dolares, hookRate, nivelDeCtr, nivelDeHook } from "@/lib/meta-ads/metricas";
import type { Grupo } from "@/lib/meta-ads/vistas";
import { AVISO_POCA_DATA, entero, Nivel, porcentaje, Resultado, valorCpa } from "./piezas";

/** «Qué funciona»: las campañas (o los anuncios, para copy y landing) juntas por ángulo, estructura, puja, copy, landing, producto o etapa, de mejor a peor CPA. Lo que tiene poco gasto va al final y atenuado. */
export function QueFunciona({ grupos }: { grupos: Record<Dimension, Grupo[]> }) {
  const [dim, setDim] = useState<Dimension>("Ángulo");
  const lista = grupos[dim];
  const primera = lista.find((g) => g.confiable && g.r.compras > 0);
  const conSinConfiar = lista.some((g) => !g.confiable);
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Ver por" className="flex flex-wrap gap-1.5">
        {DIMENSIONES.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === dim}
            onClick={() => setDim(d)}
            className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${d === dim ? "border-foreground bg-foreground text-background" : "border-border-control bg-card text-muted-foreground hover:bg-muted"}`}
          >
            {d}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          {dim === "Ángulo" || dim === "Producto" || dim === "Etapa" ? `Ninguna campaña con gasto en el periodo trae ${dim === "Etapa" ? "etapa" : dim.toLowerCase()} en el nombre. Ponla en el nombre de la campaña o corrígela en su ficha.` : "No hay datos con gasto en el periodo."}
        </p>
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          {primera && (
            <p className="m-0 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
              Lo que mejor funciona en {dim.toLowerCase()}: <span className="font-medium text-foreground">{primera.nombre}</span> con CPA {valorCpa(primera.r)} y {entero(primera.r.compras)} compras.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="tabla-datos w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">Resultados por {dim.toLowerCase()}</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">{dim}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Campañas</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Gasto</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Compras</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">CPA</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">CTR</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Hook</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Resultado estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map((g) => (
                  <tr key={g.nombre} className={g.confiable ? "" : "text-muted-foreground"}>
                    <th scope="row" className="max-w-[26rem] px-4 py-2.5 text-left font-medium">
                      <span className="block truncate" title={g.nombre}>
                        {g.nombre}
                      </span>
                      {!g.confiable && <span className="text-xs font-normal">poca data</span>}
                    </th>
                    <td className="px-3 py-2.5 text-right tabular-nums">{g.campanas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{dolares(g.r.gasto)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{entero(g.r.compras)}</td>
                    <td className="px-3 py-2.5 text-right">{g.r.compras > 0 ? valorCpa(g.r) : "—"}</td>
                    <td className="px-3 py-2.5 text-right">{g.confiable ? <Nivel nivel={nivelDeCtr(ctr(g.r))}>{porcentaje(ctr(g.r))}</Nivel> : porcentaje(ctr(g.r))}</td>
                    <td className="px-3 py-2.5 text-right">{hookRate(g.r) === null ? "—" : g.confiable ? <Nivel nivel={nivelDeHook(hookRate(g.r))}>{porcentaje(hookRate(g.r), 0)}</Nivel> : porcentaje(hookRate(g.r), 0)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <ResultadoDeGrupo g={g} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {conSinConfiar && <p className="m-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">{AVISO_POCA_DATA}</p>}
        </div>
      )}
    </div>
  );
}

/** El resultado de un grupo ya viene sumado campaña por campaña con el tope de cada producto: se muestra tal cual. */
function ResultadoDeGrupo({ g }: { g: Grupo }) {
  return <Resultado r={g.r} tope={1} valor={g.resultado} />;
}
