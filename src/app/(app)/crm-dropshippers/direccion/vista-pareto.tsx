"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { anilloFoco } from "@/components/ui/field";
import {
  cobertura,
  fraseDelAnalisis,
  GRUPOS_PARETO,
  LIMITE_80,
  mesesPorGrupo,
  paretoDe,
  paretoDeProductos,
  posicionEn,
  textoParte,
  type GrupoPareto,
  type ProductoPareto,
  type ResultadoPareto,
} from "@/lib/crm/pareto";
import { ETIQUETA_SEGMENTO, nPedidos, type Segmento } from "@/lib/crm/salud";
import { productosParaPareto } from "./actions";
import type { DatosPareto } from "./datos-pareto";
import type { DatosDireccion, FilaDireccion } from "./datos-direccion";
import { Barra, Chip, Insignia, Tarjeta, type TonoDireccion } from "./piezas-direccion";
import { rutaVista } from "./ruta";

const COLOR_GRUPO: Record<GrupoPareto, string> = { top: "var(--primario)", resto: "var(--border-control)" };
export const TONO_GRUPO: Record<GrupoPareto, TonoDireccion> = { top: "info", resto: "neutro" };
/** Cómo se llama cada grupo en las insignias. */
export const ROTULO_GRUPO: Record<GrupoPareto, string> = { top: "Top 20 %", resto: "Resto 80 %" };
/** Y en las leyendas, con lo que son: el 20 % de los clientes que más guías hacen y el 80 % restante. */
const LEYENDA_GRUPO: Record<GrupoPareto, string> = { top: "El 20 % de los clientes", resto: "El 80 % de los clientes" };
const TONO_SEGMENTO: Record<Segmento, TonoDireccion> = { activo: "exito", riesgo: "aviso", dormido: "peligro", perdido: "neutro", sin_pedidos: "neutro" };
const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };

const nombreMes = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { month: "short", year: "2-digit", timeZone: "UTC" });
const enRiesgo = (f: FilaDireccion) => f.segmento === "riesgo" || f.segmento === "dormido" || f.segmento === "perdido";
const guias = (n: number) => `${n.toLocaleString("es")} ${n === 1 ? "guía" : "guías"}`;

/** Los datos de la curva ordenada de más a menos, con su acumulado. */
function datosCurva(r: ResultadoPareto, nombreDe: (id: string) => string) {
  return r.filas.map((f) => ({ posicion: f.posicion, nombre: nombreDe(f.id), guias: f.valor, acumulado: Math.round(f.acumulado * 1000) / 10, grupo: f.grupo }));
}

/** El rótulo de un grupo con su color, para las leyendas. */
function RotuloGrupo({ grupo }: { grupo: GrupoPareto }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: COLOR_GRUPO[grupo] }} />
      <span className="font-semibold">{LEYENDA_GRUPO[grupo]}</span>
    </span>
  );
}

