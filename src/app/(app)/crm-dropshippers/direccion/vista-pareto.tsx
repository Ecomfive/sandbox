"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { Barra, Boton, Chip, ChipEnlace, Cifra, Cifras, Insignia, Tarjeta, type TonoDireccion } from "./piezas-direccion";
import { rutaVista } from "./ruta";

/** Los periodos que se pueden mirar; el análisis siempre sale de las guías mes a mes de los últimos 12 meses. */
export const PERIODOS_PARETO = [3, 6, 12];

const COLOR_CLASE: Record<ClasePareto, string> = { A: "var(--primario)", B: "var(--warning)", C: "var(--border-control)" };
const TONO_CLASE: Record<ClasePareto, TonoDireccion> = { A: "info", B: "aviso", C: "neutro" };
const LIMITE_CLASE: Record<ClasePareto, string> = { A: "hasta el 80 % de las guías", B: "del 80 al 95 %", C: "el último 5 %" };
const TONO_SEGMENTO: Record<Segmento, TonoDireccion> = { activo: "exito", riesgo: "aviso", dormido: "peligro", perdido: "neutro", sin_pedidos: "neutro" };
const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };
const POR_PAGINA = 40;

const nombreMes = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { month: "short", year: "2-digit", timeZone: "UTC" });
const enRiesgo = (f: FilaDireccion) => f.segmento === "riesgo" || f.segmento === "dormido" || f.segmento === "perdido";
const guias = (n: number) => `${n.toLocaleString("es")} ${n === 1 ? "guía" : "guías"}`;

/** Las guías por mes de cada dropshipper como un `Map` (el dato viaja como objeto). */
function useSeries(pareto: DatosPareto) {
  return useMemo(() => new Map(Object.entries(pareto.porMes)), [pareto]);
}

/** Cuatro gráficas comparten esta cabecera de datos: la curva ordenada de más a menos, con su acumulado. */
function datosCurva(r: ResultadoPareto, nombreDe: (id: string) => string) {
  return r.filas.map((f) => ({ posicion: f.posicion, nombre: nombreDe(f.id), guias: f.valor, acumulado: Math.round(f.acumulado * 1000) / 10, clase: f.clase }));
}

/** El rótulo de una clase con su límite, para las leyendas. */
function RotuloClase({ clase, n }: { clase: ClasePareto; n?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: COLOR_CLASE[clase] }} />
      <span className="font-semibold">Clase {clase}</span>
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

