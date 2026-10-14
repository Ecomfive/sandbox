"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BotonBarra, CabeceraTarjeta, Segmentado, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { precioEquivalente } from "@/lib/competencia/analisis";
import type { DatosCompetencia, ProductoC } from "./def-competencia";
import { filasNuestras } from "./vista-competencia";

const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "0 8px 24px -12px rgb(95 67 209 / 0.45)" };
/** Los colores neón de los dashboards de Compras y Test productos. */
const NEON = { rosa: "#d74c81", magenta: "#b12a97", violeta: "#8a35c9", indigo: "#5f43d1" } as const;
function DegradadosNeon() {
  return (
    <defs>
      <linearGradient id="c-neon-violeta" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.magenta} />
        <stop offset="100%" stopColor={NEON.indigo} />
      </linearGradient>
      <linearGradient id="c-neon-suave" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.violeta} stopOpacity={0.35} />
        <stop offset="100%" stopColor={NEON.violeta} stopOpacity={0.12} />
      </linearGradient>
    </defs>
  );
}
const claseSelect = `h-[34px] max-w-[14rem] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`;
const num = (n: number) => n.toLocaleString("es-PA");
const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const categoriaDe = (p: ProductoC) => (p.categoria ?? "Sin categoría").split(", ")[0];
const dia = (iso: string) => iso.slice(0, 10);
const etiquetaDia = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short" });

type Periodo = "1" | "7" | "30";
const NOMBRE_PERIODO: Record<Periodo, string> = { "1": "último día", "7": "7 días", "30": "30 días" };

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

