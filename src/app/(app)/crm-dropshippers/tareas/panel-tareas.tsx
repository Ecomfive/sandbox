"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { GRUPOS_TAREA, type GrupoTarea } from "@/lib/crm/tareas";
import { formatearFecha } from "@/lib/formato";
import { completarTarea, listarTareas, type TareaVista } from "./actions";

/** Lo que dice la fecha de una tarea según su grupo. */
function textoFecha(t: TareaVista): string | null {
  if (t.grupo === "esperando") return t.llegadaEstimada ? `Llega aprox. ${formatearFecha(t.llegadaEstimada)}` : "Sin fecha de llegada todavía";
  if (t.grupo === "hecha" || !t.vence) return null;
  if (t.grupo === "hoy") return "Hoy";
  return t.grupo === "atrasada" ? `Era para el ${formatearFecha(t.vence)}` : formatearFecha(t.vence);
}

/** Una tarea del panel: la casilla de hecha, qué hay que hacer, con quién y para cuándo, y el enlace al chat. */
export function FilaTarea({ t, alCambiar, compacta = false }: { t: TareaVista; alCambiar: (t: TareaVista, hecha: boolean) => void; compacta?: boolean }) {
  const hecha = t.estado === "hecha";
  const fecha = textoFecha(t);
  return (
    <li className={`flex items-start gap-3 border-b border-border last:border-b-0 ${compacta ? "py-2" : "px-4 py-3"}`}>
      <input
        type="checkbox"
        checked={hecha}
        disabled={!t.puedeCompletar}
        onChange={(e) => alCambiar(t, e.target.checked)}
        aria-label={`${hecha ? "Volver a abrir" : "Marcar hecha"}: ${t.titulo}`}
        className="mt-0.5 h-4 w-4 flex-none"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[13.5px] font-medium [overflow-wrap:anywhere] ${hecha ? "text-muted-foreground line-through" : ""}`}>{t.titulo}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {t.cliente && <span className="font-medium text-foreground">{t.cliente}</span>}
          {t.vip && <Pastilla tono="oscuro">VIP</Pastilla>}
          {t.producto && t.origen !== "llegada" && <span>· {t.producto}</span>}
          {fecha && <span className={t.grupo === "atrasada" ? "font-medium text-destructive" : t.grupo === "hoy" ? "font-medium text-foreground" : ""}>· {fecha}</span>}
          {!compacta && <span>· {t.responsable ? (t.esMia ? "Tú" : t.responsable) : "Sin responsable"}</span>}
        </span>
        {t.detalle && <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{t.detalle}</span>}
      </div>
      {!compacta && (t.conversacionId || t.dropshipperId) && (
        <Link
          href={t.conversacionId ? `/crm-dropshippers/bandeja?abrir=${t.conversacionId}` : `/crm-dropshippers?abrir=${t.dropshipperId}`}
          className={`flex-none self-center rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted ${anilloFoco}`}
        >
          {t.conversacionId ? "Abrir chat" : "Abrir ficha"}
        </Link>
      )}
    </li>
  );
}

/**
 * CRM Dropshippers › Tareas (29 oct 2026, pedido de Hernán): lo que hay que hacer con cada cliente, agrupado por cuándo (atrasadas, hoy,
 * próximas), las que esperan que llegue un producto y las hechas del último mes. «Mías» son las que tienes a cargo; las del chat quedan a
 * cargo de quien lleva el chat. Cuando una tarea llega a su fecha o llega el producto, te avisa la campana.
 */
export function PanelTareas({ inicial }: { inicial: TareaVista[] }) {
  const { mostrarToast } = useToast();
  const [filtro, setFiltro] = useState<"mias" | "todas">("mias");
  const [tareas, setTareas] = useState(inicial);
  const [cargando, empezar] = useTransition();
  const [verHechas, setVerHechas] = useState(false);

  const cargar = (f: "mias" | "todas") =>
    empezar(async () => {
      const r = await listarTareas(f).catch(() => ({ error: "No se pudieron cargar las tareas." }));
      if ("error" in r) mostrarToast(r.error, "destructive");
      else setTareas(r.tareas);
    });

  const cambiar = (t: TareaVista, hecha: boolean) =>
    empezar(async () => {
      const r = await completarTarea(t.id, hecha).catch(() => ({ error: "No se pudo actualizar la tarea." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(hecha ? "Tarea hecha." : "Tarea abierta de nuevo.");
      const n = await listarTareas(filtro).catch(() => null);
      if (n && !("error" in n)) setTareas(n.tareas);
    });

  const porGrupo = (g: GrupoTarea) => tareas.filter((t) => t.grupo === g);
  const urgentes = porGrupo("atrasada").length + porGrupo("hoy").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Qué tareas ver" className="flex rounded-lg bg-muted p-[3px]">
          {(["mias", "todas"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => {
                setFiltro(f);
                cargar(f);
              }}
              className={`min-h-8 rounded-md px-3 text-[13px] ${filtro === f ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"} ${anilloFoco}`}
            >
              {f === "mias" ? "Mías" : "Todas"}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-muted-foreground" aria-live="polite">
          {cargando ? "Actualizando…" : urgentes ? `${urgentes} para hoy o atrasada${urgentes === 1 ? "" : "s"}` : "Nada para hoy"}
        </span>
      </div>

      {GRUPOS_TAREA.filter((g) => g.grupo !== "hecha" || verHechas).map(({ grupo, titulo }) => {
        const lista = porGrupo(grupo);
        if (!lista.length) return null;
        return (
          <section key={grupo} className="overflow-hidden rounded-[10px] border border-border bg-card">
            <h2 className={`m-0 flex items-center gap-2 border-b border-border px-4 py-2.5 text-[13px] font-semibold ${grupo === "atrasada" ? "text-destructive" : ""}`}>
              {titulo}
              <span className="font-normal text-muted-foreground tabular-nums">{lista.length}</span>
            </h2>
            <ul className="m-0 list-none p-0">
              {lista.map((t) => (
                <FilaTarea key={t.id} t={t} alCambiar={cambiar} />
              ))}
            </ul>
          </section>
        );
      })}

      {tareas.every((t) => t.grupo === "hecha") && (
        <p className="m-0 rounded-[10px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {filtro === "mias" ? "No tienes tareas pendientes." : "No hay tareas pendientes."} Se crean desde la ficha de un chat de la Bandeja: «Tarea», o «Avisarme cuando llegue» en un producto.
        </p>
      )}

      {porGrupo("hecha").length > 0 && (
        <button type="button" onClick={() => setVerHechas((v) => !v)} className={`self-start text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground ${anilloFoco}`}>
          {verHechas ? "Ocultar las hechas" : `Ver las hechas del último mes (${porGrupo("hecha").length})`}
        </button>
      )}
    </div>
  );
}
