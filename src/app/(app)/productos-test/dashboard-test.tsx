"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { BotonBarra, CabeceraTarjeta, Indicador, Punto, Segmentado, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { TEST_NUMEROS, type FilaProductoTest } from "./def-productos-test";
import {
  compararPor,
  dispersionCtrCpa,
  etiquetaClaveTestNumero,
  filtrarTests,
  histogramaCpa,
  serieTests,
  SIN_FILTROS_TEST,
  winnersVsFallidos,
  type DimensionTest,
  type FiltrosTest,
  type MetricaComparada,
} from "./calculos-dashboard-test";
import { CPA_OBJETIVO, estadisticas, etiquetaPeriodo, finDe, limpiarCategoria, paraRevisar, porCategoria, porcentaje, promedio, resultadoDe, usd, type Granularidad } from "./informe";

const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "0 8px 24px -12px rgb(95 67 209 / 0.45)" };
/** Los mismos colores del Dashboard de Compras: el neón del riel y de los botones principales (`--neon`). */
const NEON = { rosa: "#d74c81", magenta: "#b12a97", violeta: "#8a35c9", indigo: "#5f43d1" } as const;
function DegradadosNeon() {
  return (
    <defs>
      <linearGradient id="t-neon-violeta" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.magenta} />
        <stop offset="100%" stopColor={NEON.indigo} />
      </linearGradient>
      <linearGradient id="t-neon-suave" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.violeta} stopOpacity={0.35} />
        <stop offset="100%" stopColor={NEON.violeta} stopOpacity={0.12} />
      </linearGradient>
      <linearGradient id="t-neon-rosa" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e86a9a" />
        <stop offset="100%" stopColor={NEON.rosa} />
      </linearGradient>
    </defs>
  );
}
const claseSelect = `h-[34px] max-w-[11rem] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`;
const entero = (n: number) => n.toLocaleString("es-CR");

const NOMBRE_FILTRO: Record<keyof FiltrosTest, string> = { desde: "Desde", hasta: "Hasta", categoria: "Categoría", testNumero: "Test #", resultado: "Resultado" };
const NOMBRE_RESULTADO: Record<string, string> = { ganador: "Winners", fallido: "Fallidos", consulta: "Consulta", otro: "Otros" };
const DIMENSIONES: { valor: DimensionTest; etiqueta: string; filtro?: keyof FiltrosTest }[] = [
  { valor: "categoria", etiqueta: "Categoría", filtro: "categoria" },
  { valor: "testNumero", etiqueta: "Test #", filtro: "testNumero" },
  { valor: "semana", etiqueta: "Semana" },
];

function Tarjeta({ id, titulo, extra, children }: { id: string; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id={id} titulo={titulo}>
        {extra}
      </CabeceraTarjeta>
      {children}
    </section>
  );
}

/** Una barra horizontal que se puede pulsar para filtrar (como en el Dashboard de Compras). */
function BarraH({ nombre, valor, maximo, texto, activo, alPulsar }: { nombre: string; valor: number; maximo: number; texto: string; activo?: boolean; alPulsar?: () => void }) {
  const contenido = (
    <>
      <span className="flex justify-between gap-2 text-[13px]">
        <span className="truncate">{nombre}</span>
        <b className="font-medium whitespace-nowrap tabular-nums">{texto}</b>
      </span>
      <span className="mt-1 block h-1.5 rounded-full bg-muted">
        <span data-activa={activo || undefined} className={`barra-neon block h-1.5 rounded-full transition-opacity ${activo ? "" : "opacity-70"}`} style={{ width: `${maximo ? Math.max(2, (valor / maximo) * 100) : 0}%` }} />
      </span>
    </>
  );
  return alPulsar ? (
    <button type="button" aria-pressed={activo} onClick={alPulsar} className={`block w-full rounded px-1.5 py-1 text-left hover:bg-muted ${anilloFoco}`}>
      {contenido}
    </button>
  ) : (
    <div className="px-1.5 py-1">{contenido}</div>
  );
}

const formatear = (m: MetricaComparada, v: number | null) =>
  v === null ? "—" : m.formato === "usd" ? usd(v) : m.formato === "porcentaje" ? porcentaje(v) : v.toLocaleString("es-CR", { maximumFractionDigits: 1 });

/**
 * Dashboard de Test productos: todo el testing del país a la vez, con unos mismos filtros (fechas del test, categoría,
 * Test # y resultado) que también se ponen pulsando una barra, una categoría o una fila. Indicadores, tests por periodo,
 * winners por categoría, distribución del CPA contra el criterio, CTR frente a CPA, winners frente a fallidos, comparación
 * y lo que conviene revisar. Mismos colores que el Dashboard de Compras.
 */
