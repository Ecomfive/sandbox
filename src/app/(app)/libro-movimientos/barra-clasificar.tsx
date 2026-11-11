"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { entero } from "@/lib/af4/formato";
import { CerrarIcon } from "@/lib/nav-icons";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { clasificarMovimientos, type Asignacion } from "./clasificar-actions";

const botonBarra = `inline-flex min-h-8 items-center gap-1.5 !rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;

/** Lo mínimo que la barra necesita de cada fila marcada (pendientes o movimientos). */
export interface Marcable {
  id: string;
  sugTiendaId?: string | null;
  sugTipoId?: string | null;
  /** Confianza de la sugerencia (0 a 100), en la bandeja «Por clasificar». */
  confianza?: number | null;
}

/**
 * La barra de los movimientos marcados (fija abajo): aceptar las sugerencias de cada uno o ponerles a todos la misma
 * tienda y/o tipo. Lo que se guarda queda «editado a mano» y reimportar el Excel no lo pisa.
 */
export function BarraClasificar({ marcadas, quitar, tiendas, tipos }: { marcadas: Marcable[]; quitar: () => void; tiendas: Opcion[]; tipos: Opcion[] }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const [tienda, setTienda] = useState("");
  const [tipo, setTipo] = useState("");
  const conSugerencia = marcadas.filter((f) => f.sugTiendaId || f.sugTipoId);
  const altas = conSugerencia.filter((f) => (f.confianza ?? 0) >= 80);

  function enviar(asignaciones: Asignacion[], hecho: string) {
    iniciar(async () => {
      const r = await clasificarMovimientos(asignaciones);
      if ("error" in r) {
        mostrarToast(r.error, "destructive");
        return;
      }
      mostrarToast(`${entero(r.clasificados)} ${hecho}`);
      quitar();
      setTienda("");
      setTipo("");
      router.refresh();
    });
  }

  return (
    <div
      role="region"
      aria-label="Movimientos seleccionados"
      className="sticky bottom-24 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
    >
      <p role="status" className="m-0 font-medium tabular-nums">
        {marcadas.length} {marcadas.length === 1 ? "seleccionado" : "seleccionados"}
      </p>
      {marcadas.some((f) => f.sugTiendaId !== undefined) && (
      <button
        type="button"
        className={botonBarra}
        disabled={pendiente || !conSugerencia.length}
        onClick={() =>
          enviar(
            conSugerencia.map((f) => ({ id: f.id, unidad_id: f.sugTiendaId, tipo_id: f.sugTipoId })),
            "clasificados con su sugerencia",
          )
        }
      >
        Aceptar sugerencias ({conSugerencia.length})
      </button>
      )}
      {marcadas.some((f) => f.confianza !== undefined) && (
        <button
          type="button"
          className={botonBarra}
          disabled={pendiente || !altas.length}
          onClick={() => enviar(altas.map((f) => ({ id: f.id, unidad_id: f.sugTiendaId, tipo_id: f.sugTipoId })), "clasificados con su sugerencia")}
        >
          Aceptar solo confianza alta ({altas.length})
        </button>
      )}
      <span className="h-5 w-px bg-border" aria-hidden="true" />
      <select aria-label="Tienda para los seleccionados" className={`${fieldClassSm} max-w-44`} value={tienda} onChange={(e) => setTienda(e.target.value)} disabled={pendiente}>
        <option value="">Tienda…</option>
        {tiendas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>
      <select aria-label="Tipo para los seleccionados" className={`${fieldClassSm} max-w-56`} value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={pendiente}>
        <option value="">Tipo…</option>
        {tipos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={botonBarra}
        disabled={pendiente || (!tienda && !tipo)}
        onClick={() =>
          enviar(
            marcadas.map((f) => ({ id: f.id, unidad_id: tienda || null, tipo_id: tipo || null })),
            "clasificados",
          )
        }
      >
        Asignar
      </button>
      {pendiente && <span className="text-muted-foreground">Guardando…</span>}
      <Tooltip texto="Quitar selección">
        <button type="button" onClick={quitar} aria-label="Quitar la selección" className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
          <CerrarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
