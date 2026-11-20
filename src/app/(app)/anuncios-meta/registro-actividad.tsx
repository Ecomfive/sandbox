"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { CATEGORIAS_EVENTO, categoriaDeEvento, nombreEvento, NOMBRE_CATEGORIA, type CategoriaEvento, type EventoDeActividad } from "@/lib/meta-ads/actividad-equipo";
import { Iniciales } from "./graficas";

const POR_TANDA = 40;

const dia = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });
const restar = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

function titulo(d: string, hoy: string): string {
  if (d === hoy) return "Hoy";
  if (d === restar(hoy, 1)) return "Ayer";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * El registro de actividad del equipo, como el de un CRM: lo que cada persona hizo en Meta, del más nuevo al más viejo y agrupado por día, de todas las cuentas juntas. Se filtra por persona y por tipo de cambio;
 * cada cuenta se ve en su etiqueta. Cuando el evento es de una campaña que se conoce, lleva a su ficha.
 */
export function RegistroActividad({ eventos, personas, hoy, variasCuentas }: { eventos: EventoDeActividad[]; personas: string[]; hoy: string; variasCuentas: boolean }) {
  const [persona, setPersona] = useState("");
  const [categoria, setCategoria] = useState<CategoriaEvento | "">("");
  const [visibles, setVisibles] = useState(POR_TANDA);
  const filtrados = useMemo(() => eventos.filter((e) => (!persona || e.actor === persona) && (!categoria || categoriaDeEvento(e.tipo) === categoria)), [eventos, persona, categoria]);
  const lista = filtrados.slice(0, visibles);
  const dias = useMemo(() => {
    const m = new Map<string, EventoDeActividad[]>();
    for (const e of lista) {
      const d = dia(e.fecha);
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    return [...m];
  }, [lista]);
  const indiceDe = (nombre: string | null) => Math.max(0, personas.indexOf(nombre ?? ""));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Persona</span>
          <select
            className={fieldClassSm}
            value={persona}
            onChange={(e) => {
              setPersona(e.target.value);
              setVisibles(POR_TANDA);
            }}
          >
            <option value="">Todo el equipo</option>
            {personas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Tipo de cambio" className="flex flex-wrap gap-1.5">
          <BotonFiltro activo={categoria === ""} texto="Todo" alPulsar={() => setCategoria("")} />
          {CATEGORIAS_EVENTO.map((c) => (
            <BotonFiltro
              key={c}
              activo={categoria === c}
              texto={NOMBRE_CATEGORIA[c]}
              alPulsar={() => {
                setCategoria(categoria === c ? "" : c);
                setVisibles(POR_TANDA);
              }}
            />
          ))}
        </div>
        <p className="m-0 ml-auto pb-1.5 text-xs text-muted-foreground tabular-nums">{filtrados.length} {filtrados.length === 1 ? "registro" : "registros"}</p>
      </div>

      {dias.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">No hay actividad con esos filtros.</p>
      ) : (
        <ol role="list" className="m-0 flex list-none flex-col gap-5 p-0">
          {dias.map(([d, lineas]) => (
            <li key={d} className="flex flex-col gap-1">
              <h3 className="m-0 flex items-center gap-2 text-xs font-semibold capitalize text-muted-foreground">
                {titulo(d, hoy)}
                <span className="font-normal tabular-nums">· {lineas.length}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </h3>
              <ol role="list" className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {lineas.map((e, i) => {
                  const cat = categoriaDeEvento(e.tipo);
                  return (
                    <li key={`${e.fecha}-${e.tipo}-${i}`} className="flex items-start gap-3 py-2.5">
                      <Iniciales nombre={e.actor ?? "?"} indice={indiceDe(e.actor)} tamano={30} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="m-0 text-sm">
                          <span className="font-semibold">{e.actor ?? "Alguien"}</span> <span>{nombreEvento(e.tipo).toLowerCase()}</span>
                          {e.objeto && (
                            <>
                              {" · "}
                              {e.campanaId ? (
                                <Link href={`/anuncios-meta/campanas?abrir=${e.campanaId}`} className="font-medium underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                                  {e.objeto}
                                </Link>
                              ) : (
                                <span className="break-words text-muted-foreground">{e.objeto}</span>
                              )}
                            </>
                          )}
                        </p>
                        {e.detalle && <p className="m-0 text-xs text-muted-foreground">{e.detalle}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">{hora(e.fecha)}</span>
                        <span className="flex flex-wrap items-center justify-end gap-1">
                          {cat === "campañas" && <span className="rounded-full bg-primario-suave px-2 py-0.5 font-medium text-primario">Campaña</span>}
                          {variasCuentas && e.cuenta && <span className="max-w-[9rem] truncate rounded-full border border-border px-2 py-0.5">{e.cuenta}</span>}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {filtrados.length > visibles && (
        <button type="button" onClick={() => setVisibles((v) => v + POR_TANDA)} className="min-h-9 w-fit rounded-md border border-border-control bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
          Ver más ({filtrados.length - visibles} {filtrados.length - visibles === 1 ? "registro" : "registros"})
        </button>
      )}
    </div>
  );
}

function BotonFiltro({ activo, texto, alPulsar }: { activo: boolean; texto: string; alPulsar: () => void }) {
  return (
    <button type="button" aria-pressed={activo} onClick={alPulsar} className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card text-muted-foreground hover:bg-muted"}`}>
      {texto}
    </button>
  );
}