export function DashboardTest({ productos, codigoPais }: { productos: FilaProductoTest[]; codigoPais: string }) {
  const [f, setF] = useState<FiltrosTest>(SIN_FILTROS_TEST);
  const [g, setG] = useState<Granularidad>("semana");
  const [dimension, setDimension] = useState<DimensionTest>("categoria");
  const poner = <K extends keyof FiltrosTest>(campo: K, valor: FiltrosTest[K]) => setF((x) => ({ ...x, [campo]: x[campo] === valor ? SIN_FILTROS_TEST[campo] : valor }));

  const categorias = useMemo(() => [...new Set(productos.map((p) => limpiarCategoria(p.categoria)))].sort((a, b) => a.localeCompare(b)), [productos]);
  const filtradas = useMemo(() => filtrarTests(productos, f), [productos, f]);

  const k = useMemo(() => {
    const s = estadisticas(filtradas);
    return { ...s, ctr: promedio(filtradas, (p) => p.metricaCtr), hook: promedio(filtradas, (p) => p.metricaHookRate) };
  }, [filtradas]);
  const serie = useMemo(() => serieTests(filtradas, g), [filtradas, g]);
  const cats = useMemo(() => porCategoria(filtradas).map((c) => ({ ...c, tasa: c.testeados ? (c.ganadores / c.testeados) * 100 : 0 })), [filtradas]);
  const histograma = useMemo(() => histogramaCpa(filtradas), [filtradas]);
  const puntos = useMemo(() => dispersionCtrCpa(filtradas), [filtradas]);
  const comparadas = useMemo(() => winnersVsFallidos(filtradas), [filtradas]);
  const ranking = useMemo(() => compararPor(filtradas, dimension), [filtradas, dimension]);
  const revisar = useMemo(() => paraRevisar(filtradas).slice(0, 6), [filtradas]);
  const mejores = useMemo(
    () =>
      filtradas
        .filter((p) => resultadoDe(p.estado) === "ganador" && p.metricaCpa !== null)
        .sort((a, b) => (a.metricaCpa ?? 0) - (b.metricaCpa ?? 0))
        .slice(0, 5),
    [filtradas],
  );
  const dimActual = DIMENSIONES.find((d) => d.valor === dimension)!;
  const activos = (Object.keys(f) as (keyof FiltrosTest)[]).filter((x) => f[x] !== SIN_FILTROS_TEST[x]);
  const maxTestCat = Math.max(0, ...cats.map((c) => c.testeados));
  // El eje del CPA llega hasta donde está el 90 % de los tests (al menos 3 veces el criterio): unos pocos CPA muy altos no
  // aplastan la zona que importa, la de debajo del criterio. Los de más arriba quedan pegados al borde.
  const topeCpa = useMemo(() => {
    const cpas = puntos.map((p) => p.cpa).sort((a, b) => a - b);
    return Math.ceil(Math.max(CPA_OBJETIVO * 3, cpas[Math.floor(cpas.length * 0.9)] ?? 0));
  }, [puntos]);
  const enEje = useMemo(() => puntos.map((p) => ({ ...p, cpaEje: Math.min(p.cpa, topeCpa) })), [puntos, topeCpa]);

  function elegirPeriodo(clave: string) {
    const fin = finDe(clave, g);
    setF((x) => (x.desde === clave && x.hasta === fin ? { ...x, desde: "", hasta: "" } : { ...x, desde: g === "mes" ? `${clave}-01` : clave, hasta: fin }));
  }
  const textoFiltro = (x: keyof FiltrosTest) =>
    x === "testNumero" ? etiquetaClaveTestNumero(f.testNumero) : x === "resultado" ? NOMBRE_RESULTADO[f.resultado] : String(f[x]);

  return (
    <div className="graficas-neon flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Desde
          <input type="date" value={f.desde} onChange={(e) => setF((x) => ({ ...x, desde: e.target.value }))} className={claseSelect} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Hasta
          <input type="date" value={f.hasta} onChange={(e) => setF((x) => ({ ...x, hasta: e.target.value }))} className={claseSelect} />
        </label>
        <select aria-label="Categoría" value={f.categoria} onChange={(e) => setF((x) => ({ ...x, categoria: e.target.value }))} className={claseSelect}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Test #" value={f.testNumero} onChange={(e) => setF((x) => ({ ...x, testNumero: e.target.value }))} className={claseSelect}>
          <option value="">Todos los test #</option>
          {TEST_NUMEROS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
          <option value="sin">Sin test #</option>
        </select>
        <BotonBarra activo={f.resultado === "ganador"} onClick={() => poner("resultado", "ganador")}>
          Solo winners
        </BotonBarra>
        <BotonBarra activo={f.resultado === "fallido"} onClick={() => poner("resultado", "fallido")}>
          Solo fallidos
        </BotonBarra>
      </div>

      {activos.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Filtrando:</span>
          {activos.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setF((v) => ({ ...v, [x]: SIN_FILTROS_TEST[x] }))}
              aria-label={`Quitar el filtro ${NOMBRE_FILTRO[x]}`}
              className={`rounded-full border border-primario/40 bg-primario-suave px-2 py-0.5 text-primario hover:border-primario ${anilloFoco}`}
            >
              {NOMBRE_FILTRO[x]}: {textoFiltro(x)} ×
            </button>
          ))}
          <button type="button" onClick={() => setF(SIN_FILTROS_TEST)} className={`rounded px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
            Quitar todos
          </button>
        </div>
      )}

      <section aria-label="Indicadores" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap">
          <Indicador titulo="Testeados" valor={entero(k.testeados)} detalle={`${entero(k.fallidos)} fallidos · ${entero(k.consulta)} en consulta`} />
          <Indicador titulo="Winners" punto={k.ganadores ? "exito" : undefined} valor={entero(k.ganadores)} detalle={`${porcentaje(k.tasa, 0)} de los testeados`} />
          <Indicador titulo="Gasto" valor={usd(k.gasto, 0)} detalle={`${entero(k.compras)} compras`} />
          <Indicador
            titulo="CPA global"
            punto={k.cpa === null ? undefined : k.cpa < CPA_OBJETIVO ? "exito" : "aviso"}
            valor={k.cpa === null ? "—" : usd(k.cpa)}
            detalle={`criterio: menos de ${usd(CPA_OBJETIVO)}`}
          />
          <Indicador titulo="Costo por winner" valor={k.costoPorGanador === null ? "—" : usd(k.costoPorGanador, 0)} detalle="gasto ÷ winners" />
          <Indicador titulo="CTR promedio" valor={k.ctr === null ? "—" : porcentaje(k.ctr)} detalle="de los tests filtrados" />
          <Indicador titulo="Hook rate promedio" valor={k.hook === null ? "—" : porcentaje(k.hook)} detalle="de los tests filtrados" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Tarjeta
          id="t-periodos"
          titulo="Tests por periodo"
          extra={
            <Segmentado
              etiqueta="Agrupar por"
              valor={g}
              alCambiar={setG}
              opciones={[
                { valor: "dia", etiqueta: "Día" },
                { valor: "semana", etiqueta: "Semana" },
                { valor: "mes", etiqueta: "Mes" },
              ]}
            />
          }
        >
          <div className="h-[280px] p-2">
            {serie.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No hay tests con fecha con estos filtros.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={serie}
                  margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
                  onClick={(e) => {
                    const p = serie.find((s) => s.etiqueta === e?.activeLabel);
                    if (p) elegirPeriodo(p.clave);
                  }}
                >
                  <DegradadosNeon />
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="etiqueta" {...ejes} interval="preserveStartEnd" />
                  <YAxis yAxisId="n" {...ejes} allowDecimals={false} width={32} />
                  <YAxis yAxisId="pct" orientation="right" {...ejes} width={40} domain={[0, 100]} tickFormatter={(v: number) => `${v} %`} />
                  <Tooltip contentStyle={estiloTooltip} labelFormatter={(_, p) => p?.[0]?.payload?.nombre ?? ""} formatter={(v, nombre) => (nombre === "Tasa de winners" ? `${v} %` : v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="n" dataKey="ganadores" name="Winners" stackId="r" fill="url(#t-neon-violeta)" cursor="pointer" />
                  <Bar yAxisId="n" dataKey="consulta" name="Consulta" stackId="r" fill="url(#t-neon-rosa)" cursor="pointer" />
                  <Bar yAxisId="n" dataKey="fallidos" name="Fallidos" stackId="r" fill="url(#t-neon-suave)" radius={[4, 4, 0, 0]} cursor="pointer" />
                  <Line yAxisId="pct" type="monotone" dataKey="tasa" name="Tasa de winners" stroke={NEON.rosa} strokeWidth={2.5} dot={{ r: 2.5, fill: NEON.rosa }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Tarjeta>

        <Tarjeta id="t-categorias" titulo="Winners por categoría" extra={<span className="text-xs text-muted-foreground">winners de testeados</span>}>
          <div className="flex flex-col p-2">
            {cats.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">Sin tests con estos filtros.</p>
            ) : (
              cats.map((c) => (
                <BarraH
                  key={c.categoria}
                  nombre={c.categoria}
                  valor={c.testeados}
                  maximo={maxTestCat}
                  texto={`${c.ganadores} de ${c.testeados} · ${Math.round(c.tasa)} %`}
                  activo={f.categoria === c.categoria}
                  alPulsar={() => poner("categoria", c.categoria)}
                />
              ))
            )}
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="t-cpa" titulo="Distribución del CPA" extra={<span className="text-xs text-muted-foreground">tests por rango · criterio {usd(CPA_OBJETIVO, 0)}</span>}>
          <div className="h-[260px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histograma} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                <DegradadosNeon />
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="rango" {...ejes} interval={0} angle={-30} textAnchor="end" height={42} />
                <YAxis {...ejes} allowDecimals={false} width={32} />
                <Tooltip contentStyle={estiloTooltip} labelFormatter={(l) => `CPA ${l}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* La zona que cumple el criterio: de $0 hasta el rango que termina en $4 (una línea caería en el centro de una barra). */}
                <ReferenceArea
                  x1={histograma[0]?.rango}
                  x2={histograma[CPA_OBJETIVO - 1]?.rango}
                  fill={NEON.violeta}
                  fillOpacity={0.07}
                  label={{ value: `Menos de ${usd(CPA_OBJETIVO, 0)}`, position: "insideTop", fontSize: 11, fill: NEON.violeta }}
                />
                <Bar dataKey="ganadores" name="Winners" stackId="c" fill="url(#t-neon-violeta)" />
                <Bar dataKey="otros" name="Consulta y otros" stackId="c" fill="url(#t-neon-rosa)" />
                <Bar dataKey="fallidos" name="Fallidos" stackId="c" fill="url(#t-neon-suave)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>

        <Tarjeta id="t-dispersion" titulo="CTR frente a CPA" extra={<span className="text-xs text-muted-foreground">un punto por test</span>}>
          <div className="h-[260px] p-2">
            {puntos.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">Sin tests con CTR y CPA.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis type="number" dataKey="ctr" name="CTR" {...ejes} unit=" %" />
                  <YAxis type="number" dataKey="cpaEje" name="CPA" {...ejes} width={44} domain={[0, topeCpa]} tickFormatter={(v: number) => (v >= topeCpa ? `$${v}+` : `$${v}`)} />
                  <ZAxis range={[36, 36]} />
                  <Tooltip
                    contentStyle={estiloTooltip}
                    cursor={{ strokeDasharray: "3 4" }}
                    content={({ active, payload }) => {
                      const p = active ? (payload?.[0]?.payload as { nombre: string; ctr: number; cpa: number } | undefined) : undefined;
                      return p ? (
                        <div style={estiloTooltip} className="px-2.5 py-1.5">
                          <p className="m-0 font-medium">{p.nombre}</p>
                          <p className="m-0 text-muted-foreground">
                            CTR {porcentaje(p.ctr)} · CPA {usd(p.cpa)}
                          </p>
                        </div>
                      ) : null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={CPA_OBJETIVO} stroke={NEON.rosa} strokeDasharray="4 4" label={{ value: `Criterio ${usd(CPA_OBJETIVO, 0)}`, position: "insideTopRight", fontSize: 11, fill: NEON.rosa }} />
                  <Scatter name="Fallidos y consulta" data={enEje.filter((p) => p.resultado !== "ganador")} fill={NEON.rosa} fillOpacity={0.35} />
                  <Scatter name="Winners" data={enEje.filter((p) => p.resultado === "ganador")} fill={NEON.indigo} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Tarjeta id="t-comparadas" titulo="Winners frente a fallidos" extra={<span className="text-xs text-muted-foreground">promedio de cada métrica</span>}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={claseTh}>Métrica</th>
                  <th className={`${claseTh} text-right`}>Winners</th>
                  <th className={`${claseTh} text-right`}>Fallidos</th>
                </tr>
              </thead>
              <tbody>
                {comparadas.map((m) => {
                  const mejorWinner = m.ganadores !== null && m.fallidos !== null && (m.mejor === "mas" ? m.ganadores > m.fallidos : m.ganadores < m.fallidos);
                  return (
                    <tr key={m.id}>
                      <td className={`${claseTd} font-medium`}>{m.nombre}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>
                        <span className="inline-flex items-center gap-1.5">
                          {mejorWinner && <Punto tono="exito" />}
                          {formatear(m, m.ganadores)}
                        </span>
                      </td>
                      <td className={`${claseTd} text-right text-muted-foreground tabular-nums`}>{formatear(m, m.fallidos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <section aria-labelledby="t-ranking" className="min-w-0 rounded-[10px] border border-border bg-card">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-t-[10px] border-b border-border bg-muted px-3.5 py-1.5">
            <h2 id="t-ranking" className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              Comparar por
            </h2>
            <Segmentado etiqueta="Comparar por" valor={dimension} alCambiar={setDimension} opciones={DIMENSIONES.map((d) => ({ valor: d.valor, etiqueta: d.etiqueta }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse">
              <thead>
                <tr>
                  <th className={claseTh}>{dimActual.etiqueta}</th>
                  <th className={`${claseTh} text-right`}>Testeados</th>
                  <th className={`${claseTh} text-right`}>Winners</th>
                  <th className={`${claseTh} text-right`}>Gasto</th>
                  <th className={`${claseTh} text-right`}>CPA</th>
                  <th className={`${claseTh} text-right`}>Por winner</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => {
                  const filtro = dimActual.filtro;
                  const activo = filtro ? f[filtro] === r.clave : f.desde === r.clave && f.hasta === finDe(r.clave, "semana");
                  const pulsar = () => (filtro ? poner(filtro, r.clave as never) : setF((x) => (activo ? { ...x, desde: "", hasta: "" } : { ...x, desde: r.clave, hasta: finDe(r.clave, "semana") })));
                  const nombre = dimension === "testNumero" ? etiquetaClaveTestNumero(r.clave) : dimension === "semana" ? etiquetaPeriodo(r.clave, "semana", false) : r.clave;
                  return (
                    <tr
                      key={r.clave}
                      tabIndex={0}
                      aria-current={activo ? "true" : undefined}
                      onClick={pulsar}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pulsar();
                        }
                      }}
                      className={`cursor-pointer hover:bg-muted aria-[current=true]:bg-primario-suave aria-[current=true]:shadow-[inset_3px_0_0_var(--primario)] ${anilloFoco}`}
                    >
                      <td className={`${claseTd} font-medium`}>{nombre}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{r.testeados}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>
                        {r.ganadores} <span className="text-muted-foreground">· {Math.round(r.tasa)} %</span>
                      </td>
                      <td className={`${claseTd} text-right tabular-nums`}>{usd(r.gasto, 0)}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>
                        <span className="inline-flex items-center gap-1.5">
                          {r.cpa !== null && <Punto tono={r.cpa < CPA_OBJETIVO ? "exito" : "aviso"} />}
                          {r.cpa === null ? "—" : usd(r.cpa)}
                        </span>
                      </td>
                      <td className={`${claseTd} text-right tabular-nums`}>{r.costoPorGanador === null ? "—" : usd(r.costoPorGanador, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="t-mejores" titulo="Mejores winners" extra={<span className="text-xs text-muted-foreground">por CPA</span>}>
          <ListaTests filas={mejores} vacio="Sin winners con estos filtros." tono="exito" />
        </Tarjeta>
        <Tarjeta id="t-revisar" titulo="Para revisar" extra={<span className="text-xs text-muted-foreground">cerca del criterio o en consulta</span>}>
          <ListaTests filas={revisar} vacio="Nada que revisar con estos filtros." tono="aviso" />
        </Tarjeta>
      </div>

      <p className="text-xs text-muted-foreground">
        Test productos {codigoPais}. Un winner es un test con CPA menor a {usd(CPA_OBJETIVO)}; el CPA global es el gasto total entre las compras totales. Los periodos usan la fecha
        del test.
      </p>
    </div>
  );
}

function ListaTests({ filas, vacio, tono }: { filas: FilaProductoTest[]; vacio: string; tono: "exito" | "aviso" }) {
  if (filas.length === 0) return <p className="m-0 p-3.5 text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
      {filas.map((p) => (
        <li key={p.id} className="flex items-center gap-2 border-b border-border px-3.5 py-2 last:border-b-0">
          <Punto tono={tono} />
          <Link href={`/productos-test/productos?buscar=${encodeURIComponent(p.nombre)}`} className={`min-w-0 flex-1 truncate hover:underline ${anilloFoco}`}>
            {p.nombre}
          </Link>
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            CPA {p.metricaCpa === null ? "—" : usd(p.metricaCpa)} · {p.metricaCompras ?? 0} compras
          </span>
        </li>
      ))}
    </ul>
  );
}
