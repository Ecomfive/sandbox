"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { personasDe, type ClaseEvento, type EventoEquipo } from "@/lib/whatsapp/actividad-equipo";
import { actividadDelEquipo } from "./equipo-actions";
import { usePlegado } from "./usar-plegado";

const PUNTO: Record<ClaseEvento, string> = { mensaje: "bg-[var(--wa-acento)]", nota: "bg-warning", archivo: "bg-azul", cambio: "bg-[var(--wa-sec)]" };
const NOMBRE_CLASE: Record<ClaseEvento, string> = { mensaje: "Respuesta", nota: "Nota privada", archivo: "Archivo", cambio: "Cambio" };

const cuando = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * «Actividad del equipo» en la ficha del chat (pedido de Jhokser, 29 oct 2026): qué hizo cada persona con este cliente —creó un caso o un pedido, cambió el nombre, sus
 * datos o sus etiquetas, vinculó el chat, lo pasó de área…— con filtro por persona. No repite los mensajes, que ya están en el chat (pedido de Alcides). Del más nuevo al más viejo.
 */
export function ActividadDelEquipoFicha({ conversacionId, version }: { conversacionId: string; version: string }) {
  const [eventos, setEventos] = useState<EventoEquipo[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [quien, setQuien] = useState("");
  // La bandeja lo monta de nuevo con cada chat (`key`), así que lo que llega siempre es de este chat.
  const [plegado, alternarPlegado] = usePlegado(`equipo:${conversacionId}`);
  const vigente = useRef(true);

  useEffect(() => {
    vigente.current = true;
    actividadDelEquipo(conversacionId)
      .then((r) => {
        if (!vigente.current) return;
        if ("error" in r) return setError(r.error);
        setEventos(r.eventos);
        setHayMas(r.hayMas);
      })
      .catch(() => vigente.current && setError("No se pudo cargar la actividad."));
    return () => {
      vigente.current = false;
    };
  }, [conversacionId, version]);

  async function verMas() {
    const ultimo = eventos?.[eventos.length - 1];
    if (!ultimo) return;
    setCargando(true);
    const r = await actividadDelEquipo(conversacionId, ultimo.momento).catch(() => ({ error: "No se pudo cargar." }));
    if (!vigente.current) return;
    setCargando(false);
    if ("error" in r) return setError(r.error);
    setError(null);
    setEventos((antes) => {
      const vistos = new Set((antes ?? []).map((e) => e.id));
      return [...(antes ?? []), ...r.eventos.filter((e) => !vistos.has(e.id))];
    });
    setHayMas(r.hayMas);
  }

  const personas = personasDe(eventos ?? []);
  const filtrados = (eventos ?? []).filter((e) => !quien || e.quien === quien);

  return (
    <div className="flex flex-col gap-2.5 border-b-8 border-[var(--wa-panel)] px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-normal text-[var(--wa-sec)]">Actividad</h3>
        {eventos && eventos.length > 0 && (
          <button
            type="button"
            onClick={alternarPlegado}
            aria-expanded={!plegado}
            aria-label={plegado ? "Desplegar la actividad del equipo" : "Plegar la actividad del equipo"}
            title={plegado ? "Desplegar" : "Plegar"}
            className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] ${anilloFoco}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={plegado ? "" : "rotate-180"}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
      {!eventos && !error && <span className="text-[13px] text-[var(--wa-sec)]">Cargando…</span>}
      {eventos && eventos.length === 0 && <span className="text-[13px] text-[var(--wa-sec)]">Nadie del equipo ha hecho cambios con este cliente todavía.</span>}
      {eventos && eventos.length > 0 && plegado && <span className="text-[12.5px] text-[var(--wa-sec)]">Desplegar para ver lo que hizo cada persona</span>}
      {eventos && eventos.length > 0 && !plegado && (
        <>
          {personas.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="sr-only">Ver la actividad de</span>
              <select
                value={quien}
                onChange={(e) => setQuien(e.target.value)}
                className={`h-9 w-full rounded-lg border-0 bg-[var(--wa-panel)] px-2.5 text-[13.5px] text-[var(--wa-texto)] focus-visible:ring-2 focus-visible:ring-[var(--wa-acento)] ${anilloFoco}`}
              >
                <option value="">Todo el equipo ({eventos.length})</option>
                {personas.map((p) => (
                  <option key={p.nombre} value={p.nombre}>
                    {p.nombre} ({p.total})
                  </option>
                ))}
              </select>
            </label>
          )}
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {filtrados.map((e) => (
              <li key={e.id} className="flex gap-2 text-[13px]">
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${PUNTO[e.clase]}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-[var(--wa-sec)]">
                    <span className="font-medium text-[var(--wa-texto)]">{e.quien}</span>
                    <span>{cuando(e.momento)}</span>
                    <span className="sr-only">{NOMBRE_CLASE[e.clase]}</span>
                  </span>
                  <span className="block [overflow-wrap:anywhere]">{e.texto}</span>
                </span>
              </li>
            ))}
          </ol>
          {filtrados.length === 0 && <span className="text-[13px] text-[var(--wa-sec)]">{quien} no ha hecho nada en lo que se ha cargado.</span>}
          {hayMas && (
            <button type="button" onClick={() => void verMas()} disabled={cargando} className={`self-start text-[13px] font-medium text-[var(--wa-acento)] hover:underline disabled:opacity-60 ${anilloFoco}`}>
              {cargando ? "Cargando…" : "Ver más"}
            </button>
          )}
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
