"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { fieldClassSm } from "@/components/ui/field";
import { MasIcon, PapeleraIcon } from "@/lib/nav-icons";

export interface UbicacionConteo {
  id: string;
  codigo: string;
  nombre: string | null;
}

/** Una línea de cajas mientras se escribe. */
export interface LineaCajasForm {
  ubicacion: string;
  cajas: string;
  porCaja: string;
  observacion: string;
}

const valor = (t: string) => {
  const n = Number(t);
  return t.trim() !== "" && Number.isInteger(n) && n > 0 ? n : 0;
};

/** Las unidades que suman las líneas (las incompletas no cuentan). */
export const unidadesFormulario = (lineas: readonly LineaCajasForm[]) => lineas.reduce((t, l) => t + valor(l.cajas) * valor(l.porCaja), 0);
export const cajasFormulario = (lineas: readonly LineaCajasForm[]) => lineas.reduce((t, l) => t + valor(l.cajas), 0);

const VACIA: LineaCajasForm = { ubicacion: "", cajas: "", porCaja: "", observacion: "" };

/**
 * Las cajas de un producto en el levantamiento (7 nov 2026, pedido de Yanixia): una línea por lugar y tamaño de caja, porque un producto suele tener cajas de varios
 * tamaños. Las unidades salen solas. Se abre con un botón para no alargar la lista.
 */
export function LineasCajas({
  codigo,
  lineas,
  ubicaciones,
  deshabilitado,
  alCambiar,
  junto,
}: {
  codigo: string;
  lineas: LineaCajasForm[];
  ubicaciones: UbicacionConteo[];
  deshabilitado: boolean;
  alCambiar: (lineas: LineaCajasForm[]) => void;
  /** Lo que va a la par del botón de cajas (el «Sumar» de la fila). */
  junto?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const cajas = cajasFormulario(lineas);
  const unidades = unidadesFormulario(lineas);
  const cambiar = (i: number, cambio: Partial<LineaCajasForm>) => alCambiar(lineas.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {junto}
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => {
            if (!abierto && lineas.length === 0 && !deshabilitado) alCambiar([VACIA]);
            setAbierto(!abierto);
          }}
          className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {cajas > 0 ? `${cajas.toLocaleString("es-PA")} ${cajas === 1 ? "caja" : "cajas"} · ${unidades.toLocaleString("es-PA")} u.` : "Agregar cajas"}
        </button>
      </div>
      {abierto && ubicaciones.length === 0 && (
        <p className="m-0 text-xs text-muted-foreground">
          Esta bodega no tiene ubicaciones. Créalas en{" "}
          <Link href="/wms-ubicaciones" className="underline underline-offset-2">
            Ubicaciones
          </Link>
          .
        </p>
      )}
      {abierto && ubicaciones.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {lineas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <select aria-label={`Ubicación de las cajas de ${codigo}`} value={l.ubicacion} disabled={deshabilitado} onChange={(e) => cambiar(i, { ubicacion: e.target.value })} className={`${fieldClassSm} w-36`}>
                <option value="">Ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre ? `${u.codigo} · ${u.nombre}` : u.codigo}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                aria-label={`Cantidad de cajas de ${codigo}`}
                placeholder="Cajas"
                value={l.cajas}
                disabled={deshabilitado}
                onChange={(e) => cambiar(i, { cajas: e.target.value })}
                className={`${fieldClassSm} w-20 text-right tabular-nums`}
              />
              <span aria-hidden="true" className="text-xs text-muted-foreground">
                ×
              </span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                aria-label={`Cantidad por caja de ${codigo}`}
                placeholder="Por caja"
                value={l.porCaja}
                disabled={deshabilitado}
                onChange={(e) => cambiar(i, { porCaja: e.target.value })}
                className={`${fieldClassSm} w-24 text-right tabular-nums`}
              />
              <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">= {(valor(l.cajas) * valor(l.porCaja)).toLocaleString("es-PA")}</span>
              <input
                aria-label={`Observación de las cajas de ${codigo}`}
                placeholder="Observación"
                maxLength={200}
                value={l.observacion}
                disabled={deshabilitado}
                onChange={(e) => cambiar(i, { observacion: e.target.value })}
                className={`${fieldClassSm} w-36`}
              />
              <button
                type="button"
                aria-label={`Quitar esta línea de cajas de ${codigo}`}
                disabled={deshabilitado}
                onClick={() => alCambiar(lineas.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <PapeleraIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {!deshabilitado && (
            <button
              type="button"
              onClick={() => alCambiar([...lineas, { ...VACIA, ubicacion: lineas.at(-1)?.ubicacion ?? "" }])}
              className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MasIcon className="h-3.5 w-3.5" aria-hidden="true" /> Agregar línea de cajas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
