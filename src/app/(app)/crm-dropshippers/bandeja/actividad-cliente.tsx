"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { etiquetaDeMotivo, ETIQUETA_ESTADO, ETIQUETA_SENTIMIENTO, type EstadoDia, type Riesgo, type Sentimiento, type Urgencia } from "@/lib/whatsapp/actividad";
import { actividadDelCliente, analizarActividadDelCliente, type ActividadCliente, type PerfilGuardado } from "./actividad-actions";
import { usePlegado } from "./usar-plegado";

const DIAS_VISIBLES = 5;

const PUNTO_ESTADO: Record<EstadoDia, string> = { resuelta: "bg-success", pendiente: "bg-warning", sin_consulta: "bg-[var(--wa-sec)]" };
const PUNTO_SENTIMIENTO: Record<Sentimiento, string> = { positivo: "bg-success", neutral: "bg-[var(--wa-sec)]", molesto: "bg-destructive" };
const PUNTO_URGENCIA: Record<Urgencia, string> = { alta: "bg-destructive", media: "bg-warning", baja: "bg-success" };
const PUNTO_RIESGO: Record<Riesgo, string> = { alto: "bg-destructive", medio: "bg-warning", bajo: "bg-success" };

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
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

function Indicador({ nombre, valor, punto }: { nombre: string; valor: string; punto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--wa-panel)] px-2.5 py-0.5 text-[12.5px]">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${punto}`} />
      <span className="text-[var(--wa-sec)]">{nombre}</span> {valor}
    </span>
  );
}

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12.5px] text-[var(--wa-sec)]">{titulo}</span>
      <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-[13px]">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

/** La lectura completa del cliente que arma la IA: tono, urgencia, riesgo, lo que el equipo prometió y sigue pendiente, oportunidades y qué hacer ahora. */
function AnalisisCompleto({ p }: { p: PerfilGuardado }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--wa-borde)] px-2.5 py-2.5">
      <span className="text-[12.5px] text-[var(--wa-sec)]">Análisis completo</span>
      <div className="flex flex-wrap gap-1.5">
        <Indicador nombre="Tono" valor={ETIQUETA_SENTIMIENTO[p.sentimiento]} punto={PUNTO_SENTIMIENTO[p.sentimiento]} />
        <Indicador nombre="Urgencia" valor={p.urgencia} punto={PUNTO_URGENCIA[p.urgencia]} />
        <Indicador nombre="Riesgo de perderlo" valor={p.riesgo} punto={PUNTO_RIESGO[p.riesgo]} />
      </div>
      <p className="m-0 text-[13px]">{p.perfil}</p>
      {p.proximaAccion && (
        <p className="m-0 text-[13px]">
          <span className="font-semibold">Qué hacer ahora: </span>
          {p.proximaAccion}
        </p>
      )}
      <Lista titulo="El equipo prometió y sigue pendiente" items={p.compromisos} />
      <Lista titulo="Oportunidades" items={p.oportunidades} />
      <span className="text-[11.5px] text-[var(--wa-sec)]">
        Hecho {haceCuanto(p.analizadoEn)}
        {p.analizadoPor ? ` por ${p.analizadoPor}` : ""} · con {dias(p.dias)} analizados
      </span>
    </div>
  );
}

/**
 * «Actividad del cliente» en la ficha del chat (pedido de Jhokser, 29 oct 2026): por qué escribió el dropshipper cada día y por qué productos preguntó, entendido por la IA a partir de
 * sus mensajes, si tiene una consulta sin responder y lo que más repite. «Analizar» revisa **toda la conversación** que esté sin analizar (también sin intervenir el chat) y arma un
 * **análisis completo** del cliente; el botón se queda siempre, y «Volver a analizar» rehace ese análisis con lo que haya cambiado (mensajes nuevos). Con la flecha de arriba el bloque se
 * pliega o se despliega; plegado deja a la vista solo si tiene algo pendiente.
 */
