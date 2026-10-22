"use client";

import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { copiar } from "@/components/ui/sku-copiable";
import { useToast } from "@/components/ui/toast";
import { CheckIcon, EstadoIcon, OfertaIcon } from "@/lib/nav-icons";
import type { EstadoRevision } from "@/lib/publicaciones/optimizacion";
import type { SugerenciaTitulo } from "@/lib/publicaciones/titulos-ia";
import { sugerirTitulosIA } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

/** Cómo se marca cada punto: no solo con color (ícono o punto + texto). */
const MARCA: Record<EstadoRevision, { texto: string; clase: string }> = {
  ok: { texto: "Cumple", clase: "text-success" },
  falta: { texto: "Falta", clase: "text-destructive" },
  revisar: { texto: "Revisar", clase: "text-warning" },
  sin_datos: { texto: "Sin datos", clase: "text-muted-foreground" },
  no_aplica: { texto: "No aplica", clase: "text-muted-foreground" },
};

/**
 * El bloque «Optimización» de la ficha: cada punto de lo que se publica en Dropi (título, fotos, video, descripción, precio
 * sugerido) con si cumple, y la nota. Lo que falta sale también como recomendación arriba. Quien puede editar tiene además
 * «Sugerir títulos con IA».
 */
export function OptimizacionFicha({ p, puedeEscribir }: { p: FilaPublicacion; puedeEscribir: boolean }) {
  return (
    <div className="border-b border-border px-5 py-5">
      <Seccion icono={EstadoIcon} titulo="Optimización en Dropi">
        <p className="m-0 text-sm">
          <span className="font-semibold tabular-nums">
            {p.nota.cumple} de {p.nota.total}
          </span>{" "}
          puntos cumplidos
          {p.tituloDropi && p.tituloDropi !== p.nombre && <span className="block text-xs text-muted-foreground">En Dropi se ve como «{p.tituloDropi}»</span>}
        </p>
        <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 sm:grid-cols-2">
          {p.revisiones.map((r) => {
            const m = MARCA[r.estado];
            return (
              <li key={r.clave} className="flex min-w-0 gap-2 text-sm">
                {r.estado === "ok" ? (
                  <CheckIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.estado === "falta" ? "bg-destructive" : r.estado === "revisar" ? "bg-warning" : "bg-border-control"}`} />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {r.etiqueta} <span className={`text-xs font-normal ${m.clase}`}>· {m.texto}</span>
                  </span>
                  <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.detalle}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {puedeEscribir && <TitulosIA p={p} />}
      </Seccion>
    </div>
  );
}

const BOTON = `inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

/**
 * «Sugerir títulos con IA»: ChatGPT propone títulos con las mismas reglas de arriba; cada uno trae sus caracteres, cuántos puntos de
 * título cumple y «Copiar» para pegarlo en Dropi. No se guarda nada en el sistema.
 */
function TitulosIA({ p }: { p: FilaPublicacion }) {
  const [resultado, setResultado] = useState<{ sugerencias: SugerenciaTitulo[] } | { error: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();

  function pedir() {
    iniciar(async () => {
      try {
        setResultado(await sugerirTitulosIA(p.id, p.tituloDropi));
      } catch {
        setResultado({ error: "No se pudo pedir las sugerencias. Prueba otra vez." });
      }
    });
  }

  async function alCopiar(titulo: string) {
    if (await copiar(titulo)) mostrarToast(`Título copiado: ${titulo}`);
    else mostrarToast("No se pudo copiar el título.", "destructive");
  }

  const sugerencias = resultado && "sugerencias" in resultado ? resultado.sugerencias : null;
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={pedir} disabled={pendiente} className={BOTON}>
          <OfertaIcon aria-hidden="true" className="h-4 w-4" />
          {pendiente ? "Pidiendo a ChatGPT..." : sugerencias ? "Otras sugerencias" : "Sugerir títulos con IA"}
        </button>
        <span className="text-xs text-muted-foreground">ChatGPT propone títulos con estas reglas. Cópialo y cámbialo en Dropi.</span>
      </div>
      <div aria-live="polite" className="contents">
        {resultado && "error" in resultado && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {resultado.error}
          </p>
        )}
        {sugerencias && (
          <ul aria-busy={pendiente} className={`m-0 flex list-none flex-col gap-2 p-0 ${pendiente ? "opacity-60" : ""}`}>
            {sugerencias.map((s) => {
              const pendientes = s.revisiones.filter((r) => r.estado === "falta" || r.estado === "revisar");
              return (
                <li key={s.titulo} className="flex min-w-0 items-start gap-3 rounded-lg border border-border px-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium [overflow-wrap:anywhere]">{s.titulo}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.titulo.length} caracteres ·{" "}
                      <span className={s.cumple === s.total ? "text-success" : "text-warning"}>
                        cumple {s.cumple} de {s.total}
                      </span>
                      {pendientes.length > 0 && <> · {pendientes.map((r) => `${r.etiqueta.toLowerCase()}: ${r.detalle.toLowerCase()}`).join("; ")}</>}
                    </span>
                    {s.porque && <span className="text-xs text-muted-foreground">{s.porque}</span>}
                  </span>
                  <button type="button" onClick={() => alCopiar(s.titulo)} aria-label={`Copiar el título ${s.titulo}`} className={`${BOTON} shrink-0 px-2.5 py-1.5 text-xs`}>
                    Copiar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
