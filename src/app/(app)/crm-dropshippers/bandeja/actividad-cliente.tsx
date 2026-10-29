"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { etiquetaDeMotivo, ETIQUETA_ESTADO, type EstadoDia } from "@/lib/whatsapp/actividad";
import { actividadDelCliente, analizarActividadDelCliente, type ActividadCliente } from "./actividad-actions";

const DIAS_VISIBLES = 5;

const PUNTO_ESTADO: Record<EstadoDia, string> = { resuelta: "bg-success", pendiente: "bg-warning", sin_consulta: "bg-[var(--wa-sec)]" };

/** «hace 3 h», «hace 2 días»: cuánto lleva esperando. Solo se llama con datos que llegaron del servidor, ya en el navegador. */
function haceCuanto(iso: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

const fechaDelDia = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });

/**
 * «Actividad del cliente» en la ficha del chat (pedido de Jhokser, 29 oct 2026): por qué escribió el dropshipper cada día, entendido por la IA a partir de sus mensajes, si tiene
 * una consulta sin responder y los motivos que más repite. Solo se paga la IA al pulsar «Analizar» y solo por los días con mensajes nuevos.
 */
export function ActividadDelClienteFicha({ conversacionId, escribe }: { conversacionId: string; escribe: boolean }) {
  const [datos, setDatos] = useState<ActividadCliente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [verTodo, setVerTodo] = useState(false);
  // La bandeja lo monta de nuevo con cada chat (`key`), así que lo que llega siempre es de este chat.
  const vigente = useRef(true);

  useEffect(() => {
    vigente.current = true;
    actividadDelCliente(conversacionId)
      .then((r) => {
        if (!vigente.current) return;
        if ("error" in r) setError(r.error);
        else setDatos(r);
      })
      .catch(() => vigente.current && setError("No se pudo cargar la actividad."));
    return () => {
      vigente.current = false;
    };
  }, [conversacionId]);

  async function analizar() {
    setAnalizando(true);
    setError(null);
    const r = await analizarActividadDelCliente(conversacionId).catch(() => ({ error: "No se pudo analizar. Inténtalo de nuevo." }));
    if (!vigente.current) return;
    setAnalizando(false);
    if ("error" in r) setError(r.error);
    else setDatos(r);
  }

  const dias = datos?.dias ?? [];
  const mostrados = verTodo ? dias : dias.slice(0, DIAS_VISIBLES);

  return (
    <div className="flex flex-col gap-2.5 border-b-8 border-[var(--wa-panel)] px-5 py-4">
      <h3 className="m-0 text-[13px] font-normal text-[var(--wa-sec)]">Actividad del cliente</h3>
      {!datos && !error && <span className="text-[13px] text-[var(--wa-sec)]">Cargando…</span>}
      {datos?.falta && <span className="text-[13px] text-[var(--wa-sec)]">Falta correr la migración 0182 (actividad del cliente).</span>}
      {datos && !datos.falta && (
        <>
          <p className="m-0 flex items-start gap-2 text-[14px]">
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${datos.situacion.tipo === "espera" ? "bg-destructive" : datos.situacion.tipo === "sin_resolver" ? "bg-warning" : "bg-success"}`} />
            <span>
              {datos.situacion.tipo === "espera" && `Espera respuesta ${haceCuanto(datos.situacion.desde)}`}
              {datos.situacion.tipo === "sin_resolver" && `Quedó una consulta sin resolver (${fechaDelDia(datos.situacion.dia)}): ${datos.situacion.resumen}`}
              {datos.situacion.tipo === "al_dia" && "Al día: no tiene nada pendiente"}
            </span>
          </p>

          {datos.frecuentes.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[12.5px] text-[var(--wa-sec)]">Lo que más consulta</span>
              <div className="flex flex-wrap gap-1.5">
                {datos.frecuentes.slice(0, 4).map((f) => (
                  <span key={f.id} className="rounded-full bg-[var(--wa-panel)] px-2.5 py-0.5 text-[12.5px]">
                    {f.etiqueta} <span className="tabular-nums text-[var(--wa-sec)]">· {f.dias} {f.dias === 1 ? "día" : "días"}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {mostrados.length > 0 && (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {mostrados.map((d) => (
                <li key={d.dia} className="rounded-lg border border-[var(--wa-borde)] px-2.5 py-2 text-[13px]">
                  <div className="flex items-center gap-1.5 text-[12px] text-[var(--wa-sec)]">
                    <span aria-hidden="true" className={`h-2 w-2 flex-none rounded-full ${PUNTO_ESTADO[d.estado]}`} />
                    <span className="capitalize">{fechaDelDia(d.dia)}</span>
                    <span>· {ETIQUETA_ESTADO[d.estado]}</span>
                  </div>
                  <p className="m-0 mt-1">{d.resumen}</p>
                  {d.estado !== "sin_consulta" && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.motivos.map((m) => (
                        <span key={m} className="rounded-md bg-[var(--wa-panel)] px-1.5 py-px text-[11.5px] text-[var(--wa-sec)]">
                          {etiquetaDeMotivo(m)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {dias.length > DIAS_VISIBLES && (
            <button type="button" onClick={() => setVerTodo((v) => !v)} className={`self-start text-[13px] font-medium text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
              {verTodo ? "Ver menos" : `Ver los ${dias.length} días`}
            </button>
          )}
          {dias.length === 0 && datos.porAnalizar === 0 && <span className="text-[13px] text-[var(--wa-sec)]">Todavía no hay mensajes para analizar.</span>}

          {datos.porAnalizar > 0 &&
            (datos.iaConectada ? (
              escribe ? (
                <button
                  type="button"
                  onClick={() => void analizar()}
                  disabled={analizando}
                  className={`inline-flex min-h-9 items-center justify-center rounded-lg bg-[var(--wa-acento)] px-3 text-[13px] font-semibold text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-60 ${anilloFoco}`}
                >
                  {analizando ? "Analizando…" : `Analizar ${datos.porAnalizar} ${datos.porAnalizar === 1 ? "día" : "días"} con IA`}
                </button>
              ) : (
                <span className="text-[13px] text-[var(--wa-sec)]">
                  Hay {datos.porAnalizar} {datos.porAnalizar === 1 ? "día" : "días"} sin analizar.
                </span>
              )
            ) : (
              <span className="text-[13px] text-[var(--wa-sec)]">Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel).</span>
            ))}
        </>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
