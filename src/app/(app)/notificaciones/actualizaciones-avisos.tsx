"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { marcarNovedades } from "@/lib/ayuda/novedades-actions";
import { formatearFecha } from "@/lib/formato";

export interface ActualizacionAviso {
  clave: string;
  fecha: string;
  titulo: string;
  texto: string;
  href: string | null;
  /** «Gestión de IDs Dropi», o null si es de todo el sistema. */
  modulo: string | null;
  vista: boolean;
}

type Filtro = "por_leer" | "leidas" | "todas";

/**
 * «Actualizaciones del sistema» en el Centro de notificaciones (31 oct 2026, pedido de Alcides), como la bandeja de ClickUp: lo que cambió en el
 * sistema en los últimos días, de los módulos de cada persona. Al abrir una se marca como leída (por persona, migración 0218); se puede volver a
 * dejar por leer o marcarlas todas. «Por leer» y «Leídas» separan lo visto de lo que falta.
 */
export function ActualizacionesAvisos({ actualizaciones, dias }: { actualizaciones: ActualizacionAviso[]; dias: number }) {
  const { mostrarToast } = useToast();
  const [vistas, setVistas] = useState(() => new Set(actualizaciones.filter((a) => a.vista).map((a) => a.clave)));
  const [filtro, setFiltro] = useState<Filtro>(() => (actualizaciones.some((a) => !a.vista) ? "por_leer" : "todas"));
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const porLeer = actualizaciones.filter((a) => !vistas.has(a.clave));
  const lista = filtro === "por_leer" ? porLeer : filtro === "leidas" ? actualizaciones.filter((a) => vistas.has(a.clave)) : actualizaciones;

  function marcar(claves: string[], vista: boolean) {
    const antes = vistas;
    setVistas((v) => {
      const n = new Set(v);
      for (const c of claves) {
        if (vista) n.add(c);
        else n.delete(c);
      }
      return n;
    });
    empezar(async () => {
      const r = await marcarNovedades(claves, vista).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) {
        setVistas(antes);
        mostrarToast(r.error, "destructive");
      }
    });
  }

  function abrir(a: ActualizacionAviso) {
    setAbierta((x) => (x === a.clave ? null : a.clave));
    if (!vistas.has(a.clave)) marcar([a.clave], true);
  }

  const claseFiltro = (activo: boolean) => `min-h-8 rounded-md px-2.5 text-xs font-medium ${anilloFoco} ${activo ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  return (
    <section aria-labelledby="titulo-actualizaciones" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-actualizaciones" className="m-0 text-sm font-semibold">
          Actualizaciones del sistema{" "}
          {porLeer.length > 0 && <span className="ml-1 rounded-full bg-aviso px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">{porLeer.length}</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Qué actualizaciones ver" className="inline-flex rounded-lg border border-border p-0.5">
            <button type="button" aria-pressed={filtro === "por_leer"} onClick={() => setFiltro("por_leer")} className={claseFiltro(filtro === "por_leer")}>
              Por leer <span className="tabular-nums">{porLeer.length}</span>
            </button>
            <button type="button" aria-pressed={filtro === "leidas"} onClick={() => setFiltro("leidas")} className={claseFiltro(filtro === "leidas")}>
              Leídas
            </button>
            <button type="button" aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")} className={claseFiltro(filtro === "todas")}>
              Todas
            </button>
          </div>
          {porLeer.length > 0 && (
            <BotonBarra disabled={pendiente} onClick={() => marcar(porLeer.map((a) => a.clave), true)}>
              Marcar todas como leídas
            </BotonBarra>
          )}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {filtro === "por_leer" ? `Estás al día: leíste todas las actualizaciones de los últimos ${dias} días.` : filtro === "leidas" ? "Todavía no has leído ninguna." : `No hubo actualizaciones de tus módulos en los últimos ${dias} días.`}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {lista.map((a) => {
            const vista = vistas.has(a.clave);
            const abiertaEsta = abierta === a.clave;
            return (
              <li key={a.clave} className={`rounded-lg ${vista ? "" : "bg-primario-suave"}`}>
                <button type="button" aria-expanded={abiertaEsta} onClick={() => abrir(a)} className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted ${anilloFoco}`}>
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${vista ? "bg-transparent" : "bg-primario"}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`text-sm ${vista ? "" : "font-semibold"}`}>{a.titulo}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatearFecha(a.fecha)}
                      {a.modulo ? ` · ${a.modulo}` : ""}
                      <span className="sr-only">{vista ? " · leída" : " · por leer"}</span>
                    </span>
                  </span>
                </button>
                {abiertaEsta && (
                  <div className="flex flex-col gap-2 px-3 pb-3 pl-[2.1rem]">
                    <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{a.texto}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {a.href && (
                        <Link href={a.href} className={`rounded font-medium text-primario hover:underline ${anilloFoco}`}>
                          Ir a verlo
                        </Link>
                      )}
                      {vista && (
                        <button type="button" disabled={pendiente} onClick={() => marcar([a.clave], false)} className={`rounded text-muted-foreground hover:text-foreground hover:underline ${anilloFoco}`}>
                          Marcar como no leída
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
