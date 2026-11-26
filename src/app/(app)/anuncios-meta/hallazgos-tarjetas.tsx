"use client";

import { useState } from "react";
import { NOMBRE_CATEGORIA, seccionDeHallazgo, type Hallazgo, type SeccionHallazgo, type TonoHallazgo } from "@/lib/meta-ads/historico";
import { dolares } from "@/lib/meta-ads/metricas";
import { claveDeDecision } from "@/lib/meta-ads/sugerencias";
import { GuiaEnLinea } from "./aviso-tope";
import { BotonesDecidir, Omitidas, useDecisiones } from "./decidir";
import { InsigniaCerteza } from "./graficas";
import { SeccionPlegable } from "./plegable";
import { Cuales } from "./cuales";

const TONO: Record<TonoHallazgo, { fondo: string; texto: string; etiqueta: string }> = {
  alerta: { fondo: "bg-destructive-soft", texto: "text-destructive", etiqueta: "Para atender" },
  bueno: { fondo: "bg-success-soft", texto: "text-success", etiqueta: "Buena noticia" },
  info: { fondo: "bg-azul-soft", texto: "text-azul", etiqueta: "En observación" },
};

export const NOMBRE_SECCION: Record<SeccionHallazgo, string> = { productos: "Productos", campanas: "Campañas", videos: "Videos", general: "General" };