/** La curva de Pareto: una barra por dropshipper (de más a menos guías, del color de su grupo), la línea del acumulado, la marca del 80 % y dónde termina el 20 % de los clientes. */
function CurvaPareto({ r, nombreDe, alto = 300 }: { r: ResultadoPareto; nombreDe: (id: string) => string; alto?: number }) {
  const datos = useMemo(() => datosCurva(r, nombreDe), [r, nombreDe]);
  return (
    <div role="img" aria-label={`Curva de Pareto: ${fraseDelAnalisis(r, "los dropshippers", "las guías")}`} style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="posicion" {...ejes} interval="preserveStartEnd" minTickGap={28} />
          <YAxis yAxisId="guias" {...ejes} width={44} />
          <YAxis yAxisId="acum" orientation="right" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v} %`} {...ejes} width={54} />
          <Tooltip
            contentStyle={estiloTooltip}
            cursor={{ fill: "var(--muted)" }}
            labelFormatter={(l, payload) => (payload?.[0]?.payload ? `#${l} · ${(payload[0].payload as { nombre: string }).nombre}` : String(l))}
            formatter={(v, nombre) => (nombre === "acumulado" ? [`${Number(v).toLocaleString("es")} %`, "Acumulado"] : [Number(v).toLocaleString("es"), "Guías"])}
          />
          <ReferenceLine yAxisId="acum" y={LIMITE_80 * 100} stroke="var(--foreground)" strokeDasharray="5 4" strokeOpacity={0.55} label={{ value: "80 %", position: "insideTopRight", fontSize: 11, fill: "var(--foreground)" }} />
          {r.grupos.top.n > 0 && r.grupos.resto.n > 0 && <ReferenceLine yAxisId="guias" x={r.grupos.top.n} stroke="var(--primario)" strokeDasharray="2 3" strokeOpacity={0.8} />}
          <Bar yAxisId="guias" dataKey="guias" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {datos.map((d) => (
              <Cell key={d.posicion} fill={COLOR_GRUPO[d.grupo]} />
            ))}
          </Bar>
          <Line yAxisId="acum" dataKey="acumulado" type="monotone" stroke="var(--foreground)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Los periodos que se pueden mirar en el Resumen; el análisis siempre sale de las guías mes a mes de los últimos 12 meses. */
export const PERIODOS_PARETO = [3, 6, 12];

/**
 * El Pareto de toda la operación, dentro del Resumen (31 oct 2026, pedido de Hernán: integrado, no en una pestaña aparte): la frase, el periodo (3, 6 o 12 meses), cuántos
 * clientes hay en cada grupo —el 20 % que más guías hace y el 80 % restante— y qué parte de las guías hace cada uno, la curva, las guías de cada mes por grupo y los del 20 % que bajaron o pararon.
 */
export function SeccionParetoResumen({ datos, pareto }: { datos: DatosDireccion; pareto: DatosPareto | { error: string } | null }) {
  const [meses, setMeses] = useState(12);
  const sinDatos = !pareto || "error" in pareto;
  const series = useMemo(() => new Map(Object.entries(sinDatos ? {} : pareto.porMes)), [pareto, sinDatos]);
  const r = useMemo(() => paretoDe(series, meses), [series, meses]);
  const porId = useMemo(() => new Map(datos.filas.map((f) => [f.id, f])), [datos.filas]);
  const nombreDe = useMemo(() => (id: string) => porId.get(id)?.nombre ?? "Sin ficha", [porId]);
  const porMes = useMemo(() => (sinDatos ? [] : mesesPorGrupo(series, r, meses, pareto.meses).map((m) => ({ ...m, nombre: nombreMes(m.mes) }))), [series, r, meses, pareto, sinDatos]);
  // Qué meses abarca el periodo elegido y desde cuándo hay guías: si los datos empiezan después del comienzo del periodo, los periodos largos se parecen al corto.
  const mesesDelPeriodo = sinDatos ? [] : pareto.meses.slice(Math.max(0, pareto.meses.length - meses));
  const datosDesde = useMemo(() => (sinDatos ? null : cobertura(series, pareto.meses)), [series, pareto, sinDatos]);
  const faltanDatos = !!datosDesde && datosDesde.meses < meses;
  const aEnRiesgo = r.filas.filter((f) => f.grupo === "top" && porId.get(f.id) && enRiesgo(porId.get(f.id)!));
  const parteEnRiesgo = aEnRiesgo.reduce((s, f) => s + f.parte, 0);

  if (pareto && "error" in pareto)
    return (
      <Tarjeta id="t-pareto" titulo="Pareto de guías">
        <p role="alert" className="m-0 text-sm text-warning">
          {pareto.error}
        </p>
      </Tarjeta>
    );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Tarjeta
        id="t-pareto"
        titulo="Pareto de guías"
        className="lg:col-span-2"
        extra={
          <span className="flex gap-1.5">
            {PERIODOS_PARETO.map((m) => (
              <Chip key={m} activo={meses === m} onClick={() => setMeses(m)}>
                {m} meses
              </Chip>
            ))}
          </span>
        }
      >
        {r.n === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Sin guías en {meses} meses.</p>
        ) : (
          <>
            <p className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Últimos {meses} meses · {nombreMes(mesesDelPeriodo[0])} a {nombreMes(mesesDelPeriodo[mesesDelPeriodo.length - 1])}
            </p>
            {faltanDatos && (
              <p role="status" className="m-0 flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" />
                <span>
                  Solo hay guías desde {nombreMes(datosDesde.desde)} ({datosDesde.meses} {datosDesde.meses === 1 ? "mes" : "meses"}): antes de eso no hay datos, así que los periodos de más de {datosDesde.meses}{" "}
                  {datosDesde.meses === 1 ? "mes" : "meses"} dan las mismas cifras.
                </span>
              </p>
            )}
            <p className="m-0 text-base font-semibold">{fraseDelAnalisis(r, "los dropshippers", "las guías")}</p>
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
              {GRUPOS_PARETO.map((g) => (
                <li key={g} className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5">
                  <RotuloGrupo grupo={g} />
                  <span className="flex items-baseline gap-2">
                    <span className="text-[28px] leading-none font-bold tracking-tight tabular-nums">{textoParte(r.grupos[g].parteDelTotal)}</span>
                    <span className="text-sm text-muted-foreground">de las guías</span>
                  </span>
                  <Barra valor={r.grupos[g].parteDelTotal * 100} tono={TONO_GRUPO[g]} alto="h-2" />
                  <span className="text-xs text-muted-foreground">
                    {r.grupos[g].n} {r.grupos[g].n === 1 ? "cliente" : "clientes"} · {guias(r.grupos[g].valor)}
                  </span>
                </li>
              ))}
            </ul>
            <CurvaPareto r={r} nombreDe={nombreDe} alto={260} />
            <p className="m-0 text-[13px] text-muted-foreground">
              {r.cumple8020 ? (
                <span className="font-semibold text-success">El 80/20 se cumple. </span>
              ) : (
                <span className="font-semibold text-warning">No llega al 80/20: para el 80 % de las guías hacen falta {r.paraLlegarA80.n} clientes ({textoParte(r.paraLlegarA80.parte)}). </span>
              )}
              {guias(r.total)} de {r.n} dropshippers con guías.
            </p>
          </>
        )}
      </Tarjeta>

      <Tarjeta id="t-pareto-meses" titulo="Guías por mes, por grupo" extra={`${meses} meses`}>
        {r.n === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Sin guías en {meses} meses.</p>
        ) : (
          <>
            <div role="img" aria-label={`Guías por mes por grupo: ${porMes.map((m) => `${m.nombre} el 20 % ${m.top}, el 80 % ${m.resto}`).join("; ")}`} className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porMes} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="nombre" {...ejes} interval={meses > 6 ? 1 : 0} />
                  <YAxis {...ejes} width={44} />
                  <Tooltip contentStyle={estiloTooltip} cursor={{ fill: "var(--muted)" }} formatter={(v, n) => [Number(v).toLocaleString("es"), LEYENDA_GRUPO[n as GrupoPareto] ?? String(n)]} />
                  <Legend formatter={(v) => LEYENDA_GRUPO[v as GrupoPareto] ?? String(v)} wrapperStyle={{ fontSize: 12 }} />
                  {GRUPOS_PARETO.map((g) => (
                    <Bar key={g} dataKey={g} stackId="guias" fill={COLOR_GRUPO[g]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <h3 className="m-0 flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span>Del 20 % en riesgo</span>
                <span className={aEnRiesgo.length ? "text-destructive" : "text-success"}>{aEnRiesgo.length ? `${aEnRiesgo.length} · ${textoParte(parteEnRiesgo)} de las guías` : "Ninguno"}</span>
              </h3>
              {aEnRiesgo.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">Ninguno de los que más pesan bajó o paró.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {aEnRiesgo.slice(0, 5).map((fila) => {
                    const f = porId.get(fila.id)!;
                    return (
                      <li key={fila.id}>
                        <Link href={rutaVista("clientes", { cliente: f.id })} className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted ${anilloFoco}`}>
                          <span className="min-w-0 truncate font-semibold">{f.nombre}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground tabular-nums">{textoParte(fila.parte)}</span>
                            <Insignia tono={TONO_SEGMENTO[f.segmento]}>{ETIQUETA_SEGMENTO[f.segmento]}</Insignia>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  );
}

/**
 * El Pareto de un dropshipper en su ficha (12 meses): su grupo (el 20 % que más guías hace o el 80 % restante) y su lugar entre todos, sus guías mes a mes y su propio 80/20 de productos (qué pocos productos
 * hacen la mayoría de sus guías). Los productos se piden al abrir la ficha.
 */
export function BloquePareto({ f, pareto }: { f: FilaDireccion; pareto: DatosPareto }) {
  const series = useMemo(() => new Map(Object.entries(pareto.porMes)), [pareto]);
  const r = useMemo(() => paretoDe(series, 12), [series]);
  const yo = posicionEn(r, f.id);
  const serie = pareto.porMes[f.id] ?? [];
  const total = serie.reduce((s, x) => s + x, 0);
  const max = Math.max(1, ...serie);
  const [res, setRes] = useState<{ id: string; productos: ProductoPareto[] | null; error: string | null } | null>(null);
  useEffect(() => {
    if (total === 0) return;
    let vivo = true;
    productosParaPareto(f.id)
      .then((x) => {
        if (vivo) setRes("error" in x ? { id: f.id, productos: null, error: x.error } : { id: f.id, productos: x.productos, error: null });
      })
      .catch(() => {
        if (vivo) setRes({ id: f.id, productos: null, error: "No se pudieron cargar sus productos." });
      });
    return () => {
      vivo = false;
    };
  }, [f.id, total]);
  const cargando = total > 0 && res?.id !== f.id;
  const productos = res?.id === f.id ? res.productos : null;
  const rp = useMemo(() => (productos ? paretoDeProductos(productos) : null), [productos]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">Pareto de guías</h3>
        <span className="text-xs text-muted-foreground">Últimos 12 meses</span>
      </div>
      {!yo ? (
        <p className="m-0 text-sm text-muted-foreground">Sin guías en los últimos 12 meses.</p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <Insignia tono={TONO_GRUPO[yo.grupo]}>{ROTULO_GRUPO[yo.grupo]}</Insignia>
            <p className="m-0 min-w-0 text-sm leading-relaxed">
              <span className="font-semibold">
                #{yo.posicion} de {r.n}
              </span>{" "}
              con {guias(yo.valor)} ({textoParte(yo.parte)} del total). Con él y los de arriba se llega al {textoParte(yo.acumulado)}.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div role="img" aria-label={`Guías por mes: ${pareto.meses.map((m, i) => `${nombreMes(m)} ${serie[i] ?? 0}`).join(", ")}`} className="flex h-16 items-end gap-1">
              {pareto.meses.map((m, i) => {
                const v = serie[i] ?? 0;
                return (
                  <span key={m} title={`${nombreMes(m)}: ${guias(v)}`} className="flex h-full flex-1 items-end">
                    <span className="block w-full rounded-t-[3px] bg-primario" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, opacity: i === pareto.meses.length - 1 ? 0.4 : 1 }} />
                  </span>
                );
              })}
            </div>
            <div aria-hidden="true" className="flex gap-1">
              {pareto.meses.map((m) => (
                <span key={m} className="flex-1 text-center text-[10px] text-muted-foreground">
                  {nombreMes(m).slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {nombreMes(pareto.meses[0])} a {nombreMes(pareto.meses[pareto.meses.length - 1])} (en curso): {guias(total)}.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="m-0 text-[13px] font-semibold">Su 80/20 en productos</h4>
            {cargando ? (
              <p className="m-0 text-sm text-muted-foreground">Cargando sus productos…</p>
            ) : res?.error ? (
              <p className="m-0 text-sm text-warning">{res.error}</p>
            ) : !rp || rp.n === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Sin productos identificados en sus pedidos.</p>
            ) : (
              <>
                <p className="m-0 text-sm">
                  {rp.n === 1
                    ? "Vende un solo producto."
                    : `El 20 % de sus productos (${rp.grupos.top.n} de ${rp.n}) hace el ${textoParte(rp.grupos.top.parteDelTotal)} de sus pedidos; el 80 % restante (${rp.grupos.resto.n}) hace el ${textoParte(rp.grupos.resto.parteDelTotal)}.`}
                  {rp.n > 1 && rp.filas[0].parte >= 0.5 && <span className="font-semibold text-warning"> Depende de {rp.nombres.get(rp.filas[0].id)}.</span>}
                </p>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {rp.filas
                    .filter((p) => p.grupo === "top")
                    .slice(0, 6)
                    .map((p) => (
                      <li key={p.id} className="flex flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-semibold">{rp.nombres.get(p.id)}</span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {nPedidos(p.valor)} · {textoParte(p.parte)}
                          </span>
                        </span>
                        <Barra valor={p.parte * 100} tono="info" />
                      </li>
                    ))}
                </ul>
                {rp.grupos.resto.n > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Y {rp.grupos.resto.n} {rp.grupos.resto.n === 1 ? "producto más hace" : "productos más hacen"} el {textoParte(rp.grupos.resto.parteDelTotal)} restante.
                  </span>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
