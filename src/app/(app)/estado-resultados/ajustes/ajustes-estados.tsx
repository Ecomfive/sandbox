"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CANALES, ETIQUETA_CANAL, SIN_CANAL } from "@/lib/finanzas/canales";
import { BASES_REPARTO, type BaseReparto } from "@/lib/finanzas/reparto";
import { cambiarBaseReparto, cambiarCanalUnidad, cambiarFulfillmentUnidad, cambiarTipoIntercompania } from "./actions";

export interface UnidadCanal {
  id: string;
  nombre: string;
  canal: string | null;
  sugerido: string | null;
  /** null = falta la migración 0965/0966 (no se muestra el control). */
  fulfillment: { cliente: boolean; tarifa: number | null } | null;
}

export interface TipoIntercompania {
  id: string;
  nombre: string;
  intercompania: boolean;
}

function useGuardar() {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const guardar = (accion: () => Promise<{ error?: string }>, exito: string) =>
    iniciar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(exito);
        router.refresh();
      }
    });
  return { pendiente, guardar };
}

/** La base de reparto predeterminada: cambia el EERR guardado de todo el portal, por eso pide confirmar. */
export function BaseRepartoAjuste({ base, puedeEscribir }: { base: BaseReparto; puedeEscribir: boolean }) {
  const { pendiente, guardar } = useGuardar();
  const [elegida, setElegida] = useState<BaseReparto>(base);
  return (
    <MarcoAF4 id="ajuste-base-reparto" titulo="Base de reparto de A DISTRIBUIR">
      <fieldset disabled={!puedeEscribir || pendiente} className="flex flex-col gap-3">
        <legend className="sr-only">Base de reparto predeterminada</legend>
        <div className="flex flex-wrap gap-4">
          {BASES_REPARTO.map((b) => (
            <label key={b.clave} className="flex items-center gap-2 text-sm">
              <input type="radio" name="base-reparto" value={b.clave} checked={elegida === b.clave} onChange={() => setElegida(b.clave)} className={anilloFoco} />
              {b.etiqueta}
              {b.clave === base && <span className="text-xs text-muted-foreground">(guardada)</span>}
            </label>
          ))}
        </div>
        {elegida !== base && (
          <div role="group" aria-label="Confirmar la base de reparto" className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
            <p className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
              <span>
                El reparto de A DISTRIBUIR pasa a hacerse por {BASES_REPARTO.find((b) => b.clave === elegida)!.etiqueta.toLowerCase()} en todo el portal
                (Estado de resultados, Utilidades, Rentabilidad y Presupuesto).
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => guardar(() => cambiarBaseReparto(elegida), "Base de reparto guardada")}
                className={`rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`}
              >
                {pendiente ? "Guardando…" : "Guardar como predeterminada"}
              </button>
              <button type="button" onClick={() => setElegida(base)} className={`${claseAccionAF4} ${anilloFoco}`}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </fieldset>
    </MarcoAF4>
  );
}

/** El canal de venta de cada tienda (para el EERR por canal). */
export function CanalesAjuste({ unidades, puedeEscribir }: { unidades: UnidadCanal[]; puedeEscribir: boolean }) {
  const { pendiente, guardar } = useGuardar();
  return (
    <MarcoAF4 id="ajuste-canales" titulo="Canal de venta de cada tienda" sinRelleno>
      <ul className="m-0 list-none p-0">
        {unidades.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{u.nombre}</span>
              {!u.canal && u.sugerido && <span className="text-xs text-muted-foreground">Sugerido: {ETIQUETA_CANAL[u.sugerido as keyof typeof ETIQUETA_CANAL]}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-3">
            {u.fulfillment && (
              <>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={u.fulfillment.cliente}
                    disabled={!puedeEscribir || pendiente}
                    onChange={(e) => guardar(() => cambiarFulfillmentUnidad(u.id, e.target.checked, u.fulfillment?.tarifa ?? null), `${u.nombre}: guardado`)}
                  />
                  Cliente de fulfillment
                </label>
                {u.fulfillment.cliente && (
                  <label className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">US$ por orden</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="Ej: 2.50"
                      aria-label={`Tarifa de fulfillment de ${u.nombre}`}
                      defaultValue={u.fulfillment.tarifa ?? ""}
                      disabled={!puedeEscribir || pendiente}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const antes = u.fulfillment?.tarifa ?? null;
                        if ((v === "" ? null : Number(v)) === antes) return;
                        guardar(() => cambiarFulfillmentUnidad(u.id, true, v), `${u.nombre}: tarifa guardada`);
                      }}
                      className={`${fieldClassSm} w-24`}
                    />
                  </label>
                )}
              </>
            )}
            <select
              aria-label={`Canal de ${u.nombre}`}
              value={u.canal ?? ""}
              disabled={!puedeEscribir || pendiente}
              onChange={(e) => guardar(() => cambiarCanalUnidad(u.id, e.target.value), `${u.nombre}: canal guardado`)}
              className={`${fieldClassSm} w-40`}
            >
              <option value="">{ETIQUETA_CANAL[SIN_CANAL]}</option>
              {CANALES.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CANAL[c]}
                </option>
              ))}
            </select>
            </span>
          </li>
        ))}
      </ul>
    </MarcoAF4>
  );
}

/** Los tipos del libro cuyos movimientos son entre empresas del grupo (fuera del EERR consolidado). */
export function IntercompaniaAjuste({ tipos, puedeEscribir }: { tipos: TipoIntercompania[]; puedeEscribir: boolean }) {
  const { pendiente, guardar } = useGuardar();
  return (
    <MarcoAF4 id="ajuste-intercompania" titulo="Tipos intercompañía" sinRelleno>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-4 p-0 sm:grid-cols-2">
        {tipos.map((t) => (
          <li key={t.id} className="border-t border-border px-4 py-2 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={t.intercompania}
                disabled={!puedeEscribir || pendiente}
                onChange={(e) => guardar(() => cambiarTipoIntercompania(t.id, e.target.checked), `${t.nombre}: guardado`)}
                className={anilloFoco}
              />
              {t.nombre}
            </label>
          </li>
        ))}
      </ul>
    </MarcoAF4>
  );
}
