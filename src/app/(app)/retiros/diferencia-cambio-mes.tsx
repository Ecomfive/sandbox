"use client";

import Link from "next/link";
import { useState } from "react";
import { KpiGroup } from "@/components/ui/kpi-card";
import { anilloFoco } from "@/components/ui/field";
import { formatearMes, formatearMoneda } from "@/lib/formato";
import type { DiferenciaMes } from "@/lib/retiros/diferencia-cambio";

const MESES_VISIBLES = 6;
const formatoCorrelativo = (numero: number) => `#${String(numero).padStart(4, "0")}`;
const pct = (dif: number, monto: number) => (monto > 0 ? `${((dif / monto) * 100).toFixed(2)} %` : "—");

/**
 * La diferencia por cambio de cada mes (13 nov 2026, pedido de Hernán): lo pedido menos lo recibido de los retiros cerrados, por el mes de la solicitud,
 * como la columna «Diferencia por cambio» de su Excel. Muestra los últimos 6 meses y se puede abrir el resto; al pie, el total de los meses que se ven.
 */
export function DiferenciaCambioMes({ meses, codigoPais }: { meses: DiferenciaMes[]; codigoPais: string }) {
  const [todos, setTodos] = useState(false);
  if (!meses.length) return null;
  const visibles = todos ? meses : meses.slice(0, MESES_VISIBLES);
  const total = visibles.reduce((a, m) => ({ monto: a.monto + m.monto, diferencia: a.diferencia + m.diferencia }), { monto: 0, diferencia: 0 });
  const dinero = (n: number) => formatearMoneda(Math.round(n * 100) / 100, codigoPais);
  const th = "px-3 py-1.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
  const td = "px-3 py-1.5 tabular-nums";

  return (
    <KpiGroup
      titulo="Diferencia por cambio por mes"
      accion={<span className="font-normal">Lo pedido menos lo recibido de los retiros cerrados, por el mes de la solicitud</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={th}>Mes</th>
              <th scope="col" className={`${th} text-right`}>Retiros</th>
              <th scope="col" className={`${th} text-right`}>Pedido</th>
              <th scope="col" className={`${th} text-right`}>Recibido</th>
              <th scope="col" className={`${th} text-right`}>Diferencia por cambio</th>
              <th scope="col" className={`${th} text-right`}>% del pedido</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => (
              <tr key={m.mes} className="border-b border-border last:border-b-0">
                <th scope="row" className={`${td} text-left font-medium whitespace-nowrap capitalize`}>
                  {formatearMes(`${m.mes}-01`)}
                  {m.sinRecibido > 0 && (
                    <span className="block text-xs font-normal whitespace-nowrap text-warning normal-case">
                      Sin monto recibido, no suman:{" "}
                      {m.faltan.length
                        ? m.faltan.map((f, k) => (
                            <span key={f.id}>
                              {k > 0 && ", "}
                              <Link href={`/retiros/${f.id}`} className={`underline ${anilloFoco}`}>
                                {f.numero === null ? "sin número" : formatoCorrelativo(f.numero)}
                              </Link>
                            </span>
                          ))
                        : m.sinRecibido}
                    </span>
                  )}
                </th>
                <td className={`${td} text-right`}>{m.retiros}</td>
                <td className={`${td} text-right`}>{dinero(m.monto)}</td>
                <td className={`${td} text-right`}>{dinero(m.recibido)}</td>
                <td className={`${td} text-right font-semibold text-primario`}>{dinero(m.diferencia)}</td>
                <td className={`${td} text-right text-muted-foreground`}>{pct(m.diferencia, m.monto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/50">
              <th scope="row" className={`${td} text-left font-semibold`}>
                Total de {visibles.length === 1 ? "este mes" : `estos ${visibles.length} meses`}
              </th>
              <td className={td} />
              <td className={`${td} text-right font-medium`}>{dinero(total.monto)}</td>
              <td className={td} />
              <td className={`${td} text-right font-semibold text-primario`}>{dinero(total.diferencia)}</td>
              <td className={`${td} text-right text-muted-foreground`}>{pct(total.diferencia, total.monto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {meses.length > MESES_VISIBLES && (
        <button type="button" onClick={() => setTodos((t) => !t)} aria-expanded={todos} className={`mt-2 rounded-md px-2 py-1 text-xs font-medium text-primario hover:underline ${anilloFoco}`}>
          {todos ? `Ver solo los últimos ${MESES_VISIBLES} meses` : `Ver los ${meses.length} meses`}
        </button>
      )}
    </KpiGroup>
  );
}
