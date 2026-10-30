"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { anilloFoco } from "@/components/ui/field";
import {
  CLASES_PARETO,
  fraseDelAnalisis,
  LIMITE_A,
  mesesPorClase,
  paretoDe,
  paretoDeProductos,
  PARTE_TOP,
  posicionEn,
  textoParte,
  type ClasePareto,
  type ProductoPareto,
  type ResultadoPareto,
} from "@/lib/crm/pareto";
import { ETIQUETA_SEGMENTO, nPedidos, type Segmento } from "@/lib/crm/salud";
import { productosParaPareto } from "./actions";
import type { DatosPareto } from "./datos-pareto";
import type { DatosDireccion, FilaDireccion } from "./datos-direccion";
import { Barra, Chip, Insignia, Tarjeta, type TonoDireccion } from "./piezas-direccion";
import { rutaVista } from "./ruta";

const COLOR_CLASE: Record<ClasePareto, string> = { A: "var(--primario)", B: "var(--warning)", C: "var(--border-control)" };
export const TONO_CLASE: Record<ClasePareto, TonoDireccion> = { A: "info", B: "aviso", C: "neutro" };
const LIMITE_CLASE: Record<ClasePareto, string> = { A: "hasta el 80 % de las guías", B: "del 80 al 95 %", C: "el último 5 %" };
const TONO_SEGMENTO: Record<Segmento, TonoDireccion> = { activo: "exito", riesgo: "aviso", dormido: "peligro", perdido: "neutro", sin_pedidos: "neutro" };
const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };

const nombreMes = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { month: "short", year: "2-digit", timeZone: "UTC" });
const enRiesgo = (f: FilaDireccion) => f.segmento === "riesgo" || f.segmento === "dormido" || f.segmento === "perdido";
const guias = (n: number) => `${n.toLocaleString("es")} ${n === 1 ? "guía" : "guías"}`;

/** Cuatro gráficas comparten esta cabecera de datos: la curva ordenada de más a menos, con su acumulado. */
function datosCurva(r: ResultadoPareto, nombreDe: (id: string) => string) {
  return r.filas.map((f) => ({ posicion: f.posicion, nombre: nombreDe(f.id), guias: f.valor, acumulado: Math.round(f.acumulado * 1000) / 10, clase: f.clase }));
}

/** El rótulo de una clase con su límite, para las leyendas. */
function RotuloClase({ clase, n }: { clase: ClasePareto; n?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: COLOR_CLASE[clase] }} />
      <span className="font-semibold whitespace-nowrap">Clase {clase}</span>
      <span className="text-muted-foreground">
        {LIMITE_CLASE[clase]}
        {n !== undefined ? ` · ${n}` : ""}
      </span>
    </span>
  );
}

