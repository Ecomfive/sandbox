"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ICONO_MODULO } from "@/components/ayuda/iconos-modulo";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { agruparPorDia, claveNovedad, filtrarCambios } from "@/lib/ayuda/actualizaciones";
import { marcarNovedades } from "@/lib/ayuda/novedades-actions";
import type { Novedad } from "@/lib/ayuda/contenido";
import { formatearFecha } from "@/lib/formato";
import { CheckIcon, HistorialIcon, NoLeidoIcon } from "@/lib/nav-icons";


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

/** Quiénes vieron una actualización, para el administrador. */
type Ver = "por_ver" | "vistos" | "todos";

export interface LecturaNovedad {
  vieron: string[];
  faltan: string[];
}

/**
 * La lista de Actualizaciones (administradores): buscar, filtrar por módulo y, por día, cada cambio con su módulo y un enlace a dónde verlo. Lo que
 * el administrador no ha visto lleva «Nuevo» (lo visto se guarda por persona, migración 0218, igual que en el Centro de notificaciones), y cada
 * cambio dice cuántas personas de su módulo ya lo vieron y quiénes faltan. Cada uno se marca visto o nuevo con el botón de su derecha (5 nov 2026).
 * Arranca en «Por ver»: lo que se marca visto sale de la lista y queda en «Vistos». No hay «Marcar todo como visto» (5 nov 2026, pedido de Alcides).
 */
export function ListaActualizaciones({
  novedades,
  modulos,
  vistas,
  lecturas,
}: {
  novedades: Novedad[];
  modulos: { clave: string; etiqueta: string }[];
  /** Las claves que ya vio quien mira. */
  vistas: string[];
  /** Por clave, quiénes la vieron y quiénes de su módulo faltan. */
  lecturas: Record<string, LecturaNovedad>;
}) {
  const { mostrarToast } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [modulo, setModulo] = useState("");
  const [ver, setVer] = useState<Ver>("por_ver");
  const [marcando, empezar] = useTransition();
  // Lo marcado aquí se ve al instante, antes de que el servidor vuelva a mandar las vistas (y vuelve atrás si falla).
  const [cambiadas, setCambiadas] = useState<Record<string, boolean>>({});
  const vistasSet = useMemo(() => {
    const s = new Set(vistas);
    for (const [clave, vista] of Object.entries(cambiadas)) {
      if (vista) s.add(clave);
      else s.delete(clave);
    }
    return s;
  }, [vistas, cambiadas]);

  function marcar(claves: string[], vista: boolean) {
    const antes = cambiadas;
    setCambiadas((c) => ({ ...c, ...Object.fromEntries(claves.map((k) => [k, vista])) }));
    empezar(async () => {
      const r = await marcarNovedades(claves, vista).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) {
        setCambiadas(antes);
        mostrarToast(r.error, "destructive");
      }
    });
  }

  const etiqueta = useMemo(() => new Map(modulos.map((m) => [m.clave, m.etiqueta])), [modulos]);
  const buscadas = useMemo(() => filtrarCambios(novedades, busqueda, modulo), [novedades, busqueda, modulo]);
  const porVer = buscadas.filter((c) => !vistasSet.has(claveNovedad(c)));
  const filtradas = ver === "por_ver" ? porVer : ver === "vistos" ? buscadas.filter((c) => vistasSet.has(claveNovedad(c))) : buscadas;
  const dias = agruparPorDia(filtradas);
  const claseVer = (activo: boolean) => `min-h-9 rounded-md px-3 text-sm font-medium ${anilloFoco} ${activo ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

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
        <div role="group" aria-label="Qué cambios ver" className="inline-flex rounded-lg border border-border p-0.5">
          <button type="button" aria-pressed={ver === "por_ver"} onClick={() => setVer("por_ver")} className={claseVer(ver === "por_ver")}>
            Por ver <span className="tabular-nums">{porVer.length}</span>
          </button>
          <button type="button" aria-pressed={ver === "vistos"} onClick={() => setVer("vistos")} className={claseVer(ver === "vistos")}>
            Vistos
          </button>
          <button type="button" aria-pressed={ver === "todos"} onClick={() => setVer("todos")} className={claseVer(ver === "todos")}>
            Todos
          </button>
        </div>
        <p className="m-0 pb-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {filtradas.length} {filtradas.length === 1 ? "cambio" : "cambios"} en {dias.length} {dias.length === 1 ? "día" : "días"}
        </p>
      </div>

      {dias.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          {ver === "por_ver" && !busqueda && !modulo ? "Estás al día: ya viste todos los cambios." : ver === "vistos" && !busqueda && !modulo ? "Todavía no has marcado ningún cambio como visto." : "Ningún cambio coincide con la búsqueda."}
        </p>
      ) : (
        dias.map((d) => {
          const nuevos = d.cambios.filter((c) => !vistasSet.has(claveNovedad(c))).length;
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
                  const nuevo = !vistasSet.has(claveNovedad(c));
                  const l = lecturas[claveNovedad(c)];
                  return (
                    <li key={`${c.fecha}-${c.titulo}`} className="flex gap-3 px-5 py-3.5">
                      <Icono aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                        {l && (
                          <details className="text-[11px] text-muted-foreground">
                            <summary className={`w-fit cursor-pointer rounded ${anilloFoco}`}>
                              Lo vieron {l.vieron.length} de {l.vieron.length + l.faltan.length}
                            </summary>
                            <p className="m-0 mt-1">{l.vieron.length ? `Vieron: ${l.vieron.join(", ")}` : "Nadie lo ha visto."}</p>
                            {l.faltan.length > 0 && <p className="m-0">Faltan: {l.faltan.join(", ")}</p>}
                          </details>
                        )}
                      </div>
                      <Tooltip texto={nuevo ? "Marcar como visto" : "Marcar como nuevo"}>
                        <button
                          type="button"
                          disabled={marcando}
                          onClick={() => marcar([claveNovedad(c)], nuevo)}
                          aria-label={`${nuevo ? "Marcar como visto" : "Marcar como nuevo"}: ${c.titulo}`}
                          className={`-mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60 ${anilloFoco}`}
                        >
                          {nuevo ? <CheckIcon aria-hidden="true" className="h-4 w-4" /> : <NoLeidoIcon aria-hidden="true" className="h-4 w-4" />}
                        </button>
                      </Tooltip>
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