/** Una barra horizontal que se puede pulsar para filtrar (como en los dashboards de Compras y Test productos). */
function BarraH({ nombre, valor, maximo, texto, activo, alPulsar, tono = "neon" }: { nombre: ReactNode; valor: number; maximo: number; texto: string; activo?: boolean; alPulsar?: () => void; tono?: "neon" | "rojo" | "verde" }) {
  const relleno = tono === "neon" ? "barra-neon" : tono === "rojo" ? "bg-destructive" : "bg-success";
  const contenido = (
    <>
      <span className="flex justify-between gap-2 text-[13px]">
        <span className="truncate">{nombre}</span>
        <b className="font-medium whitespace-nowrap tabular-nums">{texto}</b>
      </span>
      <span className="mt-1 block h-1.5 rounded-full bg-muted">
        <span className={`${relleno} block h-1.5 rounded-full transition-opacity ${activo ? "" : "opacity-70"}`} style={{ width: `${maximo ? Math.max(2, (valor / maximo) * 100) : 0}%` }} />
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

function Miniatura({ url }: { url: string | null }) {
  if (!url) return <span className="block h-8 w-8 shrink-0 rounded-md border border-dashed border-border-control" aria-hidden="true" />;
  return (
    <TarjetaEmergente
      clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
      contenido={
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-72 max-w-72 rounded-md object-contain" />
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
    </TarjetaEmergente>
  );
}

/**
 * Dashboard de Análisis de competencia: el catálogo de Dropi del país frente a ECOMFIVE, con filtros que se cruzan
 * (competidor, categoría, solo los iguales a los nuestros y el periodo) que también se ponen pulsando una barra. Stock vendido
 * por día, competidores y categorías que más venden, nuestro precio frente al más bajo, los productos que más venden y las
 * alertas por tipo. Mismos colores que los dashboards de Compras y Test productos.
 */
export function DashboardCompetencia({ datos }: { datos: DatosCompetencia }) {
  const [competidor, setCompetidor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soloIguales, setSoloIguales] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("7");

  const competencia = useMemo(() => datos.productos.filter((p) => !p.esNuestro && p.estado === "activo"), [datos.productos]);
  const categorias = useMemo(() => [...new Set(competencia.map(categoriaDe))].sort((a, b) => a.localeCompare(b)), [competencia]);
  const filtrados = useMemo(
    () => competencia.filter((p) => (!competidor || p.proveedor === competidor) && (!categoria || categoriaDe(p) === categoria) && (!soloIguales || p.igualA)),
    [competencia, competidor, categoria, soloIguales],
  );
  const ids = useMemo(() => new Set(filtrados.map((p) => p.id)), [filtrados]);
  const limite = useMemo(() => new Date(Date.now() - Number(periodo) * 86_400_000).toISOString(), [periodo]);

  // Lo vendido (bajadas de stock) por producto en el periodo, y por día en los últimos 30 días.
  const vendidoPeriodo = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of datos.ventas) if (ids.has(v.productoId) && v.fecha > limite) m.set(v.productoId, (m.get(v.productoId) ?? 0) + v.unidades);
    return m;
  }, [datos.ventas, ids, limite]);
  const serie = useMemo(() => {
    const porDia = new Map<string, { iguales: number; resto: number; productos: Set<string> }>();
    const iguales = new Set(filtrados.filter((p) => p.igualA).map((p) => p.id));
    for (const v of datos.ventas) {
      if (!ids.has(v.productoId)) continue;
      const d = dia(v.fecha);
      const x = porDia.get(d) ?? { iguales: 0, resto: 0, productos: new Set<string>() };
      if (iguales.has(v.productoId)) x.iguales += v.unidades;
      else x.resto += v.unidades;
      x.productos.add(v.productoId);
      porDia.set(d, x);
    }
    return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, x]) => ({ dia: d, etiqueta: etiquetaDia(d), iguales: x.iguales, resto: x.resto, productos: x.productos.size }));
  }, [datos.ventas, ids, filtrados]);

  const totalVendido = [...vendidoPeriodo.values()].reduce((t, n) => t + n, 0);
  const porCompetidor = useMemo(() => {
    const m = new Map<string, { vendido: number; productos: number; iguales: number }>();
    for (const p of filtrados) {
      const x = m.get(p.proveedor) ?? { vendido: 0, productos: 0, iguales: 0 };
      x.vendido += vendidoPeriodo.get(p.id) ?? 0;
      x.productos++;
      if (p.igualA) x.iguales++;
      m.set(p.proveedor, x);
    }
    return [...m.entries()].map(([nombre, x]) => ({ nombre, ...x })).sort((a, b) => b.vendido - a.vendido || b.productos - a.productos);
  }, [filtrados, vendidoPeriodo]);
  const porCategoria = useMemo(() => {
    const m = new Map<string, { vendido: number; productos: number }>();
    for (const p of filtrados) {
      const c = categoriaDe(p);
      const x = m.get(c) ?? { vendido: 0, productos: 0 };
      x.vendido += vendidoPeriodo.get(p.id) ?? 0;
      x.productos++;
      m.set(c, x);
    }
    return [...m.entries()].map(([nombre, x]) => ({ nombre, ...x })).sort((a, b) => b.vendido - a.vendido || b.productos - a.productos);
  }, [filtrados, vendidoPeriodo]);
  const masVendidos = useMemo(
    () =>
      filtrados
        .map((p) => ({ p, vendido: vendidoPeriodo.get(p.id) ?? 0 }))
        .filter((x) => x.vendido > 0)
        .sort((a, b) => b.vendido - a.vendido)
        .slice(0, 10),
    [filtrados, vendidoPeriodo],
  );
  const nuestros = useMemo(
    () =>
      filasNuestras(datos.productos)
        .map((f) => ({ ...f, iguales: f.iguales.filter((i) => ids.has(i.id)) }))
        .filter((f) => f.iguales.length)
        .map((f) => {
          const precios = f.iguales.map((i) => precioEquivalente(f.nuestro.nombre, i).precio).filter((x): x is number => x !== null);
          const minimo = precios.length ? Math.min(...precios) : null;
          return { ...f, minimo, diferencia: minimo !== null && f.nuestro.precio !== null ? Math.round((minimo - f.nuestro.precio) * 100) / 100 : null };
        })
        .sort((a, b) => (a.diferencia ?? 0) - (b.diferencia ?? 0)),
    [datos.productos, ids],
  );
  const alertas30 = useMemo(() => {
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const m = new Map<string, number>();
    for (const a of datos.alertas) if (a.fecha > desde) m.set(a.tipo, (m.get(a.tipo) ?? 0) + 1);
    return m;
  }, [datos.alertas]);

  const maxCompetidor = Math.max(0, ...porCompetidor.map((c) => c.vendido || c.productos));
  const maxCategoria = Math.max(0, ...porCategoria.map((c) => c.vendido || c.productos));
  const maxDiferencia = Math.max(0, ...nuestros.map((n) => Math.abs(n.diferencia ?? 0)));
  const activos = [competidor && `Competidor: ${competidor}`, categoria && `Categoría: ${categoria}`, soloIguales && "Solo iguales a los nuestros"].filter(Boolean) as string[];
  const hayVentas = datos.ventas.length > 0;

  return (
    <div className="graficas-neon flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Competidor" value={competidor} onChange={(e) => setCompetidor(e.target.value)} className={claseSelect}>
          <option value="">Todos los competidores</option>
          {[...new Set(competencia.map((p) => p.proveedor))]
            .sort((a, b) => a.localeCompare(b))
            .map((c) => (
              <option key={c}>{c}</option>
            ))}
        </select>
        <select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={claseSelect}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <BotonBarra activo={soloIguales} onClick={() => setSoloIguales(!soloIguales)}>
          Solo iguales a los nuestros
        </BotonBarra>
        <span className="ml-auto">
          <Segmentado
            etiqueta="Periodo de lo vendido"
            valor={periodo}
            alCambiar={setPeriodo}
            opciones={[
              { valor: "1", etiqueta: "Día" },
              { valor: "7", etiqueta: "Semana" },
              { valor: "30", etiqueta: "Mes" },
            ]}
          />
        </span>
      </div>

      {activos.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Filtrando:</span>
          {activos.map((t) => (
            <span key={t} className="rounded-full border border-primario/40 bg-primario-suave px-2 py-0.5 text-primario">
              {t}
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setCompetidor("");
              setCategoria("");
              setSoloIguales(false);
            }}
            className={`rounded px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}
          >
            Quitar todos
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Tarjeta id="c-ventas" titulo="Stock vendido por la competencia" extra={<span className="text-xs text-muted-foreground">unidades por día · {num(totalVendido)} en {NOMBRE_PERIODO[periodo]}</span>}>
          <div className="h-[280px] p-2">
            {!hayVentas || !serie.length ? (
              <p className="p-2 text-sm text-muted-foreground">
                {datos.busquedas > 1 ? "Sin bajadas de stock con estos filtros." : "Lo vendido se ve desde la segunda búsqueda: se cuenta lo que baja el stock entre una y otra."}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <DegradadosNeon />
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="etiqueta" {...ejes} interval="preserveStartEnd" />
                  <YAxis yAxisId="u" {...ejes} allowDecimals={false} width={40} />
                  <YAxis yAxisId="p" orientation="right" {...ejes} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={estiloTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="u" dataKey="iguales" name="Iguales a los nuestros" stackId="v" fill="url(#c-neon-violeta)" maxBarSize={48} />
                  <Bar yAxisId="u" dataKey="resto" name="Resto de la competencia" stackId="v" fill="url(#c-neon-suave)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  <Line yAxisId="p" type="monotone" dataKey="productos" name="Productos que vendieron" stroke={NEON.rosa} strokeWidth={2.5} dot={{ r: 2.5, fill: NEON.rosa }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Tarjeta>

        <Tarjeta id="c-alertas" titulo="Alertas de los últimos 30 días">
          <div className="flex flex-col p-2">
            {[
              ["mas_barato", "Más baratos que nosotros", "rojo"],
              ["bajo_precio", "Bajaron precio", "neon"],
              ["bajo_stock", "Bajaron stock", "neon"],
              ["desaparecio", "Desaparecieron", "neon"],
              ["competidor_nuevo", "Competidores nuevos", "neon"],
            ].map(([tipo, nombre, tono]) => (
              <BarraH
                key={tipo}
                nombre={nombre}
                valor={alertas30.get(tipo) ?? 0}
                maximo={Math.max(1, ...alertas30.values())}
                texto={num(alertas30.get(tipo) ?? 0)}
                tono={tono as "neon" | "rojo" | "verde"}
              />
            ))}
            <Link href="/analisis-competencia/alertas" className={`mt-1 self-start rounded px-1.5 py-1 text-xs text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
              Ver las alertas
            </Link>
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="c-competidores" titulo="Competidores que más venden" extra={<span className="text-xs text-muted-foreground">unidades en {NOMBRE_PERIODO[periodo]} · pulsa para filtrar</span>}>
          <div className="flex max-h-[360px] flex-col overflow-y-auto p-2">
            {porCompetidor.slice(0, 15).map((c) => (
              <BarraH
                key={c.nombre}
                nombre={c.nombre}
                valor={c.vendido || c.productos}
                maximo={maxCompetidor}
                texto={`${num(c.vendido)} vendidas · ${num(c.productos)} productos${c.iguales ? ` · ${c.iguales} iguales` : ""}`}
                activo={competidor === c.nombre}
                alPulsar={() => setCompetidor(competidor === c.nombre ? "" : c.nombre)}
              />
            ))}
          </div>
        </Tarjeta>

        <Tarjeta id="c-categorias" titulo="Categorías de la competencia" extra={<span className="text-xs text-muted-foreground">unidades en {NOMBRE_PERIODO[periodo]} · pulsa para filtrar</span>}>
          <div className="flex max-h-[360px] flex-col overflow-y-auto p-2">
            {porCategoria.slice(0, 15).map((c) => (
              <BarraH
                key={c.nombre}
                nombre={c.nombre}
                valor={c.vendido || c.productos}
                maximo={maxCategoria}
                texto={`${num(c.vendido)} vendidas · ${num(c.productos)} productos`}
                activo={categoria === c.nombre}
                alPulsar={() => setCategoria(categoria === c.nombre ? "" : c.nombre)}
              />
            ))}
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="c-precio" titulo="Nuestro precio frente al más bajo" extra={<span className="text-xs text-muted-foreground">rojo: la competencia vende más barato</span>}>
          <div className="flex max-h-[380px] flex-col overflow-y-auto p-2">
            {!nuestros.length && <p className="p-2 text-sm text-muted-foreground">Ningún producto nuestro tiene competencia con estos filtros.</p>}
            {nuestros.map((n) => (
              <BarraH
                key={n.nuestro.id}
                nombre={
                  <>
                    {n.nuestro.nombre} <span className="text-muted-foreground">· nosotros {usd(n.nuestro.precio)}{n.convertido ? " · competencia en precio equivalente" : ""}</span>
                  </>
                }
                valor={Math.abs(n.diferencia ?? 0)}
                maximo={maxDiferencia}
                tono={n.diferencia !== null && n.diferencia < 0 ? "rojo" : "verde"}
                texto={n.diferencia === null ? "—" : `${usd(n.minimo)} (${n.diferencia < 0 ? "−" : n.diferencia > 0 ? "+" : ""}${usd(Math.abs(n.diferencia))})`}
              />
            ))}
          </div>
        </Tarjeta>

        <Tarjeta id="c-top" titulo="Productos de la competencia que más venden" extra={<span className="text-xs text-muted-foreground">{NOMBRE_PERIODO[periodo]}</span>}>
          {!masVendidos.length ? (
            <p className="p-4 text-sm text-muted-foreground">{datos.busquedas > 1 ? "Sin bajadas de stock en este periodo." : "Se ve desde la segunda búsqueda."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={claseTh}>Producto</th>
                    <th className={claseTh}>Competidor</th>
                    <th className={`${claseTh} text-right`}>Precio</th>
                    <th className={`${claseTh} text-right`}>Vendido</th>
                  </tr>
                </thead>
                <tbody>
                  {masVendidos.map(({ p, vendido }) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className={claseTd}>
                        <span className="flex items-center gap-2">
                          <Miniatura url={p.foto} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{p.nombre}</span>
                            {p.igualA ? <Badge tone="warning">Igual a uno nuestro</Badge> : <span className="text-xs text-muted-foreground">{categoriaDe(p)}</span>}
                          </span>
                        </span>
                      </td>
                      <td className={claseTd}>{p.proveedor}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{usd(p.precio)}</td>
                      <td className={`${claseTd} text-right font-medium tabular-nums text-destructive`}>−{num(vendido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
