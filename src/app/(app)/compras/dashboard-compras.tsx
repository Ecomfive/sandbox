"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BotonBarra, CabeceraTarjeta, Indicador, Punto, Segmentado, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { etiquetaEstado, etiquetaEtapa, etiquetaVia, ETAPAS_COMPRA, type FilaCompra } from "./def-compras";
import {
  abiertasPorEtapa,
  aTiempo,
  diasEntre,
  entero,
  enTransito,
  estaAbierta,
  estaAtrasada,
  histogramaTransito,
  hoy,
  paraRevisar,
  porDimension,
  resumenDias,
  serieMensual,
  tiempoEnEstados,
  tiemposPorTramo,
  transitoMensual,
  transitos,
  umbralesTransito,
  usd,
} from "./calculos-compras";
import { SelectorVista } from "./selector-vista";

type Evento = { compraId: string; campo: string; valor: string | null; ocurridoEn: string };
type Dimension = "proveedor" | "tienda" | "pais" | "responsable" | "via";

interface Filtros {
  desde: string;
  hasta: string;
  pais: string;
  proveedor: string;
  via: string;
  tienda: string;
  responsable: string;
  etapa: string;
  abiertas: boolean;
}
const SIN_FILTROS: Filtros = { desde: "", hasta: "", pais: "", proveedor: "", via: "", tienda: "", responsable: "", etapa: "", abiertas: false };

const NOMBRE_FILTRO: Record<keyof Filtros, string> = {
  desde: "Desde",
  hasta: "Hasta",
  pais: "País",
  proveedor: "Proveedor",
  via: "Vía",
  tienda: "Tienda",
  responsable: "Responsable",
  etapa: "Etapa",
  abiertas: "Solo abiertas",
};
const DIMENSIONES: { valor: Dimension; etiqueta: string; filtro: keyof Filtros }[] = [
  { valor: "proveedor", etiqueta: "Proveedor", filtro: "proveedor" },
  { valor: "tienda", etiqueta: "Tienda", filtro: "tienda" },
  { valor: "pais", etiqueta: "País", filtro: "pais" },
  { valor: "responsable", etiqueta: "Responsable", filtro: "responsable" },
  { valor: "via", etiqueta: "Vía", filtro: "via" },
];
const CLAVE: Record<Dimension, (c: FilaCompra) => string[]> = {
  proveedor: (c) => [c.proveedor ?? "Sin proveedor"],
  tienda: (c) => (c.tiendas.length ? c.tiendas : ["Sin tienda"]),
  pais: (c) => [c.paisCodigo ?? "Importadora"],
  responsable: (c) => [c.asignadoNombre ?? "Sin responsable"],
  via: (c) => (c.viaEnvio.length ? c.viaEnvio : ["sin"]),
};

const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "0 8px 24px -12px rgb(95 67 209 / 0.45)" };
/** Los colores de las gráficas, tomados del neón del riel y de los botones principales (`--neon`). */
const NEON = { rosa: "#d74c81", magenta: "#b12a97", violeta: "#8a35c9", indigo: "#5f43d1" } as const;
/** Degradados verticales de las barras de las gráficas (de arriba abajo), definidos en cada gráfica que los usa. */
function DegradadosNeon() {
  return (
    <defs>
      <linearGradient id="neon-violeta" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.magenta} />
        <stop offset="100%" stopColor={NEON.indigo} />
      </linearGradient>
      <linearGradient id="neon-suave" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.violeta} stopOpacity={0.35} />
        <stop offset="100%" stopColor={NEON.violeta} stopOpacity={0.12} />
      </linearGradient>
      <linearGradient id="neon-indigo" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7b62e6" />
        <stop offset="100%" stopColor={NEON.indigo} />
      </linearGradient>
      <linearGradient id="neon-rosa" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e86a9a" />
        <stop offset="100%" stopColor={NEON.rosa} />
      </linearGradient>
    </defs>
  );
}
const claseSelect = `h-[34px] max-w-[11rem] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`;
const dias = (n: number | null) => (n === null ? "—" : `${n} d`);

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