export function ActividadDelClienteFicha({ conversacionId, puedeAnalizar }: { conversacionId: string; puedeAnalizar: boolean }) {
  const [datos, setDatos] = useState<ActividadCliente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [verTodo, setVerTodo] = useState(false);
  const [plegado, alternarPlegado] = usePlegado(`cliente:${conversacionId}`);
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

  /** Analiza toda la conversación y rehace el análisis completo: si es larga, el servidor devuelve lo que falta y se vuelve a pedir hasta terminar. */
  async function analizar() {
    setAnalizando(true);
    setError(null);
    setAviso(null);
    for (let vuelta = 0; vuelta < 12; vuelta++) {
      const r = await analizarActividadDelCliente(conversacionId).catch(() => ({ error: "No se pudo analizar. Inténtalo de nuevo." }));
      if (!vigente.current) return;
      if ("error" in r) {
        setError(r.error);
        break;
      }
      setDatos(r);
      if (r.aviso) setAviso(r.aviso);
      if (!r.faltan || !r.analizados) break;
    }
    setAnalizando(false);
  }

  const lista = datos?.dias ?? [];
  const mostrados = verTodo ? lista : lista.slice(0, DIAS_VISIBLES);
  const pendiente = datos && !datos.falta ? datos.situacion : null;
  const hayAnalisis = !!datos && (datos.perfil !== null || lista.length > 0);
  const textoBoton = analizando ? "Analizando…" : datos && datos.porAnalizar > 0 ? "Analizar toda la conversación con IA" : hayAnalisis ? "Volver a analizar con IA" : "Analizar con IA";

  return (
    <div className="flex flex-col gap-2.5 border-b-8 border-[var(--wa-panel)] px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-normal text-[var(--wa-sec)]">Actividad del cliente</h3>
        {datos && !datos.falta && (
          <button
            type="button"
            onClick={alternarPlegado}
            aria-expanded={!plegado}
            aria-label={plegado ? "Desplegar la actividad del cliente" : "Plegar la actividad del cliente"}
            title={plegado ? "Desplegar" : "Plegar"}
            className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] ${anilloFoco}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={plegado ? "" : "rotate-180"}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
      {!datos && !error && <span className="text-[13px] text-[var(--wa-sec)]">Cargando…</span>}
      {datos?.falta && <span className="text-[13px] text-[var(--wa-sec)]">Falta correr la migración 0183 (actividad del cliente).</span>}
      {datos && !datos.falta && (
        <>
          {pendiente && (
            <p className="m-0 flex items-start gap-2 text-[14px]">
              <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${pendiente.tipo === "espera" ? "bg-destructive" : pendiente.tipo === "sin_resolver" ? "bg-warning" : "bg-success"}`} />
              <span>
                {pendiente.tipo === "espera" && `Espera respuesta ${haceCuanto(pendiente.desde)}`}
                {pendiente.tipo === "sin_resolver" && `Quedó una consulta sin resolver (${fechaDelDia(pendiente.dia)}): ${pendiente.resumen}`}
                {pendiente.tipo === "al_dia" && "Al día: no tiene nada pendiente"}
              </span>
            </p>
          )}

          {!plegado && (
            <>
              {datos.perfil && <AnalisisCompleto p={datos.perfil} />}

              {datos.frecuentes.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[12.5px] text-[var(--wa-sec)]">Lo que más consulta</span>
                  <div className="flex flex-wrap gap-1.5">
                    {datos.frecuentes.slice(0, 4).map((f) => (
                      <span key={f.id} className="rounded-full bg-[var(--wa-panel)] px-2.5 py-0.5 text-[12.5px]">
                        {f.etiqueta} <span className="tabular-nums text-[var(--wa-sec)]">· {dias(f.dias)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {datos.productos.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[12.5px] text-[var(--wa-sec)]">Productos que le interesan</span>
                  <div className="flex flex-wrap gap-1.5">
                    {datos.productos.map((p) => (
                      <span key={p.nombre} className="rounded-full bg-azul-soft px-2.5 py-0.5 text-[12.5px] text-azul">
                        {p.nombre} <span className="tabular-nums opacity-80">· {dias(p.dias)}</span>
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
                      {d.estado !== "sin_consulta" && d.motivos.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.motivos.map((m) => (
                            <span key={m} className="rounded-md bg-[var(--wa-panel)] px-1.5 py-px text-[11.5px] text-[var(--wa-sec)]">
                              {etiquetaDeMotivo(m)}
                            </span>
                          ))}
                        </div>
                      )}
                      {d.productos.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.productos.map((p) => (
                            <span key={p} className="rounded-md bg-azul-soft px-1.5 py-px text-[11.5px] text-azul">
                              Interés: {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {lista.length > DIAS_VISIBLES && (
                <button type="button" onClick={() => setVerTodo((v) => !v)} className={`self-start text-[13px] font-medium text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
                  {verTodo ? "Ver menos" : `Ver los ${lista.length} días`}
                </button>
              )}
              {lista.length === 0 && datos.porAnalizar === 0 && <span className="text-[13px] text-[var(--wa-sec)]">Todavía no hay mensajes para analizar.</span>}

              <div className="flex flex-col gap-1.5">
                {datos.porAnalizar > 0 && (
                  <span className="text-[12.5px] text-[var(--wa-sec)]">
                    {datos.porAnalizar === 1 ? "Hay 1 día con mensajes nuevos o sin analizar." : `Hay ${datos.porAnalizar} días con mensajes nuevos o sin analizar.`}
                  </span>
                )}
                {!datos.iaConectada ? (
                  <span className="text-[13px] text-[var(--wa-sec)]">Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel).</span>
                ) : puedeAnalizar ? (
                  <button
                    type="button"
                    onClick={() => void analizar()}
                    disabled={analizando}
                    title={hayAnalisis ? "Lee los mensajes nuevos y rehace el análisis completo del cliente" : "Lee toda la conversación y hace el análisis completo del cliente"}
                    className={`inline-flex min-h-9 items-center justify-center rounded-lg bg-[var(--wa-acento)] px-3 text-[13px] font-semibold text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-60 ${anilloFoco}`}
                  >
                    {textoBoton}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
      {aviso && (
        <p role="alert" className="m-0 text-[13px] text-warning">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