/** La curva de Pareto: una barra por dropshipper (de más a menos guías, del color de su clase) y la línea del acumulado con la marca del 80 %. */
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
          <ReferenceLine yAxisId="acum" y={LIMITE_A * 100} stroke="var(--foreground)" strokeDasharray="5 4" strokeOpacity={0.55} label={{ value: "80 %", position: "insideTopRight", fontSize: 11, fill: "var(--foreground)" }} />
          {r.paraLlegarA80.n > 0 && r.n > 1 && <ReferenceLine yAxisId="guias" x={r.paraLlegarA80.n} stroke="var(--primario)" strokeDasharray="2 3" strokeOpacity={0.7} />}
          <Bar yAxisId="guias" dataKey="guias" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {datos.map((d) => (
              <Cell key={d.posicion} fill={COLOR_CLASE[d.clase]} />
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
 * clientes hay en cada clase y qué parte de las guías hacen, la curva, las guías de cada mes por clase y los clientes clase A que bajaron o pararon.
 */
export function SeccionParetoResumen({ datos, pareto }: { datos: DatosDireccion; pareto: DatosPareto | { error: string } | null }) {
  const [meses, setMeses] = useState(12);
  const sinDatos = !pareto || "error" in pareto;
  const series = useMemo(() => new Map(Object.entries(sinDatos ? {} : pareto.porMes)), [pareto, sinDatos]);
  const r = useMemo(() => paretoDe(series, meses), [series, meses]);
  const porId = useMemo(() => new Map(datos.filas.map((f) => [f.id, f])), [datos.filas]);
  const nombreDe = useMemo(() => (id: string) => porId.get(id)?.nombre ?? "Sin ficha", [porId]);
  const porMes = useMemo(() => (sinDatos ? [] : mesesPorClase(series, r, meses, pareto.meses).map((m) => ({ ...m, nombre: nombreMes(m.mes) }))), [series, r, meses, pareto, sinDatos]);
  const aEnRiesgo = r.filas.filter((f) => f.clase === "A" && porId.get(f.id) && enRiesgo(porId.get(f.id)!));
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
            <p className="m-0 text-base font-semibold">{fraseDelAnalisis(r, "los dropshippers", "las guías")}</p>
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
              {CLASES_PARETO.map((c) => (
                <li key={c} className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <RotuloClase clase={c} />
                    <span className="text-xl font-bold tabular-nums">{r.clases[c].n}</span>
                  </span>
                  <Barra valor={r.clases[c].parteDelTotal * 100} tono={TONO_CLASE[c]} alto="h-2" />
                  <span className="text-xs text-muted-foreground">
                    {textoParte(r.clases[c].parteDeLosItems)} de los clientes · {textoParte(r.clases[c].parteDelTotal)} de las guías
                  </span>
                </li>
              ))}
            </ul>
            <CurvaPareto r={r} nombreDe={nombreDe} alto={260} />
            <p className="m-0 text-[13px] text-muted-foreground">
              El {textoParte(PARTE_TOP)} de los clientes ({r.top.n}) hace el <span className={`font-semibold ${r.cumple8020 ? "text-success" : "text-warning"}`}>{textoParte(r.top.parteDelTotal)}</span> de las guías
              {r.cumple8020 ? ": el 80/20 se cumple." : ": no llega al 80 %."} {guias(r.total)} de {r.n} dropshippers.
            </p>
          </>
        )}
      </Tarjeta>

      <Tarjeta id="t-pareto-meses" titulo="Guías por mes, por clase" extra={`${meses} meses`}>
        {r.n === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Sin guías en {meses} meses.</p>
        ) : (
          <>
            <div role="img" aria-label={`Guías por mes por clase: ${porMes.map((m) => `${m.nombre} A ${m.A}, B ${m.B}, C ${m.C}`).join("; ")}`} className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porMes} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="nombre" {...ejes} interval={meses > 6 ? 1 : 0} />
                  <YAxis {...ejes} width={44} />
                  <Tooltip contentStyle={estiloTooltip} cursor={{ fill: "var(--muted)" }} formatter={(v, n) => [Number(v).toLocaleString("es"), `Clase ${n}`]} />
                  <Legend formatter={(v) => `Clase ${v}`} wrapperStyle={{ fontSize: 12 }} />
                  {CLASES_PARETO.map((c) => (
                    <Bar key={c} dataKey={c} stackId="guias" fill={COLOR_CLASE[c]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <h3 className="m-0 flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span>Clase A en riesgo</span>
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
 * El Pareto de un dropshipper en su ficha (12 meses): su clase y su lugar entre todos, sus guías mes a mes y su propio 80/20 de productos (qué pocos productos
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
            <Insignia tono={TONO_CLASE[yo.clase]}>Clase {yo.clase}</Insignia>
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
                    : `${rp.clases.A.n} de ${rp.n} productos (${textoParte(rp.paraLlegarA80.parte)}) hacen el ${textoParte(rp.clases.A.parteDelTotal)} de sus pedidos.`}
                  {rp.n > 1 && rp.filas[0].parte >= 0.5 && <span className="font-semibold text-warning"> Depende de {rp.nombres.get(rp.filas[0].id)}.</span>}
                </p>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {rp.filas
                    .filter((p) => p.clase === "A")
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
                {rp.n > rp.clases.A.n && (
                  <span className="text-xs text-muted-foreground">
                    Y {rp.n - rp.clases.A.n} {rp.n - rp.clases.A.n === 1 ? "producto más hace" : "productos más hacen"} el {textoParte(1 - rp.clases.A.parteDelTotal)} restante.
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
