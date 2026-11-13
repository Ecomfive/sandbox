"use client";

import { useEffect, useMemo, useState } from "react";
import { COLORES } from "@/components/panel/colores-tablero";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { fraseDelAnalisis, GRUPOS_PARETO, textoParte, type GrupoPareto, type ResultadoPareto } from "@/lib/crm/pareto";
import { VentasIcon } from "@/lib/nav-icons";
import { esSinPublicacion, guiasDeLosMeses, paretoPublicaciones, publicacionDeCadaId } from "@/lib/publicaciones/pareto-publicaciones";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { Barra, Chip } from "../crm-dropshippers/direccion/piezas-direccion";
import type { FilaPublicacion } from "./def-publicaciones";
import { cargarGuiasDropi, type GuiasDropi } from "./pareto-actions";

/** Los periodos que se pueden mirar: los últimos 30 días (lo que muestra la tarjeta) y 3, 6 o 12 meses. */
type Periodo = "30d" | 3 | 6 | 12;
const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "30d", etiqueta: "30 días" },
  { valor: 3, etiqueta: "3 meses" },
  { valor: 6, etiqueta: "6 meses" },
  { valor: 12, etiqueta: "12 meses" },
];
type Datos = Exclude<GuiasDropi, { error: string }>;
const LEYENDA: Record<GrupoPareto, string> = { top: "El 20 % de las publicaciones", resto: "El 80 % restante" };
const n = (v: number) => v.toLocaleString("es-PA");
const guias = (v: number) => `${n(v)} ${v === 1 ? "guía" : "guías"}`;

/** Las guías de cada ID en el periodo: las de 30 días van contadas por día; las de meses, mes a mes. */
const guiasDelPeriodo = (datos: Datos, periodo: Periodo) => (periodo === "30d" ? datos.dias30 : guiasDeLosMeses(datos.porMes, periodo));

/**
 * La tarjeta «Pareto de publicaciones» del tablero (12 nov 2026, pedido de Hernán): cuántas publicaciones son el 20 % que más guías trae y qué parte de las guías
 * hacen en los últimos 30 días. No filtra la lista: abre la lista de esas publicaciones (y, a pedido, las demás), con el periodo; pulsar una abre su ficha.
 * Las guías (pedidos de Dropi sin cancelados, por ID de producto) se piden al abrir la página.
 */
