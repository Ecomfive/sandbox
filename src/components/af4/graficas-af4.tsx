"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  LabelList,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dinero, dineroCompacto, entero, porcentaje, veces, type Moneda } from "@/lib/af4/formato";
import {
  COLOR_CERO,
  COLOR_EJE,
  COLOR_NEGATIVO,
  COLOR_POSITIVO,
  COLOR_REJILLA,
  COLOR_SERIE,
  TRAZO,
  barrasCascada,
  bandaEscenarios,
  type FormatoValor,
  type IndiceColor,
  type PasoCascada,
  type Trazo,
} from "@/lib/af4/grafica";
import { MarcoAF4 } from "./marco-af4";

// ---------------------------------------------------------------------------------------------
// Tema común: ejes, rejilla, globo y leyenda iguales en todas las gráficas del portal
// ---------------------------------------------------------------------------------------------

const TICK = { fontSize: 11, fill: COLOR_EJE };
const MARGEN = { top: 12, right: 12, left: 4, bottom: 0 };

/** Un valor con el formato único (completo en el globo y la tabla, compacto en el eje). */
export function formatear(v: number | null | undefined, formato: FormatoValor, moneda: Moneda, compacto = false): string {
  if (v === null || v === undefined) return "—";
  if (formato === "porcentaje") return porcentaje(v);
  if (formato === "entero") return entero(v);
  if (formato === "veces") return veces(v);
  return compacto ? dineroCompacto(v, moneda) : dinero(v, moneda);
}

interface FilaGlobo {
  nombre: string;
  valor: string;
  color: string;
  trazo?: string;
}