/** El ícono de cada tono: el significado va también en la forma, no solo en el color. */
function IconoTono({ tono }: { tono: TonoHallazgo }) {
  const t = TONO[tono];
  return (
    <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.fondo} ${t.texto}`}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {tono === "alerta" ? <path d="M8 2.5 14 13H2L8 2.5Zm0 4v3m0 1.8v.1" /> : tono === "bueno" ? <path d="m3.5 8.5 3 3 6-6.5" /> : <path d="M8 7v4.5M8 4.6v.1" />}
      </svg>
    </span>
  );
}

/**
 * Un hallazgo como tarjeta (24 nov 2026, rediseño pedido por Alcides: «demasiado simple, un montón de texto»): con el ícono y el color de su tono, el título, lo que importa de un vistazo (qué tan seguro es, cuánto dinero hay detrás y de qué trata)
 * y, plegado con la flecha, el detalle, el porqué y qué hacer. El detalle es un `<details>` nativo: funciona con teclado y sin código.
 */
export function TarjetaHallazgo({ h, conSeccion = false }: { h: Hallazgo; conSeccion?: boolean }) {
  const t = TONO[h.tono];
  const hayMas = Boolean(h.detalle || h.motivo || h.accion || h.quienes);
  return (
    <li className="rounded-lg border border-border bg-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground [&::-webkit-details-marker]:hidden">
          <IconoTono tono={h.tono} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug">{h.titulo}</span>
            {h.quienes?.deQue && <span className="mt-1 block text-xs">{h.quienes.deQue}</span>}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <InsigniaCerteza certeza={h.certeza} />
              <span className={`rounded-full px-2 py-0.5 font-medium ${t.fondo} ${t.texto}`}>{t.etiqueta}</span>
              <span>{NOMBRE_CATEGORIA[h.categoria]}</span>
              {conSeccion && <span>· {NOMBRE_SECCION[seccionDeHallazgo(h)]}</span>}
              {h.gasto > 0 && <span className="tabular-nums">· {dolares(h.gasto)} gastados</span>}
              {h.tono === "alerta" && h.impacto !== undefined && h.impacto >= 1 && <span className="font-medium tabular-nums text-destructive">· {dolares(h.impacto)} sobre el tope</span>}
            </span>
          </span>
          {hayMas && (
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className="mt-2 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          )}
        </summary>
        <div className="flex flex-col gap-2 border-t border-border px-3 py-3 text-sm sm:pl-14">
          <p className="m-0 text-muted-foreground">{h.detalle}</p>
          {h.motivo && (
            <p className="m-0 flex gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs">
              <span className="shrink-0 font-semibold">Por qué</span>
              <span>{h.motivo}</span>
            </p>
          )}
          {h.accion && (
            <p className="m-0 flex gap-2 rounded-md bg-success-soft px-2.5 py-1.5 text-xs text-foreground">
              <span className="shrink-0 font-semibold text-success">Qué hacer</span>
              <span>{h.accion}</span>
            </p>
          )}
          {h.quienes && <Cuales quienes={h.quienes} />}
        </div>
      </details>
      {h.guia && <GuiaEnLinea guia={h.guia} className="px-3 pb-2 sm:pl-14" />}
      <BotonesDecidir clave={claveDeDecision(h)} titulo={h.titulo} accion={h.accion} className="px-3 pb-2.5 sm:pl-14" />
    </li>
  );
}

/** Una lista de hallazgos que muestra los primeros y se abre con «Ver los N restantes» (y se vuelve a cerrar). */
export function ListaHallazgos({ hallazgos, vistos = 5, conSeccion = false, vacio }: { hallazgos: Hallazgo[]; vistos?: number; conSeccion?: boolean; vacio?: string }) {
  const [todos, setTodos] = useState(false);
  const { ocultas } = useDecisiones();
  const pendientes = hallazgos.filter((h) => !ocultas.has(claveDeDecision(h)));
  const omitidos = hallazgos.filter((h) => ocultas.has(claveDeDecision(h))).map((h) => ({ clave: claveDeDecision(h), titulo: h.titulo }));
  if (pendientes.length === 0)
    return (
      <div className="flex flex-col gap-2">
        {(vacio || omitidos.length > 0) && <p className="m-0 text-sm text-muted-foreground">{vacio ?? "Nada pendiente aquí."}</p>}
        <Omitidas items={omitidos} />
      </div>
    );
  const lista = todos ? pendientes : pendientes.slice(0, vistos);
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lista.map((h) => (
          <TarjetaHallazgo key={h.id} h={h} conSeccion={conSeccion} />
        ))}
      </ul>
      {pendientes.length > vistos && (
        <button type="button" aria-expanded={todos} onClick={() => setTodos((v) => !v)} className="min-h-9 self-start rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
          {todos ? "Ver menos" : `Ver los ${pendientes.length - vistos} restantes`}
        </button>
      )}
      <Omitidas items={omitidos} />
    </div>
  );
}

/** «3 para atender · 2 buenas noticias»: lo que hay en una lista de hallazgos, en una línea. */
export function resumenDeHallazgos(hallazgos: readonly Hallazgo[]): string {
  const atender = hallazgos.filter((h) => h.tono === "alerta").length;
  const buenas = hallazgos.filter((h) => h.tono === "bueno").length;
  const mirando = hallazgos.filter((h) => h.tono === "info").length;
  const partes = [atender ? `${atender} para atender` : "", mirando ? `${mirando} en observación` : "", buenas ? `${buenas} buena${buenas === 1 ? "" : "s"} noticia${buenas === 1 ? "" : "s"}` : ""].filter(Boolean);
  return partes.join(" · ") || "Nada pendiente";
}

/**
 * Lo que dice el historial sobre una pantalla (Productos, Campañas o Videos): sus hallazgos como tarjetas plegables. Plegada deja una línea con cuántos piden atención. No se dibuja si no hay ninguno.
 */
export function HallazgosDeSeccion({ titulo, hallazgos, abierta = true }: { titulo: string; hallazgos: Hallazgo[]; abierta?: boolean }) {
  const { ocultas } = useDecisiones();
  if (hallazgos.length === 0) return null;
  const pendientes = hallazgos.filter((h) => !ocultas.has(claveDeDecision(h)));
  return (
    <SeccionPlegable titulo={titulo} abierta={abierta} resumen={resumenDeHallazgos(pendientes)} derecha={`${pendientes.length} hallazgo${pendientes.length === 1 ? "" : "s"}`}>
      <ListaHallazgos hallazgos={hallazgos} />
    </SeccionPlegable>
  );
}
