"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ICONO_MODULO } from "@/components/ayuda/iconos-modulo";
import { almacen } from "@/components/tabla/almacen";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { agruparPorDia, CLAVE_VISTO, filtrarCambios, ultimaFecha } from "@/lib/ayuda/actualizaciones";
import type { Novedad } from "@/lib/ayuda/contenido";
import { formatearFecha } from "@/lib/formato";
import { HistorialIcon } from "@/lib/nav-icons";


const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const hoyIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
/** «Hoy», «Ayer» o «viernes 30 oct 2026». */
function nombreDia(fecha: string): string {
  const hoy = hoyIso();
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (fecha === hoy) return "Hoy";
  if (fecha === ayer) return "Ayer";
  return `${DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()]} ${formatearFecha(fecha)}`;
}

/**
 * La lista de Actualizaciones: buscar, filtrar por módulo y, por día, cada cambio con su módulo y un enlace a dónde verlo. Lo que llegó después de la
 * última visita lleva «Nuevo»; al abrir la página queda como visto (en este navegador).
 */
export function ListaActualizaciones({ novedades, modulos }: { novedades: Novedad[]; modulos: { clave: string; etiqueta: string }[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [modulo, setModulo] = useState("");
  const visto = almacen(CLAVE_VISTO, "local");
  const vistoHasta = useSyncExternalStore(visto.suscribir, visto.leer, () => "");
  const ultima = ultimaFecha(novedades);
  // Lo de esta visita queda visto al salir de la página (así «Nuevo» se ve mientras se lee), o antes con el botón.
  useEffect(
    () => () => {
      if (ultima && ultima > (visto.leer() || "")) visto.guardar(ultima);
    },
    // `visto` apunta siempre a la misma clave guardada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ultima],
  );

  const etiqueta = useMemo(() => new Map(modulos.map((m) => [m.clave, m.etiqueta])), [modulos]);
  const filtradas = useMemo(() => filtrarCambios(novedades, busqueda, modulo), [novedades, busqueda, modulo]);
  const dias = useMemo(() => agruparPorDia(filtradas), [filtradas]);
  const referencia = vistoHasta || null;
  const hayNuevos = !!ultima && (referencia === null || ultima > referencia);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Buscar</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej: fulfillment, retiros, contraseña" className={fieldClass} />
        </label>
        <label className="flex min-w-0 flex-[0_1_14rem] flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Módulo</span>
          <select value={modulo} onChange={(e) => setModulo(e.target.value)} className={fieldClass}>
            <option value="">Todos</option>
            {modulos.map((m) => (
              <option key={m.clave} value={m.clave}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {hayNuevos && (
          <button type="button" onClick={() => ultima && visto.guardar(ultima)} className={`inline-flex min-h-10 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Marcar todo como visto
          </button>
        )}
        <p className="m-0 pb-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {filtradas.length} {filtradas.length === 1 ? "cambio" : "cambios"} en {dias.length} {dias.length === 1 ? "día" : "días"}
        </p>
      </div>

      {dias.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Ningún cambio coincide con la búsqueda.</p>
      ) : (
        dias.map((d) => {
          const nuevos = referencia === null ? 0 : d.cambios.filter((c) => c.fecha > referencia).length;
          return (
            <section key={d.fecha} aria-labelledby={`dia-${d.fecha}`} className="overflow-hidden rounded-xl border border-border bg-card">
              <h2 id={`dia-${d.fecha}`} className="m-0 flex items-baseline justify-between gap-3 border-b border-border bg-muted px-5 py-2.5 text-sm font-semibold">
                <span className="first-letter:uppercase">{nombreDia(d.fecha)}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {nuevos > 0 && <span className="mr-2 inline-flex items-center gap-1 font-medium text-foreground"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primario" />{nuevos} {nuevos === 1 ? "nuevo" : "nuevos"} ·</span>}
                  {d.cambios.length} {d.cambios.length === 1 ? "cambio" : "cambios"}
                </span>
              </h2>
              <ul className="m-0 list-none divide-y divide-border p-0">
                {d.cambios.map((c) => {
                  const Icono = (c.modulo && ICONO_MODULO[c.modulo]) || HistorialIcon;
                  const nuevo = referencia !== null && c.fecha > referencia;
                  return (
                    <li key={`${c.fecha}-${c.titulo}`} className="flex gap-3 px-5 py-3.5">
                      <Icono aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {c.href ? (
                            <Link href={c.href} className={`rounded text-sm font-medium hover:underline ${anilloFoco}`}>
                              {c.titulo}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium">{c.titulo}</span>
                          )}
                          {nuevo && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primario">
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primario" />
                              Nuevo
                            </span>
                          )}
                        </div>
                        <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{c.texto}</p>
                        <span className="text-[11px] text-muted-foreground">{c.modulo ? (etiqueta.get(c.modulo) ?? c.modulo) : "Todo el sistema"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