/** El globo de todas las gráficas: el título del punto, una línea por serie con su muestra (barra o trazo) y una nota. */
function Globo({ titulo, filas, nota }: { titulo: ReactNode; filas: FilaGlobo[]; nota?: string }) {
  return (
    <div className="min-w-44 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-[0_4px_16px_-4px_rgb(0_0_0/0.18)]">
      <p className="mb-1 font-semibold text-foreground">{titulo}</p>
      <ul className="flex flex-col gap-0.5">
        {filas.map((f) => (
          <li key={f.nombre} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <svg width="14" height="8" aria-hidden="true" className="shrink-0">
                {f.trazo === undefined ? (
                  <rect x="2" y="0" width="10" height="8" rx="1.5" fill={f.color} />
                ) : (
                  <line x1="0" x2="14" y1="4" y2="4" stroke={f.color} strokeWidth="2" strokeDasharray={f.trazo || undefined} />
                )}
              </svg>
              {f.nombre}
            </span>
            <span className="font-medium text-foreground tabular-nums">{f.valor}</span>
          </li>
        ))}
      </ul>
      {nota && <p className="mt-1 border-t border-border pt-1 text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Leyenda propia (la de recharts no respeta el formato ni el tema): muestra de barra o de trazo y el nombre. */
function Leyenda({ series }: { series: { nombre: string; color: string; linea: boolean; trazo?: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden="true">
            {s.linea ? (
              <line x1="0" x2="16" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.trazo} />
            ) : (
              <rect x="3" y="0" width="10" height="8" rx="1.5" fill={s.color} />
            )}
          </svg>
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/** La misma información en una tabla para quien no ve la gráfica. */
function TablaLectores({ titulo, cabeceras, filas }: { titulo: string; cabeceras: string[]; filas: (string | number)[][] }) {
  // El `sr-only` va en una caja y no en la tabla: una tabla no se deja encoger a 1 px y ensanchaba la página en el celular.
  return (
    <div className="sr-only">
    <table>
      <caption>{titulo}</caption>
      <thead>
        <tr>
          {cabeceras.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            {f.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

export interface ReferenciaAF4 {
  valor: number;
  etiqueta: string;
  /** «limite»: una línea de alerta (caja mínima, ROAS 1); «meta»: una referencia neutra (presupuesto). */
  tipo?: "limite" | "meta";
  /** Sobre el eje derecho (ROAS 1 junto al gasto). */
  derecha?: boolean;
}

function Referencias({
  referencias,
  formato,
  moneda,
  eje,
  formatoDerecha = formato,
}: {
  referencias: ReferenciaAF4[];
  formato: FormatoValor;
  moneda: Moneda;
  eje?: string;
  formatoDerecha?: FormatoValor;
}) {
  return (
    <>
      {referencias.map((r) => (
        <ReferenceLine
          key={r.etiqueta}
          y={r.valor}
          yAxisId={r.derecha ? "der" : eje}
          stroke={r.tipo === "limite" ? COLOR_NEGATIVO : COLOR_SERIE[5]}
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
          label={{ value: `${r.etiqueta} ${formatear(r.valor, r.derecha ? formatoDerecha : formato, moneda, true)}`, position: r.derecha ? "insideTopRight" : "insideTopLeft", fontSize: 11, fill: COLOR_EJE }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Barras comparadas y líneas de serie temporal
// ---------------------------------------------------------------------------------------------

export interface SerieAF4 {
  clave: string;
  nombre: string;
  color: IndiceColor;
  /** Barra (por defecto en `GraficaBarrasAF4`) o línea (por defecto en `GraficaLineasAF4`). */
  forma?: "barra" | "linea";
  trazo?: Trazo;
  /** El eje derecho (un ratio junto a montos: ROAS, %). */
  derecha?: boolean;
  /** Barras con la misma clave van apiladas (el gasto por plataforma). */
  apilar?: string;
}

export type PuntoAF4 = { etiqueta: string } & Record<string, number | string | null>;

interface PropsGrafica {
  id: string;
  titulo: string;
  detalle?: ReactNode;
  datos: PuntoAF4[];
  series: SerieAF4[];
  formato?: FormatoValor;
  /** Formato del eje derecho, si alguna serie va a la derecha. */
  formatoDerecha?: FormatoValor;
  moneda?: Moneda;
  alto?: number;
  referencias?: ReferenciaAF4[];
  /** Una nota por etiqueta que se agrega al globo («Contribución 28.4 % de las ventas»). */
  notas?: Record<string, string>;
  /** El nombre de la primera columna en la tabla para lectores («Mes», «Tienda»). */
  etiquetaEje?: string;
  accion?: ReactNode;
}

function GraficaCompuesta({ formaPorDefecto, ...p }: PropsGrafica & { formaPorDefecto: "barra" | "linea" }) {
  const { id, titulo, detalle, datos, series, formato = "dinero", formatoDerecha = "veces", moneda = "USD", alto = 260, referencias = [], notas, etiquetaEje = "Mes", accion } = p;
  const forma = (s: SerieAF4) => s.forma ?? formaPorDefecto;
  const hayDerecha = series.some((s) => s.derecha);
  const fmt = (s: SerieAF4 | undefined, v: number | null) => formatear(v, s?.derecha ? formatoDerecha : formato, moneda);
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} accion={accion}>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={alto}>
          <ComposedChart data={datos} margin={MARGEN} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke={COLOR_REJILLA} vertical={false} />
            <XAxis dataKey="etiqueta" tick={TICK} axisLine={{ stroke: COLOR_REJILLA }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis
              yAxisId="izq"
              tick={TICK}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v: number) => formatear(v, formato, moneda, true)}
            />
            {hayDerecha && (
              <YAxis
                yAxisId="der"
                orientation="right"
                tick={TICK}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v: number) => formatear(v, formatoDerecha, moneda, true)}
              />
            )}
            <ReferenceLine yAxisId="izq" y={0} stroke={COLOR_CERO} />
            {Referencias({ referencias, formato, moneda, eje: "izq", formatoDerecha })}
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <Globo
                    titulo={label}
                    nota={notas?.[String(label)]}
                    filas={series.map((s) => {
                      const item = payload.find((x) => x.dataKey === s.clave);
                      const v = item?.value;
                      return {
                        nombre: s.nombre,
                        valor: fmt(s, typeof v === "number" ? v : null),
                        color: COLOR_SERIE[s.color],
                        trazo: forma(s) === "linea" ? (TRAZO[s.trazo ?? "continuo"] ?? "") : undefined,
                      };
                    })}
                  />
                ) : null
              }
            />
            <Legend
              content={() => (
                <Leyenda
                  series={series.map((s) => ({ nombre: s.nombre, color: COLOR_SERIE[s.color], linea: forma(s) === "linea", trazo: TRAZO[s.trazo ?? "continuo"] }))}
                />
              )}
            />
            {series.map((s) =>
              forma(s) === "barra" ? (
                <Bar
                  key={s.clave}
                  yAxisId={s.derecha ? "der" : "izq"}
                  dataKey={s.clave}
                  name={s.nombre}
                  fill={COLOR_SERIE[s.color]}
                  stackId={s.apilar}
                  radius={s.apilar ? 0 : [2, 2, 0, 0]}
                  maxBarSize={30}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={s.clave}
                  yAxisId={s.derecha ? "der" : "izq"}
                  dataKey={s.clave}
                  name={s.nombre}
                  stroke={COLOR_SERIE[s.color]}
                  strokeWidth={2}
                  strokeDasharray={TRAZO[s.trazo ?? "continuo"]}
                  dot={{ r: 2.5, fill: COLOR_SERIE[s.color], stroke: "var(--card)", strokeWidth: 1 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  type="monotone"
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TablaLectores
        titulo={titulo}
        cabeceras={[etiquetaEje, ...series.map((s) => s.nombre)]}
        filas={datos.map((d) => [d.etiqueta, ...series.map((s) => fmt(s, typeof d[s.clave] === "number" ? (d[s.clave] as number) : null))])}
      />
    </MarcoAF4>
  );
}

/** Barras comparadas por período o por tienda (ingresos y EBITDA, contribución por tienda). Una serie puede ser línea. */
export function GraficaBarrasAF4(props: PropsGrafica) {
  return <GraficaCompuesta {...props} formaPorDefecto="barra" />;
}

/** Líneas de una serie temporal (márgenes, caja, ROAS). Una serie puede ser barra. */
export function GraficaLineasAF4(props: PropsGrafica) {
  return <GraficaCompuesta {...props} formaPorDefecto="linea" />;
}

// ---------------------------------------------------------------------------------------------
// Cascada (waterfall)
// ---------------------------------------------------------------------------------------------

/** El nombre de un paso inclinado 35° (cuando no cabe derecho bajo su barra). */
function TickInclinado({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: string } }) {
  return (
    <g transform={`translate(${Number(x ?? 0)},${Number(y ?? 0) + 4})`}>
      <text transform="rotate(-35)" textAnchor="end" dominantBaseline="central" fontSize={TICK.fontSize} fill={TICK.fill}>
        {payload?.value}
      </text>
    </g>
  );
}

/**
 * De las ventas al resultado, paso a paso: cada costo baja desde lo acumulado (rojo del tema), cada total intermedio
 * arranca de cero (gris oscuro). El monto va sobre cada barra con su signo, así que no depende del color.
 */
export function GraficaCascadaAF4({
  id,
  titulo,
  detalle,
  pasos,
  moneda = "USD",
  alto = 280,
  accion,
}: {
  id: string;
  titulo: string;
  detalle?: ReactNode;
  pasos: PasoCascada[];
  moneda?: Moneda;
  alto?: number;
  accion?: ReactNode;
}) {
  const barras = barrasCascada(pasos).map((b) => ({ ...b, texto: dineroCompacto(b.valor, moneda, { conSigno: b.clase !== "total" }) }));
  const color = (c: "total" | "sube" | "baja") => (c === "total" ? COLOR_SERIE[1] : c === "sube" ? COLOR_POSITIVO : COLOR_NEGATIVO);
  const ventas = pasos.find((p) => p.tipo === "inicio")?.valor ?? 0;
  const pctVentas = (v: number) => (ventas > 0 ? porcentaje((v / ventas) * 100) : null);
  // Con poco espacio por paso (una gráfica a media pantalla, el celular), los nombres van inclinados y solo los totales
  // llevan su monto encima: los de los costos se tapaban unos con otros (siguen en el globo y en la tabla para lectores).
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setAncho(el.clientWidth));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  const porPaso = ancho > 0 ? (ancho - 80) / Math.max(barras.length, 1) : 100;
  const inclinar = porPaso < 78;
  const soloTotales = porPaso < 60;
  const datos = barras.map((b) => ({ ...b, rotulo: soloTotales && b.clase !== "total" ? "" : b.texto }));
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} accion={accion}>
      <div aria-hidden="true" ref={caja}>
        <ResponsiveContainer width="100%" height={alto + (inclinar ? 44 : 0)}>
          <ComposedChart data={datos} margin={{ ...MARGEN, top: 22 }} barCategoryGap="18%">
            <CartesianGrid stroke={COLOR_REJILLA} vertical={false} />
            <XAxis
              dataKey="etiqueta"
              tick={inclinar ? TickInclinado : TICK}
              height={inclinar ? 74 : 30}
              axisLine={{ stroke: COLOR_REJILLA }}
              tickLine={false}
              interval={0}
            />
            <YAxis tick={TICK} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => dineroCompacto(v, moneda)} />
            <ReferenceLine y={0} stroke={COLOR_CERO} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const b = active ? (payload?.[0]?.payload as (typeof barras)[number] | undefined) : undefined;
                if (!b) return null;
                const pct = pctVentas(b.clase === "total" ? b.valor : Math.abs(b.valor));
                return (
                  <Globo
                    titulo={b.etiqueta}
                    filas={[
                      { nombre: b.clase === "total" ? "Resultado" : "Monto", valor: dinero(b.valor, moneda, { conSigno: b.clase !== "total" }), color: color(b.clase) },
                      ...(b.clase !== "total" ? [{ nombre: "Acumulado", valor: dinero(b.acumulado, moneda), color: COLOR_SERIE[1] }] : []),
                    ]}
                    nota={pct ? `${pct} de las ventas` : undefined}
                  />
                );
              }}
            />
            <Bar dataKey="base" stackId="c" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="alto"
              stackId="c"
              radius={[2, 2, 2, 2]}
              maxBarSize={56}
              isAnimationActive={false}
            >
              {barras.map((b) => (
                <Cell key={b.etiqueta} fill={color(b.clase)} />
              ))}
              <LabelList dataKey="rotulo" position="top" fontSize={11} fill="var(--foreground-soft)" />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TablaLectores
        titulo={titulo}
        cabeceras={["Paso", "Monto", "Acumulado"]}
        filas={barras.map((b) => [b.etiqueta, dinero(b.valor, moneda, { conSigno: b.clase !== "total" }), dinero(b.acumulado, moneda)])}
      />
    </MarcoAF4>
  );
}

// ---------------------------------------------------------------------------------------------
// Escenarios (área)
// ---------------------------------------------------------------------------------------------

export interface EscenarioAF4 {
  clave: string;
  nombre: string;
  valores: number[];
  color: IndiceColor;
  trazo?: Trazo;
}

/**
 * Escenarios en el tiempo (la caja de las 13 semanas): una banda sombreada entre el peor y el mejor, una línea por
 * escenario (cada una con su trazo) y los límites como líneas de referencia. Los puntos del escenario activo que caen
 * bajo el `minimo` se marcan con un punto rojo más grande.
 */
export function GraficaEscenariosAF4({
  id,
  titulo,
  detalle,
  etiquetas,
  escenarios,
  activo,
  minimo,
  referencias = [],
  moneda = "USD",
  alto = 280,
  etiquetaEje = "Semana",
  accion,
}: {
  id: string;
  titulo: string;
  detalle?: ReactNode;
  etiquetas: string[];
  escenarios: EscenarioAF4[];
  activo?: string;
  minimo?: number;
  referencias?: ReferenciaAF4[];
  moneda?: Moneda;
  alto?: number;
  etiquetaEje?: string;
  accion?: ReactNode;
}) {
  const banda = bandaEscenarios(escenarios.map((e) => e.valores));
  const datos = etiquetas.map((etiqueta, i) => ({ etiqueta, banda: banda[i], ...Object.fromEntries(escenarios.map((e) => [e.clave, e.valores[i]])) }));
  const punto = (e: EscenarioAF4) =>
    function Punto(props: { cx?: number; cy?: number; value?: number; index?: number }) {
      const { cx, cy, value, index } = props;
      if (cx === undefined || cy === undefined || value === undefined) return <g key={`${e.clave}-${index}`} />;
      const bajo = e.clave === activo && minimo !== undefined && value < minimo;
      return (
        <circle
          key={`${e.clave}-${index}`}
          cx={cx}
          cy={cy}
          r={bajo ? 4 : e.clave === activo ? 2.5 : 0}
          fill={bajo ? COLOR_NEGATIVO : COLOR_SERIE[e.color]}
          stroke="var(--card)"
          strokeWidth={1}
        />
      );
    };
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} accion={accion}>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={alto}>
          <ComposedChart data={datos} margin={MARGEN}>
            <CartesianGrid stroke={COLOR_REJILLA} vertical={false} />
            <XAxis dataKey="etiqueta" tick={TICK} axisLine={{ stroke: COLOR_REJILLA }} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => dineroCompacto(v, moneda)} />
            <ReferenceLine y={0} stroke={COLOR_CERO} />
            {Referencias({ referencias, formato: "dinero", moneda })}
            <Area dataKey="banda" stroke="none" fill={COLOR_SERIE[5]} fillOpacity={0.14} isAnimationActive={false} activeDot={false} />
            <Tooltip
              content={({ active, label }) => {
                const i = etiquetas.indexOf(String(label));
                if (!active || i < 0) return null;
                return (
                  <Globo
                    titulo={label}
                    filas={escenarios.map((e) => ({
                      nombre: e.nombre,
                      valor: dinero(e.valores[i], moneda),
                      color: COLOR_SERIE[e.color],
                      trazo: TRAZO[e.trazo ?? "continuo"] ?? "",
                    }))}
                    nota={minimo !== undefined && activo && (escenarios.find((e) => e.clave === activo)?.valores[i] ?? 0) < minimo ? "Por debajo de la caja mínima" : undefined}
                  />
                );
              }}
            />
            <Legend
              content={() => (
                <Leyenda series={escenarios.map((e) => ({ nombre: e.nombre, color: COLOR_SERIE[e.color], linea: true, trazo: TRAZO[e.trazo ?? "continuo"] }))} />
              )}
            />
            {escenarios.map((e) => (
              <Line
                key={e.clave}
                dataKey={e.clave}
                name={e.nombre}
                stroke={COLOR_SERIE[e.color]}
                strokeWidth={e.clave === activo ? 2.5 : 1.5}
                strokeDasharray={TRAZO[e.trazo ?? "continuo"]}
                dot={punto(e)}
                activeDot={{ r: 4 }}
                type="monotone"
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TablaLectores
        titulo={titulo}
        cabeceras={[etiquetaEje, ...escenarios.map((e) => e.nombre)]}
        filas={etiquetas.map((et, i) => [et, ...escenarios.map((e) => dinero(e.valores[i], moneda))])}
      />
    </MarcoAF4>
  );
}