export function TarjetaParetoPublicaciones({ publicaciones, alAbrir }: { publicaciones: FilaPublicacion[]; alAbrir?: (id: string) => void }) {
  const [datos, setDatos] = useState<GuiasDropi | null>(null);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    let vigente = true;
    cargarGuiasDropi()
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos({ error: "No se pudo cargar el Pareto de publicaciones." }));
    return () => {
      vigente = false;
    };
  }, []);
  const deCadaId = useMemo(() => publicacionDeCadaId(publicaciones), [publicaciones]);
  const ok = datos && !("error" in datos) ? datos : null;
  const r30 = useMemo(() => (ok ? paretoPublicaciones(ok.dias30, deCadaId) : null), [ok, deCadaId]);
  const c = COLORES.violeta;
  const error = datos && "error" in datos ? datos.error : null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierta}
        disabled={!ok}
        onClick={() => setAbierta(true)}
        className={`group flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco}`}
      >
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
            <VentasIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">Pareto de publicaciones</span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{!datos ? "…" : r30 ? n(r30.grupos.top.n) : "—"}</span>
          {r30 && r30.n > 0 && <span className="text-sm text-muted-foreground tabular-nums">/ {n(r30.n)} con guías</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {!datos ? (
            "Contando las guías de 30 días…"
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : !r30 || r30.n === 0 ? (
            "Sin guías en 30 días"
          ) : (
            <>
              El 20 % que más guías trae: hace el <span className="font-semibold text-foreground">{textoParte(r30.grupos.top.parteDelTotal)}</span> de las guías (30 días)
            </>
          )}
          <span className="sr-only">. Abre la lista de esas publicaciones.</span>
        </span>
      </button>
      {ok && (
        <VentanaPareto
          abierta={abierta}
          alCerrar={() => setAbierta(false)}
          datos={ok}
          publicaciones={publicaciones}
          deCadaId={deCadaId}
          alAbrir={
            alAbrir
              ? (id) => {
                  setAbierta(false);
                  alAbrir(id);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/** La lista de las publicaciones por guías, de más a menos: el 20 % que más trae primero y, si se pide, el resto. Con el periodo (30 días o 3, 6 o 12 meses). */
function VentanaPareto({
  abierta,
  alCerrar,
  datos,
  publicaciones,
  deCadaId,
  alAbrir,
}: {
  abierta: boolean;
  alCerrar: () => void;
  datos: Datos;
  publicaciones: FilaPublicacion[];
  deCadaId: ReadonlyMap<string, string>;
  alAbrir?: (id: string) => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [verTodas, setVerTodas] = useState(false);
  const r = useMemo(() => paretoPublicaciones(guiasDelPeriodo(datos, periodo), deCadaId), [datos, periodo, deCadaId]);
  const porId = useMemo(() => new Map(publicaciones.map((p) => [p.id, p])), [publicaciones]);
  const filas = verTodas ? r.filas : r.filas.filter((f) => f.grupo === "top");
  const enPeriodo = `en ${PERIODOS.find((x) => x.valor === periodo)!.etiqueta}`;

  return (
    <Ventana abierto={abierta} alCerrar={alCerrar} titulo={`Pareto de publicaciones · ${datos.nombrePais}`} ancho="lg">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((x) => (
            <Chip key={x.valor} activo={periodo === x.valor} onClick={() => setPeriodo(x.valor)}>
              {x.etiqueta}
            </Chip>
          ))}
        </div>
        {r.n === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Sin guías {enPeriodo}.</p>
        ) : (
          <>
            <p className="m-0 text-base font-semibold">{fraseDelAnalisis(r, "las publicaciones", "las guías")}</p>
            <Resumen r={r} />
            <p className="m-0 text-[13px] text-muted-foreground">
              {r.cumple8020 ? (
                <span className="font-semibold text-success">El 80/20 se cumple. </span>
              ) : (
                <span className="font-semibold text-warning">
                  No llega al 80/20: para el 80 % de las guías hacen falta {n(r.paraLlegarA80.n)} publicaciones ({textoParte(r.paraLlegarA80.parte)}).{" "}
                </span>
              )}
              Guías = pedidos de Dropi sin cancelados de cada ID de la publicación, de todos los dropshippers.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {verTodas ? "Todas las publicaciones con guías" : "El 20 % de las publicaciones que más guías trae"}, de más a menos guías, {enPeriodo}
                </caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Publicación
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Guías
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Parte
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Acumulado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const p = porId.get(f.id);
                    return (
                      <tr key={f.id} className={`border-t border-border ${f.grupo === "resto" ? "text-muted-foreground" : ""}`}>
                        <td className="px-3 py-1.5 text-right tabular-nums">{f.posicion}</td>
                        <td className="px-3 py-1.5">
                          {p ? (
                            <>
                              {alAbrir ? (
                                <button type="button" onClick={() => alAbrir(p.id)} className={`rounded text-left font-medium text-foreground hover:underline ${anilloFoco}`}>
                                  {p.nombre}
                                </button>
                              ) : (
                                <span className="font-medium">{p.nombre}</span>
                              )}
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                {p.numero !== null && `${numeroPublicacion(p.numero)} · `}ID {p.dropiId}
                                {p.archivada && " · archivada"}
                              </span>
                            </>
                          ) : (
                            <span>
                              ID {esSinPublicacion(f.id) ? f.id.slice("dropi:".length) : f.id} <span className="text-xs text-muted-foreground">· sin publicación en el sistema</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{n(f.valor)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{textoParte(f.parte)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{textoParte(f.acumulado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {r.grupos.resto.n > 0 && (
              <button type="button" onClick={() => setVerTodas((v) => !v)} className={`self-start rounded text-sm font-medium text-primario hover:underline ${anilloFoco}`}>
                {verTodas ? `Ver solo el 20 % (${n(r.grupos.top.n)})` : `Ver también el 80 % restante (${n(r.grupos.resto.n)} publicaciones)`}
              </button>
            )}
          </>
        )}
      </div>
    </Ventana>
  );
}

/** Los dos grupos: qué parte de las guías hace cada uno y cuántas publicaciones son. */
function Resumen({ r }: { r: ResultadoPareto }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
      {GRUPOS_PARETO.map((g) => (
        <li key={g} className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5">
          <span className="text-sm font-semibold">{LEYENDA[g]}</span>
          <span className="flex items-baseline gap-2">
            <span className="text-[26px] leading-none font-bold tracking-tight tabular-nums">{textoParte(r.grupos[g].parteDelTotal)}</span>
            <span className="text-sm text-muted-foreground">de las guías</span>
          </span>
          <Barra valor={r.grupos[g].parteDelTotal * 100} tono={g === "top" ? "info" : "neutro"} alto="h-2" />
          <span className="text-xs text-muted-foreground">
            {n(r.grupos[g].n)} {r.grupos[g].n === 1 ? "publicación" : "publicaciones"} · {guias(r.grupos[g].valor)}
          </span>
        </li>
      ))}
    </ul>
  );
}
