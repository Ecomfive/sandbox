"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mesMedio } from "@/lib/af4/fecha";
import { dinero, SIN_DATO } from "@/lib/af4/formato";
import type { MesPresupuesto } from "@/lib/finanzas/compras-costos";
import { guardarPresupuestoCompras } from "./actions";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const aTexto = (v: number | null) => (v === null ? "" : String(v));

/**
 * El presupuesto de compras de los próximos meses contra lo comprometido (saldos de compras y gastos de importación por
 * su fecha estimada). El presupuesto se escribe en la celda; «Guardar» aparece solo con cambios. Lo disponible entra a la
 * Proyección de caja como compras planificadas.
 */
export function PresupuestoCompras({ meses, puedeEditar }: { meses: MesPresupuesto[]; puedeEditar: boolean }) {
  const inicial = Object.fromEntries(meses.map((m) => [m.mes, aTexto(m.presupuesto)]));
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const cambio = meses.some((m) => (valores[m.mes] ?? "").trim() !== inicial[m.mes]);
  const leer = (t: string) => (t.trim() === "" ? null : Number(t.replace(/[\s,]/g, "")));
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await guardarPresupuestoCompras(meses.map((m) => ({ mes: m.mes, monto: (valores[m.mes] ?? "").trim() }))).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else mostrarToast("Presupuesto guardado");
        });
      }}
    >
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="tabla-datos w-full min-w-[40rem] text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={claseEncabezadoColumna}>
                Mes
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Presupuesto
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Comprometido
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Disponible
              </th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => {
              const p = leer(valores[m.mes] ?? "");
              const disponible = p === null || !Number.isFinite(p) ? null : Math.round((p - m.comprometido) * 100) / 100;
              return (
                <tr key={m.mes} className="border-b border-border/60 last:border-0">
                  <th scope="row" className={`${claseCeldaColumna} text-left font-medium whitespace-nowrap`}>
                    {mesMedio(m.mes)}
                  </th>
                  <td className={`${claseCeldaColumna} ${num}`}>
                    {puedeEditar ? (
                      <input
                        inputMode="decimal"
                        aria-label={`Presupuesto de ${mesMedio(m.mes)}`}
                        value={valores[m.mes] ?? ""}
                        onChange={(e) => setValores((v) => ({ ...v, [m.mes]: e.target.value }))}
                        placeholder="Ej: 15000"
                        className={`${fieldClassSm} w-32 text-right ${claseCifra}`}
                      />
                    ) : (
                      dinero(m.presupuesto)
                    )}
                  </td>
                  <td className={`${claseCeldaColumna} ${num}`}>{dinero(m.comprometido)}</td>
                  <td className={`${claseCeldaColumna} ${num}`}>
                    {disponible === null ? (
                      SIN_DATO
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {disponible < 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />}
                        <span className={disponible < 0 ? "text-destructive" : ""}>{dinero(disponible)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(cambio || error) && (
        <div className="flex flex-wrap items-center gap-3">
          {cambio && (
            <button
              type="submit"
              disabled={pendiente}
              className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
            >
              Guardar presupuesto
            </button>
          )}
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-xs">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
              {error}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