/** Una barra horizontal que se puede pulsar para filtrar (etapas, tramos, estados). */
function BarraH({ nombre, valor, maximo, texto, activo, alPulsar }: { nombre: string; valor: number; maximo: number; texto: string; activo?: boolean; alPulsar?: () => void }) {
  const contenido = (
    <>
      <span className="flex justify-between gap-2 text-[13px]">
        <span className="truncate">{nombre}</span>
        <b className="font-medium whitespace-nowrap tabular-nums">{texto}</b>
      </span>
      <span className="mt-1 block h-1.5 rounded-full bg-muted">
        <span
          data-activa={activo || undefined}
          className={`barra-neon block h-1.5 rounded-full transition-opacity ${activo ? "" : "opacity-70"}`}
          style={{ width: `${maximo ? Math.max(2, (valor / maximo) * 100) : 0}%` }}
        />
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

/**
 * Dashboard de Compras: toda la operación a la vez, con unos mismos filtros (país, fechas de creación, proveedor, vía,
 * tienda, responsable, etapa) que se pueden poner también pulsando una barra o una fila. Indicadores, compras y pagos por
 * mes, embudo de etapas, tránsito por vía mes a mes y su distribución, tiempo por tramo y en cada estado, comparación por
 * proveedor/tienda/país/responsable/vía y lo que está fallando.
 */
export function DashboardCompras({
  compras,
  eventos,
  vista,
  paises,
}: {
  compras: FilaCompra[];
  eventos: Evento[];
  vista: string;
  paises: { codigo: string; nombre: string }[];
}) {
  const [f, setF] = useState<Filtros>(SIN_FILTROS);
  const [dimension, setDimension] = useState<Dimension>("proveedor");
  const poner = (campo: keyof Filtros, valor: string | boolean) => setF((x) => ({ ...x, [campo]: x[campo] === valor ? SIN_FILTROS[campo] : valor }));
  const dia = hoy();

  const opciones = useMemo(() => {
    const unicos = (fn: (c: FilaCompra) => string | null | string[]) => [...new Set(compras.flatMap((c) => fn(c) ?? []).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      pais: unicos((c) => c.paisCodigo),
      proveedor: unicos((c) => c.proveedor),
      tienda: unicos((c) => c.tiendas),
      responsable: unicos((c) => c.asignadoNombre),
    };
  }, [compras]);

  const filtradas = useMemo(
    () =>
      compras.filter(
        (c) =>
          (!f.desde || c.creadoEn.slice(0, 10) >= f.desde) &&
          (!f.hasta || c.creadoEn.slice(0, 10) <= f.hasta) &&
          (!f.pais || (c.paisCodigo ?? "Importadora") === f.pais) &&
          (!f.proveedor || (c.proveedor ?? "Sin proveedor") === f.proveedor) &&
          (!f.via || (f.via === "sin" ? c.viaEnvio.length === 0 : c.viaEnvio.includes(f.via))) &&
          (!f.tienda || (c.tiendas.length ? c.tiendas : ["Sin tienda"]).includes(f.tienda)) &&
          (!f.responsable || (c.asignadoNombre ?? "Sin responsable") === f.responsable) &&
          (!f.etapa || c.etapa === f.etapa) &&
          (!f.abiertas || estaAbierta(c)),
      ),
    [compras, f],
  );

  // Lo «normal» de cada vía se mide con todas las compras de la vista, no solo con las filtradas.
  const umbral = useMemo(() => umbralesTransito(compras), [compras]);
  const ids = useMemo(() => new Set(filtradas.map((c) => c.id)), [filtradas]);
  const ev = useMemo(() => eventos.filter((e) => ids.has(e.compraId)), [eventos, ids]);

  const k = useMemo(() => {
    const abiertas = filtradas.filter(estaAbierta);
    const pagado = filtradas.reduce((s, c) => s + (c.pagadoAProveedor ?? 0), 0);
    const unidadesPagadas = filtradas.filter((c) => c.pagadoAProveedor && c.qtyTotal).reduce((s, c) => s + (c.qtyTotal ?? 0), 0);
    const pagadoConUnidades = filtradas.filter((c) => c.pagadoAProveedor && c.qtyTotal).reduce((s, c) => s + (c.pagadoAProveedor ?? 0), 0);
    const completadas = filtradas.filter((c) => c.etapa === "completado");
    const llegadas = aTiempo(filtradas, umbral);
    return {
      compras: filtradas.length,
      abiertas: abiertas.length,
      transito: abiertas.filter(enTransito).length,
      atrasadas: abiertas.filter((c) => estaAtrasada(c, umbral, dia)).length,
      pagado,
      unidades: filtradas.reduce((s, c) => s + (c.qtyTotal ?? 0), 0),
      costoUnidad: unidadesPagadas ? pagadoConUnidades / unidadesPagadas : null,
      ciclo: resumenDias(completadas.map((c) => diasEntre(c.creadoEn, c.cerradoEn)).filter((d): d is number => d !== null)).mediana,
      transitoMar: resumenDias(transitos(filtradas, "mar")).mediana,
      transitoAire: resumenDias(transitos(filtradas, "aire")).mediana,
      aTiempo: llegadas.llegadas ? (llegadas.aTiempo / llegadas.llegadas) * 100 : null,
      llegadas: llegadas.llegadas,
      descartadas: filtradas.filter((c) => c.etapa === "descartado").length,
      inconvenientes: filtradas.filter((c) => !!c.inconveniente).length,
    };
  }, [filtradas, umbral, dia]);

  const serie = useMemo(() => {
    const s = serieMensual(filtradas);
    return f.desde || f.hasta ? s : s.slice(-24);
  }, [filtradas, f.desde, f.hasta]);
  const transitoMes = useMemo(() => transitoMensual(filtradas).slice(-18), [filtradas]);
  const histograma = useMemo(() => histogramaTransito(filtradas), [filtradas]);
  const etapas = useMemo(() => abiertasPorEtapa(filtradas), [filtradas]);
  const tramos = useMemo(() => tiemposPorTramo(filtradas), [filtradas]);
  const enEstados = useMemo(
    () => [
      ...tiempoEnEstados(ev, filtradas, "etapa").map((e) => ({ ...e, nombre: `👣 ${etiquetaEtapa(e.valor)}` })),
      ...tiempoEnEstados(ev, filtradas, "estado").map((e) => ({ ...e, nombre: etiquetaEstado(e.valor) })),
    ]
      .filter((e) => e.n >= 3)
      .sort((a, b) => (b.mediana ?? 0) - (a.mediana ?? 0))
      .slice(0, 10),
    [ev, filtradas],
  );
  const ranking = useMemo(() => porDimension(filtradas, CLAVE[dimension]).slice(0, 12), [filtradas, dimension]);
  const revisar = useMemo(() => paraRevisar(filtradas, umbral, dia), [filtradas, umbral, dia]);
  const dimActual = DIMENSIONES.find((d) => d.valor === dimension)!;
  const activos = (Object.keys(f) as (keyof Filtros)[]).filter((x) => f[x] !== SIN_FILTROS[x]);
  const maxEtapa = Math.max(0, ...etapas.map((e) => e.cantidad));
  const maxTramo = Math.max(0, ...tramos.map((t) => t.mediana ?? 0));
  const maxEstado = Math.max(0, ...enEstados.map((e) => e.mediana ?? 0));

  function elegirMes(mes: string) {
    const [a, m] = mes.split("-").map(Number);
    const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    setF((x) => (x.desde === `${mes}-01` && x.hasta === fin ? { ...x, desde: "", hasta: "" } : { ...x, desde: `${mes}-01`, hasta: fin }));
  }

  return (
    <div className="graficas-neon flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorVista vista={vista} paises={paises} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Desde
          <input type="date" value={f.desde} onChange={(e) => setF((x) => ({ ...x, desde: e.target.value }))} className={claseSelect} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Hasta
          <input type="date" value={f.hasta} onChange={(e) => setF((x) => ({ ...x, hasta: e.target.value }))} className={claseSelect} />
        </label>
        {vista === "todos" && opciones.pais.length > 1 && (
          <select aria-label="País" value={f.pais} onChange={(e) => setF((x) => ({ ...x, pais: e.target.value }))} className={claseSelect}>
            <option value="">Todos los países</option>
            {opciones.pais.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        )}
        <select aria-label="Proveedor" value={f.proveedor} onChange={(e) => setF((x) => ({ ...x, proveedor: e.target.value }))} className={claseSelect}>
          <option value="">Todos los proveedores</option>
          {opciones.proveedor.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Vía de envío" value={f.via} onChange={(e) => setF((x) => ({ ...x, via: e.target.value }))} className={claseSelect}>
          <option value="">Todas las vías</option>
          <option value="mar">{etiquetaVia("mar")}</option>
          <option value="aire">{etiquetaVia("aire")}</option>
          <option value="tierra">{etiquetaVia("tierra")}</option>
          <option value="sin">Sin vía</option>
        </select>
        <select aria-label="Tienda" value={f.tienda} onChange={(e) => setF((x) => ({ ...x, tienda: e.target.value }))} className={claseSelect}>
          <option value="">Todas las tiendas</option>
          {opciones.tienda.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Responsable" value={f.responsable} onChange={(e) => setF((x) => ({ ...x, responsable: e.target.value }))} className={claseSelect}>
          <option value="">Todos los responsables</option>
          {opciones.responsable.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <BotonBarra activo={f.abiertas} onClick={() => poner("abiertas", true)}>
          Solo abiertas
        </BotonBarra>
      </div>

      {activos.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Filtrando:</span>
          {activos.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setF((v) => ({ ...v, [x]: SIN_FILTROS[x] }))}
              aria-label={`Quitar el filtro ${NOMBRE_FILTRO[x]}`}
              className={`rounded-full border border-primario/40 bg-primario-suave px-2 py-0.5 text-primario hover:border-primario ${anilloFoco}`}
            >
              {NOMBRE_FILTRO[x]}
              {typeof f[x] === "string" ? `: ${x === "etapa" ? etiquetaEtapa(f.etapa) : x === "via" ? (f.via === "sin" ? "Sin vía" : etiquetaVia(f.via)) : f[x]}` : ""} ×
            </button>
          ))}
          <button type="button" onClick={() => setF(SIN_FILTROS)} className={`rounded px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
            Quitar todos
          </button>
        </div>
      )}

      <section aria-label="Indicadores" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap">
          <Indicador titulo="Compras" valor={entero(k.compras)} detalle={`${entero(k.abiertas)} abiertas · ${entero(k.transito)} en tránsito`} />
          <Indicador titulo="Pagado a proveedores" valor={usd(k.pagado, true)} detalle={k.costoUnidad !== null ? `${usd(k.costoUnidad)} por unidad` : "—"} />
          <Indicador titulo="Unidades" valor={entero(k.unidades)} detalle="en las compras filtradas" />
          <Indicador titulo="Ciclo completo" valor={dias(k.ciclo)} detalle="mediana, de crear a completar" />
          <Indicador titulo="Tránsito" valor={`${dias(k.transitoMar)} / ${dias(k.transitoAire)}`} detalle="marítimo / aéreo (mediana)" />
          <Indicador
            titulo="A tiempo"
            punto={k.aTiempo === null ? undefined : k.aTiempo >= 85 ? "exito" : "aviso"}
            valor={k.aTiempo === null ? "—" : `${Math.round(k.aTiempo)} %`}
            detalle={`de ${entero(k.llegadas)} llegadas`}
          />
          <Indicador titulo="Atrasadas" punto={k.atrasadas ? "peligro" : undefined} valor={entero(k.atrasadas)} detalle="más de lo normal en tránsito" href={`/compras/lista?${vista === "todos" ? "" : `ver=${vista}&`}grupo=atrasadas`} />
          <Indicador titulo="Fallas" punto={k.inconvenientes + k.descartadas ? "aviso" : undefined} valor={entero(k.inconvenientes + k.descartadas)} detalle={`${k.inconvenientes} inconvenientes · ${k.descartadas} descartadas`} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Tarjeta id="d-meses" titulo="Compras y pagos por mes" extra={<span className="text-xs text-muted-foreground">pulsa un mes para filtrar</span>}>
          <div className="h-[280px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} onClick={(e) => e?.activeLabel && serie.find((s) => s.etiqueta === e.activeLabel) && elegirMes(serie.find((s) => s.etiqueta === e.activeLabel)!.mes)}>
                <DegradadosNeon />
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="etiqueta" {...ejes} interval="preserveStartEnd" />
                <YAxis yAxisId="n" {...ejes} allowDecimals={false} width={36} />
                <YAxis yAxisId="usd" orientation="right" {...ejes} width={52} tickFormatter={(v: number) => usd(v, true)} />
                <Tooltip contentStyle={estiloTooltip} formatter={(v, nombre) => (nombre === "Pagado" ? usd(Number(v)) : v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="n" dataKey="creadas" name="Creadas" fill="url(#neon-suave)" radius={[4, 4, 0, 0]} cursor="pointer" />
                <Bar yAxisId="n" dataKey="completadas" name="Completadas" fill="url(#neon-violeta)" radius={[4, 4, 0, 0]} cursor="pointer" />
                <Line yAxisId="usd" type="monotone" dataKey="pagado" name="Pagado" stroke={NEON.rosa} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>

        <Tarjeta id="d-etapas" titulo="Abiertas por etapa" extra={<span className="text-xs text-muted-foreground tabular-nums">{k.abiertas}</span>}>
          <div className="flex flex-col p-2">
            {etapas.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No hay compras abiertas con estos filtros.</p>
            ) : (
              etapas.map((e) => (
                <BarraH key={e.etapa} nombre={etiquetaEtapa(e.etapa)} valor={e.cantidad} maximo={maxEtapa} texto={String(e.cantidad)} activo={f.etapa === e.etapa} alPulsar={() => poner("etapa", e.etapa)} />
              ))
            )}
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="d-transito-mes" titulo="Días de tránsito por mes de llegada" extra={<span className="text-xs text-muted-foreground">mediana por vía</span>}>
          <div className="h-[240px] p-2">
            {transitoMes.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">Sin llegadas con estos filtros.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={transitoMes} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="etiqueta" {...ejes} interval="preserveStartEnd" />
                  <YAxis {...ejes} width={36} />
                  <Tooltip contentStyle={estiloTooltip} formatter={(v) => (v === null ? "—" : `${v} días`)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="mar" name={etiquetaVia("mar")} stroke={NEON.indigo} strokeWidth={2.5} dot={{ r: 2.5, fill: NEON.indigo }} connectNulls />
                  <Line type="monotone" dataKey="aire" name={etiquetaVia("aire")} stroke={NEON.rosa} strokeWidth={2.5} dot={{ r: 2.5, fill: NEON.rosa }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Tarjeta>

        <Tarjeta id="d-histograma" titulo="Cuánto tardan los envíos" extra={<span className="text-xs text-muted-foreground">envíos por rango de días</span>}>
          <div className="h-[240px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histograma} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <DegradadosNeon />
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="rango" {...ejes} interval={0} angle={-30} textAnchor="end" height={42} />
                <YAxis {...ejes} allowDecimals={false} width={32} />
                <Tooltip contentStyle={estiloTooltip} labelFormatter={(l) => `${l} días`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="mar" name={etiquetaVia("mar")} stackId="v" fill="url(#neon-indigo)" />
                <Bar dataKey="aire" name={etiquetaVia("aire")} stackId="v" fill="url(#neon-rosa)" />
                <Bar dataKey="otra" name="Otra" stackId="v" fill="url(#neon-suave)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="d-tramos" titulo="Tiempo por tramo" extra={<span className="text-xs text-muted-foreground">mediana · 9 de cada 10</span>}>
          <div className="flex flex-col p-2">
            {tramos.map((t) => (
              <BarraH key={t.id} nombre={`${t.nombre} (${t.n})`} valor={t.mediana ?? 0} maximo={maxTramo} texto={t.mediana === null ? "—" : `${t.mediana} d · ${t.p90} d`} />
            ))}
          </div>
        </Tarjeta>

        <Tarjeta id="d-estados" titulo="Dónde se quedan más tiempo" extra={<span className="text-xs text-muted-foreground">estados y etapas, mediana</span>}>
          <div className="flex flex-col p-2">
            {enEstados.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">Sin historial suficiente con estos filtros.</p>
            ) : (
              enEstados.map((e) => <BarraH key={e.nombre} nombre={`${e.nombre} (${e.n})`} valor={e.mediana ?? 0} maximo={maxEstado} texto={`${e.mediana} d · ${e.p90} d`} />)
            )}
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="d-ranking" className="min-w-0 rounded-[10px] border border-border bg-card">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-t-[10px] border-b border-border bg-muted px-3.5 py-1.5">
            <h2 id="d-ranking" className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              Comparar por
            </h2>
            <Segmentado etiqueta="Comparar por" valor={dimension} alCambiar={setDimension} opciones={DIMENSIONES.map((d) => ({ valor: d.valor, etiqueta: d.etiqueta }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr>
                  <th className={claseTh}>{dimActual.etiqueta}</th>
                  <th className={`${claseTh} text-right`}>Compras</th>
                  <th className={`${claseTh} text-right`}>Pagado</th>
                  <th className={`${claseTh} text-right`}>Ciclo</th>
                  <th className={`${claseTh} text-right`}>Tránsito</th>
                  <th className={`${claseTh} text-right`}>Fallas</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => {
                  const valorFiltro = dimension === "via" ? r.nombre : r.nombre;
                  const activo = f[dimActual.filtro] === valorFiltro;
                  return (
                    <tr
                      key={r.nombre}
                      tabIndex={0}
                      aria-current={activo ? "true" : undefined}
                      onClick={() => poner(dimActual.filtro, valorFiltro)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          poner(dimActual.filtro, valorFiltro);
                        }
                      }}
                      className={`cursor-pointer hover:bg-muted aria-[current=true]:bg-primario-suave aria-[current=true]:shadow-[inset_3px_0_0_var(--primario)] ${anilloFoco}`}
                    >
                      <td className={`${claseTd} font-medium`}>{dimension === "via" ? (r.nombre === "sin" ? "Sin vía" : etiquetaVia(r.nombre)) : r.nombre}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{r.compras}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{usd(r.pagado, true)}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{dias(r.ciclo)}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{dias(r.transito)}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{r.inconvenientes + r.descartadas || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <Tarjeta id="d-fallas" titulo="Lo que está fallando" extra={<Link href={`/compras/tiempos${vista === "todos" ? "" : `?ver=${vista}`}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Tiempos y fallas</Link>}>
          <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
            {revisar.atrasadas.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-b border-border px-3.5 py-2">
                <Punto tono="peligro" />
                <span className="min-w-0 flex-1 truncate">
                  {c.codigo ? `${c.codigo} · ` : ""}
                  {c.nombre}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{diasEntre(c.fechaEnvio, dia)} d en tránsito</span>
              </li>
            ))}
            <li className="flex items-center gap-2 border-b border-border px-3.5 py-2">
              <Punto tono={revisar.cotizacionLarga.length ? "aviso" : "gris"} />
              <span className="flex-1">{revisar.cotizacionLarga.length} esperando cotización hace más de 3 semanas</span>
            </li>
            <li className="flex items-center gap-2 border-b border-border px-3.5 py-2">
              <Punto tono={k.inconvenientes ? "aviso" : "gris"} />
              <span className="flex-1">{k.inconvenientes} con inconveniente</span>
            </li>
            <li className="flex items-center gap-2 px-3.5 py-2">
              <Punto tono="gris" />
              <span className="flex-1">
                {k.descartadas} descartadas ({k.compras ? Math.round((k.descartadas / k.compras) * 100) : 0} %)
              </span>
            </li>
          </ul>
        </Tarjeta>
      </div>

      <p className="text-xs text-muted-foreground">
        Las etapas son {ETAPAS_COMPRA.length - 2} del flujo más Backlog y Descartado. «A tiempo» y «atrasada» comparan con lo que tarda el 90 % de los envíos de cada vía
        ({Object.entries(umbral)
          .map(([v, n]) => `${etiquetaVia(v)} ${n} d`)
          .join(" · ")}).
      </p>
    </div>
  );
}