/** Dirección › Pareto: el 80/20 de las guías de los dropshippers, con los últimos 3, 6 o 12 meses. */
export function VistaPareto({ datos, pareto, meses }: { datos: DatosDireccion; pareto: DatosPareto; meses: number }) {
  const series = useSeries(pareto);
  const r = useMemo(() => paretoDe(series, meses), [series, meses]);
  const porId = useMemo(() => new Map(datos.filas.map((f) => [f.id, f])), [datos.filas]);
  const nombreDe = useMemo(() => (id: string) => porId.get(id)?.nombre ?? "Sin ficha", [porId]);
  const porMes = useMemo(() => mesesPorClase(series, r, meses, pareto.meses).map((m) => ({ ...m, nombre: nombreMes(m.mes) })), [series, r, meses, pareto.meses]);
  const [filtro, setFiltro] = useState<ClasePareto | "A_riesgo" | "todas">("todas");
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  const aEnRiesgo = r.filas.filter((f) => f.clase === "A" && (porId.get(f.id) ? enRiesgo(porId.get(f.id)!) : false));
  const parteEnRiesgo = aEnRiesgo.reduce((s, f) => s + f.parte, 0);
  const sinGuias = Math.max(0, datos.filas.length - r.n);
  const visibles = r.filas.filter((f) => (filtro === "todas" ? true : filtro === "A_riesgo" ? aEnRiesgo.includes(f) : f.clase === filtro));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-base font-semibold">{fraseDelAnalisis(r, "los dropshippers", "las guías")}</p>
        <nav aria-label="Periodo del Pareto" className="flex gap-1.5">
          {PERIODOS_PARETO.map((m) => (
            <ChipEnlace key={m} href={rutaVista("pareto", m === 12 ? {} : { meses: m })} activo={meses === m}>
              {m} meses
            </ChipEnlace>
          ))}
        </nav>
      </div>

      <Cifras>
        <Cifra titulo="Clase A" valor={r.clases.A.n} nota={`${textoParte(r.clases.A.parteDeLosItems)} de los clientes · ${textoParte(r.clases.A.parteDelTotal)} de las guías`} tono="info" activa={filtro === "A"} alPulsar={() => setFiltro((x) => (x === "A" ? "todas" : "A"))} />
        <Cifra titulo="Clase B" valor={r.clases.B.n} nota={`${textoParte(r.clases.B.parteDeLosItems)} de los clientes · ${textoParte(r.clases.B.parteDelTotal)} de las guías`} tono="aviso" activa={filtro === "B"} alPulsar={() => setFiltro((x) => (x === "B" ? "todas" : "B"))} />
        <Cifra titulo="Clase C" valor={r.clases.C.n} nota={`${textoParte(r.clases.C.parteDeLosItems)} de los clientes · ${textoParte(r.clases.C.parteDelTotal)} de las guías`} tono="neutro" activa={filtro === "C"} alPulsar={() => setFiltro((x) => (x === "C" ? "todas" : "C"))} />
        <Cifra
          titulo={`El ${textoParte(PARTE_TOP)} de los clientes hace`}
          valor={textoParte(r.top.parteDelTotal)}
          nota={r.cumple8020 ? `Se cumple el 80/20 (${r.top.n} clientes)` : `No llega al 80 % (${r.top.n} clientes)`}
          tono={r.cumple8020 ? "exito" : "aviso"}
        />
        <Cifra
          titulo="Clase A en riesgo"
          valor={aEnRiesgo.length}
          nota={aEnRiesgo.length ? `${textoParte(parteEnRiesgo)} de las guías bajó o paró` : "Ninguno de los que más pesan"}
          tono={aEnRiesgo.length ? "peligro" : "exito"}
          activa={filtro === "A_riesgo"}
          alPulsar={() => setFiltro((x) => (x === "A_riesgo" ? "todas" : "A_riesgo"))}
        />
        <Cifra titulo={`Guías en ${meses} meses`} valor={r.total.toLocaleString("es")} nota={`${r.n} con guías · ${sinGuias} sin guías`} tono="neutro" />
      </Cifras>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Tarjeta id="t-curva" titulo="Curva de Pareto" extra={`${r.n} dropshippers, de más a menos guías`} className="lg:col-span-2">
          {r.n === 0 ? <p className="m-0 text-sm text-muted-foreground">Sin guías en {meses} meses.</p> : <CurvaPareto r={r} nombreDe={nombreDe} />}
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {CLASES_PARETO.map((c) => (
              <RotuloClase key={c} clase={c} n={r.clases[c].n} />
            ))}
          </div>
        </Tarjeta>

        <Tarjeta id="t-meses" titulo="Guías por mes, por clase" extra={`${meses} meses`}>
          <div role="img" aria-label={`Guías por mes por clase: ${porMes.map((m) => `${m.nombre} A ${m.A}, B ${m.B}, C ${m.C}`).join("; ")}`} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMes} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
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
          <p className="m-0 text-xs text-muted-foreground">El último mes va en curso.</p>
        </Tarjeta>
      </div>

      <Tarjeta id="t-ranking" titulo="Quién hace el 80 %" extra={`${visibles.length} de ${r.n}`}>
        <div className="flex flex-wrap gap-1.5">
          <Chip activo={filtro === "todas"} onClick={() => setFiltro("todas")}>
            Todos ({r.n})
          </Chip>
          {CLASES_PARETO.map((c) => (
            <Chip key={c} activo={filtro === c} onClick={() => setFiltro((x) => (x === c ? "todas" : c))}>
              Clase {c} ({r.clases[c].n})
            </Chip>
          ))}
          <Chip activo={filtro === "A_riesgo"} onClick={() => setFiltro((x) => (x === "A_riesgo" ? "todas" : "A_riesgo"))}>
            A en riesgo ({aEnRiesgo.length})
          </Chip>
        </div>
        {visibles.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Nadie en este grupo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Dropshippers ordenados por guías en {meses} meses, con su parte y el acumulado</caption>
              <thead>
                <tr className="text-left text-xs font-semibold text-muted-foreground">
                  <th scope="col" className="py-2 pr-3">
                    #
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Dropshipper
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Clase
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    Guías
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    Del total
                  </th>
                  <th scope="col" className="w-40 py-2 pr-3">
                    Acumulado
                  </th>
                  <th scope="col" className="py-2">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.slice(0, mostrar).map((fila) => {
                  const f = porId.get(fila.id);
                  return (
                    <tr key={fila.id} className="border-t border-border">
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{fila.posicion}</td>
                      <td className="py-2 pr-3">
                        {f ? (
                          <Link href={rutaVista("clientes", { cliente: f.id })} className={`font-semibold hover:underline ${anilloFoco}`}>
                            {f.nombre} <span className="text-xs font-normal text-muted-foreground">{f.codigo}</span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Sin ficha</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Insignia tono={TONO_CLASE[fila.clase]}>Clase {fila.clase}</Insignia>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{fila.valor.toLocaleString("es")}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{textoParte(fila.parte)}</td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <span className="w-12 shrink-0 text-right text-xs whitespace-nowrap tabular-nums">{textoParte(fila.acumulado)}</span>
                          <Barra valor={fila.acumulado * 100} tono={TONO_CLASE[fila.clase]} />
                        </span>
                      </td>
                      <td className="py-2">{f ? <Insignia tono={TONO_SEGMENTO[f.segmento]}>{ETIQUETA_SEGMENTO[f.segmento]}</Insignia> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visibles.length > mostrar && (
          <Boton onClick={() => setMostrar((m) => m + POR_PAGINA)} className="self-start">
            Ver {Math.min(POR_PAGINA, visibles.length - mostrar)} más
          </Boton>
        )}
      </Tarjeta>
    </>
  );
}

/** El Pareto en el Resumen (12 meses): la frase, la curva y las tres clases; lleva a la pestaña Pareto. */
export function TarjetaParetoResumen({ datos, pareto }: { datos: DatosDireccion; pareto: DatosPareto | { error: string } | null }) {
  const sinDatos = !pareto || "error" in pareto;
  const series = useMemo(() => new Map(Object.entries(sinDatos ? {} : pareto.porMes)), [pareto, sinDatos]);
  const r = useMemo(() => paretoDe(series, 12), [series]);
  const porId = useMemo(() => new Map(datos.filas.map((f) => [f.id, f])), [datos.filas]);
  const curva = useMemo(() => datosCurva(r, (id) => porId.get(id)?.nombre ?? "Sin ficha"), [r, porId]);
  const aEnRiesgo = r.filas.filter((f) => f.clase === "A" && porId.get(f.id) && enRiesgo(porId.get(f.id)!));

  return (
    <Tarjeta id="t-pareto" titulo="Pareto de guías" extra="Últimos 12 meses">
      {pareto && "error" in pareto ? (
        <p role="alert" className="m-0 text-sm text-warning">
          {pareto.error}
        </p>
      ) : r.n === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Sin guías en los últimos 12 meses.</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <p className="m-0 text-base font-semibold">{fraseDelAnalisis(r, "los dropshippers", "las guías")}</p>
            <div role="img" aria-label={`Curva de Pareto de 12 meses: ${fraseDelAnalisis(r, "los dropshippers", "las guías")}`} className="h-[170px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curva} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="posicion" {...ejes} interval="preserveStartEnd" minTickGap={30} />
                  <YAxis domain={[0, 100]} ticks={[0, 40, 80, 100]} tickFormatter={(v) => `${v} %`} {...ejes} width={50} />
                  <Tooltip
                    contentStyle={estiloTooltip}
                    labelFormatter={(l, payload) => (payload?.[0]?.payload ? `#${l} · ${(payload[0].payload as { nombre: string }).nombre}` : String(l))}
                    formatter={(v) => [`${Number(v).toLocaleString("es")} %`, "Acumulado"]}
                  />
                  <ReferenceLine y={LIMITE_A * 100} stroke="var(--foreground)" strokeDasharray="5 4" strokeOpacity={0.55} />
                  <Area dataKey="acumulado" type="monotone" stroke="var(--primario)" strokeWidth={2} fill="var(--primario)" fillOpacity={0.15} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {CLASES_PARETO.map((c) => (
              <li key={c} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <RotuloClase clase={c} />
                  <span className="font-bold tabular-nums">{r.clases[c].n}</span>
                </span>
                <Barra valor={r.clases[c].parteDelTotal * 100} tono={TONO_CLASE[c]} alto="h-2" />
                <span className="text-xs text-muted-foreground">
                  {textoParte(r.clases[c].parteDeLosItems)} de los clientes · {textoParte(r.clases[c].parteDelTotal)} de las guías
                </span>
              </li>
            ))}
            {aEnRiesgo.length > 0 && (
              <li className="text-sm font-semibold text-destructive">
                {aEnRiesgo.length} {aEnRiesgo.length === 1 ? "cliente clase A bajó o paró" : "clientes clase A bajaron o pararon"}
              </li>
            )}
          </ul>
        </div>
      )}
      <Link href={rutaVista("pareto")} className={`mt-auto self-start text-sm font-semibold text-primario hover:underline ${anilloFoco}`}>
        Ver el Pareto →
      </Link>
    </Tarjeta>
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
