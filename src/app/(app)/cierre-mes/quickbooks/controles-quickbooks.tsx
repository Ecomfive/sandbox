"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { claseCeldaAF4, claseNumeroAF4 } from "@/components/af4/estilos-af4";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dinero } from "@/lib/af4/formato";
import { DESTINOS, type Destino } from "@/lib/quickbooks/conciliacion";
import { desconectarQuickbooks, guardarMapeoQbo, leerQuickbooksAhora } from "./actions";

const botonBorde = `inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

/** Conectar (lleva a Intuit), leer ahora y desconectar. Solo se dibuja para quien puede modificar Usuarios y roles. */
export function ControlesConexion({ conectado, configurado }: { conectado: boolean; configurado: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const leer = () =>
    startTransition(async () => {
      const r = await leerQuickbooksAhora();
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(r.resumen ?? "QuickBooks leído");
      router.refresh();
    });
  const desconectar = () =>
    startTransition(async () => {
      const r = await desconectarQuickbooks();
      if (r.error) return mostrarToast(r.error, "destructive");
      setConfirmar(false);
      mostrarToast("QuickBooks desconectado");
      router.refresh();
    });
  if (!configurado) return null;
  if (!conectado) {
    return (
      <a href="/api/quickbooks/conectar" className={botonOscuro}>
        Conectar QuickBooks
      </a>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={leer} disabled={enviando} aria-busy={enviando} className={botonBorde}>
        {enviando && !confirmar ? "Leyendo…" : "Leer ahora"}
      </button>
      <a href="/api/quickbooks/conectar" className={botonBorde}>
        Volver a conectar
      </a>
      {confirmar ? (
        <span role="group" aria-label="Confirmar desconexión" className="flex items-center gap-2">
          <button type="button" onClick={desconectar} disabled={enviando} className={`${botonBorde} text-destructive`}>
            {enviando ? "Desconectando…" : "Sí, desconectar"}
          </button>
          <button type="button" onClick={() => setConfirmar(false)} className={botonBorde}>
            Cancelar
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmar(true)} className={botonBorde}>
          Desconectar
        </button>
      )}
    </div>
  );
}

export interface CuentaMapeo {
  cuentaId: string;
  cuentaNombre: string;
  grupo: string;
  destino: Destino;
  sugerido: boolean;
  total: number;
}

const GRUPO: Record<string, string> = { Income: "Ingresos", COGS: "Costo de ventas", Expense: "Gastos", OtherIncome: "Otros ingresos", OtherExpense: "Otros gastos" };

/** El mapeo de cuentas de QuickBooks → secciones del portal: cada cambio se guarda al elegirlo. */
export function MapeoCuentas({ cuentas, puedeEditar }: { cuentas: CuentaMapeo[]; puedeEditar: boolean }) {
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const sugeridas = cuentas.filter((c) => c.sugerido);
  const guardar = (cambios: [string, string][], ok: string) =>
    startTransition(async () => {
      const r = await guardarMapeoQbo(cambios);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(ok);
      router.refresh();
    });
  return (
    <div className="flex flex-col">
      {puedeEditar && sugeridas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            {sugeridas.length === 1 ? "1 cuenta con destino sugerido" : `${sugeridas.length} cuentas con destino sugerido`}
          </span>
          <button
            type="button"
            disabled={enviando}
            onClick={() => guardar(sugeridas.map((c) => [c.cuentaId, c.destino]), "Sugerencias confirmadas")}
            className={botonBorde}
          >
            Confirmar sugerencias
          </button>
        </div>
      )}
      <DesplazableX ariaLabel="Mapeo de cuentas de QuickBooks" className="rounded-b-xl">
        <table className="tabla-datos w-full text-[13px]">
          <caption className="sr-only">Cuentas de QuickBooks y la sección del Estado de resultados del portal con la que se comparan</caption>
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={`${claseEncabezadoColumna} text-left`}>Cuenta de QuickBooks</th>
              <th scope="col" className={`${claseEncabezadoColumna} text-left`}>Grupo</th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Total del período</th>
              <th scope="col" className={`${claseEncabezadoColumna} text-left`}>Sección del portal</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.cuentaId} className="border-b border-border last:border-b-0">
                <th scope="row" className={`${claseCeldaAF4} text-left font-normal`}>
                  {c.cuentaNombre}
                </th>
                <td className={`${claseCeldaAF4} text-left text-muted-foreground`}>{GRUPO[c.grupo] ?? c.grupo}</td>
                <td className={claseNumeroAF4}>{dinero(c.total, "USD", { decimales: 2 })}</td>
                <td className={`${claseCeldaAF4} text-left`}>
                  {puedeEditar ? (
                    <span className="flex items-center gap-2">
                      <select
                        aria-label={`Sección del portal de ${c.cuentaNombre}`}
                        value={c.destino}
                        disabled={enviando}
                        onChange={(e) => guardar([[c.cuentaId, e.target.value]], `${c.cuentaNombre}: guardada`)}
                        className={`${fieldClassSm} min-w-48`}
                      >
                        {DESTINOS.map((d) => (
                          <option key={d.clave} value={d.clave}>
                            {d.etiqueta}
                          </option>
                        ))}
                      </select>
                      {c.sugerido && <span className="text-xs text-muted-foreground">Sugerida</span>}
                    </span>
                  ) : (
                    <span>
                      {DESTINOS.find((d) => d.clave === c.destino)?.etiqueta}
                      {c.sugerido ? " · sugerida" : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DesplazableX>
    </div>
  );
}
