"use client";

import { useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { analizarChatsRecientes, motivosRecurrentes, type MotivosRecurrentes } from "../bandeja/actividad-actions";

const PERIODOS = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
];

const fecha = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short" });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Motivos de contacto (29 oct 2026): qué consultan más los dropshippers, sacado del análisis con IA de sus chats (ver «Actividad del cliente» en la ficha de cada chat). Cada motivo
 * muestra en cuántos días apareció, cuántos clientes distintos lo tuvieron y lo más reciente que se resumió. «Analizar chats recientes» pone al día los chats con mensajes nuevos.
 */
export function Motivos({ inicial, puedeAnalizar }: { inicial: MotivosRecurrentes; puedeAnalizar: boolean }) {
  const [datos, setDatos] = useState(inicial);
  const [periodo, setPeriodo] = useState(30);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [avance, setAvance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar(dias: number) {
    setCargando(true);
    const r = await motivosRecurrentes(dias).catch(() => ({ error: "No se pudo cargar." }));
    setCargando(false);
    if ("error" in r) return setError(r.error);
    setError(null);
    setDatos(r);
  }

  async function elegirPeriodo(dias: number) {
    setPeriodo(dias);
    await cargar(dias);
  }

  async function analizar() {
    setError(null);
    let chats = 0;
    let dias = 0;
    setAvance("Analizando…");
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const r = await analizarChatsRecientes(5).catch(() => ({ error: "No se pudo analizar. Inténtalo de nuevo." }));
      if ("error" in r) {
        setError(r.error);
        break;
      }
      chats += r.chats;
      dias += r.dias;
      setAvance(`Analizando… ${plural(chats, "chat", "chats")} listos`);
      if (!r.quedan || r.chats === 0) break;
    }
    setAvance(chats ? `Listo: ${plural(dias, "día", "días")} de ${plural(chats, "chat", "chats")} analizados.` : "No hay chats con mensajes nuevos por analizar.");
    await cargar(periodo);
  }

  const maximo = Math.max(1, ...datos.motivos.map((m) => m.dias));
  const maximoProducto = Math.max(1, ...datos.productos.map((p) => p.clientes));
  const analizando = avance !== null && avance.startsWith("Analizando");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Periodo" className="flex rounded-lg border border-border-control bg-card p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              aria-pressed={periodo === p.dias}
              disabled={cargando || analizando}
              onClick={() => void elegirPeriodo(p.dias)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium disabled:opacity-60 ${periodo === p.dias ? "bg-foreground text-background" : "hover:bg-muted"} ${anilloFoco}`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        <p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground tabular-nums">
          {plural(datos.chats, "chat analizado", "chats analizados")} · {plural(datos.dias, "día", "días")}
          {datos.sinResolver > 0 && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-foreground">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
              {plural(datos.sinResolver, "chat con la última consulta sin resolver", "chats con la última consulta sin resolver")}
            </span>
          )}
        </p>
        {puedeAnalizar && datos.iaConectada && !datos.falta && (
          <button type="button" onClick={() => void analizar()} disabled={analizando} className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60 ${anilloFoco}`}>
            {analizando ? "Analizando…" : "Analizar chats recientes"}
          </button>
        )}
      </div>

      {avance && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          {avance}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-lg border border-destructive bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {datos.falta && (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Falta correr la migración 0183 (productos y versión de la actividad del cliente) en la base.
        </p>
      )}
      {!datos.iaConectada && !datos.falta && (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel) para analizar los chats.
        </p>
      )}

      {!datos.falta && datos.motivos.length === 0 && (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no hay chats analizados en estos {periodo} días. Pulsa «Analizar chats recientes» o analiza uno desde su ficha en la bandeja.
        </p>
      )}

      {datos.motivos.length > 0 && <h2 className="m-0 text-base font-semibold">Por qué escriben</h2>}
      {datos.motivos.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
          {datos.motivos.map((m) => {
            const abierto_ = abierto === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-expanded={abierto_}
                  onClick={() => setAbierto(abierto_ ? null : m.id)}
                  className={`flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted ${anilloFoco}`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium">{m.etiqueta}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {plural(m.dias, "día", "días")} · {plural(m.clientes, "cliente", "clientes")}
                    </span>
                  </span>
                  <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-foreground" style={{ width: `${Math.max(4, Math.round((m.dias / maximo) * 100))}%` }} />
                  </span>
                </button>
                {abierto_ && (
                  <ul className="m-0 flex list-none flex-col gap-1.5 bg-muted/40 px-4 py-3 text-sm">
                    {m.ejemplos.map((e, i) => (
                      <li key={`${e.dia}-${i}`} className="flex gap-2">
                        <span className="w-14 flex-none text-muted-foreground tabular-nums">{fecha(e.dia)}</span>
                        <span>{e.resumen}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {datos.productos.length > 0 && (
        <>
          <h2 className="m-0 mt-2 text-base font-semibold">Productos que más interesan</h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
            {datos.productos.map((p) => (
              <li key={p.nombre} className="flex flex-col gap-2 px-4 py-3">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm font-medium">{p.nombre}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {plural(p.clientes, "cliente", "clientes")} · {plural(p.dias, "día", "días")}
                  </span>
                </span>
                <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primario" style={{ width: `${Math.max(4, Math.round((p.clientes / maximoProducto) * 100))}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
