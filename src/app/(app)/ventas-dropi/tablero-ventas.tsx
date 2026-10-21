"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CabeceraTarjeta, Indicador, Segmentado, claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { CATEGORIAS, DIAS_REPONER, hayQueReponer, type Categoria, type ResumenProducto } from "@/lib/publicaciones/ventas";

export interface ProductoVentas extends ResumenProducto {
  /** El SKU del sistema, si alguna publicación de Gestión de IDs Dropi lo vincula. */
  sku: string | null;
}

export interface DropshipperVentas {
  id: number;
  nombre: string;
  pedidas: number;
  ordenes: number;
  noEfectivas: number;
  netas: number;
  netas30: number;
  productos: number;
  ultimaOrden: string | null;
}

interface Mes {
  mes: string;
  pedidas: number;
  canceladas: number;
  rechazadas: number;
  devueltas: number;
  netas: number;
}

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const fecha = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");
/** «+12.4 %» en verde si sube y en rojo si baja; sin dato anterior, nada. */
const Cambio = ({ valor }: { valor: number | null }) =>
  valor === null ? null : <b className={`font-medium ${valor > 0 ? "text-success" : valor < 0 ? "text-destructive" : ""}`}>{`${valor > 0 ? "+" : valor < 0 ? "−" : ""}${Math.abs(valor).toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`}</b>;
const fechaCorta = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;

const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "0 8px 24px -12px rgb(95 67 209 / 0.45)" };
/** Los colores de las gráficas, tomados del neón del riel y de los botones principales (`--neon`). */
const NEON = { rosa: "#d74c81", magenta: "#b12a97", violeta: "#8a35c9", indigo: "#5f43d1" } as const;

/** Degradados verticales de las barras de las gráficas (de arriba abajo), definidos en cada gráfica que los usa. */
function DegradadosNeon() {
  return (
    <defs>
      <linearGradient id="vd-violeta" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.magenta} />
        <stop offset="100%" stopColor={NEON.indigo} />
      </linearGradient>
      <linearGradient id="vd-suave" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={NEON.violeta} stopOpacity={0.35} />
        <stop offset="100%" stopColor={NEON.violeta} stopOpacity={0.12} />
      </linearGradient>
      <linearGradient id="vd-rosa" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e57aa3" />
        <stop offset="100%" stopColor={NEON.rosa} />
      </linearGradient>
    </defs>
  );
}

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

const Nota = ({ children }: { children: ReactNode }) => <p className="px-3.5 pt-2.5 text-xs text-muted-foreground">{children}</p>;

/** Una columna de tabla: cómo se ve, cómo se ordena y si va alineada a la derecha. */
interface Columna<T> {
  id: string;
  titulo: string;
  valor: (f: T) => string | number | null;
  ver?: (f: T) => ReactNode;
  numero?: boolean;
  clase?: string;
}

/** Tabla que se ordena con un clic en el encabezado (números de mayor a menor primero). Con `alElegir`, cada fila es un botón. */
function TablaOrdenable<T>({ etiqueta, filas, columnas, clave, inicial, alElegir, elegida, alto = "max-h-[26rem]", vacio }: { etiqueta: string; filas: T[]; columnas: Columna<T>[]; clave: (f: T) => string; inicial: { id: string; dir: 1 | -1 }; alElegir?: (f: T) => void; elegida?: string | null; alto?: string; vacio: string }) {
  const [orden, setOrden] = useState(inicial);
  const col = columnas.find((c) => c.id === orden.id) ?? columnas[0];
  const ordenadas = useMemo(
    () =>
      [...filas].sort((a, b) => {
        const va = col.valor(a), vb = col.valor(b);
        if (va === null || va === "") return 1;
        if (vb === null || vb === "") return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es")) * orden.dir;
      }),
    [filas, col, orden.dir],
  );
  if (!filas.length) return <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div role="region" aria-label={etiqueta} tabIndex={0} className={`overflow-auto ${alto} ${anilloFoco}`}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-[1] bg-card">
          <tr>
            {columnas.map((c) => (
              <th key={c.id} aria-sort={orden.id === c.id ? (orden.dir > 0 ? "ascending" : "descending") : "none"} className={`${claseThLista} ${c.numero ? "text-right" : ""}`}>
                <button
                  type="button"
                  onClick={() => setOrden((o) => (o.id === c.id ? { id: c.id, dir: o.dir > 0 ? -1 : 1 } : { id: c.id, dir: c.numero ? -1 : 1 }))}
                  className={`inline-flex items-center gap-1 rounded hover:text-foreground ${anilloFoco}`}
                >
                  {c.titulo}
                  {orden.id === c.id && <span aria-hidden="true">{orden.dir > 0 ? "↑" : "↓"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => {
            const k = clave(f);
            return (
              <tr
                key={k}
                tabIndex={alElegir ? 0 : undefined}
                aria-current={alElegir && elegida === k ? "true" : undefined}
                onClick={alElegir ? () => alElegir(f) : undefined}
                onKeyDown={
                  alElegir
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          alElegir(f);
                        }
                      }
                    : undefined
                }
                className={alElegir ? `cursor-pointer hover:bg-muted aria-[current=true]:bg-primario-suave aria-[current=true]:shadow-[inset_3px_0_0_var(--primario)] ${anilloFoco}` : ""}
              >
                {columnas.map((c) => (
                  <td key={c.id} className={`${claseTdLista} ${c.numero ? "text-right tabular-nums" : ""} ${c.clase ?? ""}`}>
                    {c.ver ? c.ver(f) : (c.valor(f) ?? "—")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** El nombre del producto con su ID de Dropi y su SKU debajo. */
function NombreProducto({ p }: { p: ProductoVentas }) {
  return (
    <span className="flex min-w-[13rem] max-w-[22rem] flex-col whitespace-normal">
      <span className="font-medium">{p.nombre}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        ID {p.id}
        {p.sku && <span className="font-mono"> · {p.sku}</span>}
        {p.privado && " · privado"}
        {p.lista === "archivado" && " · archivado"}
      </span>
    </span>
  );
}

const colProducto: Columna<ProductoVentas> = { id: "nombre", titulo: "Producto", valor: (p) => p.nombre, ver: (p) => <NombreProducto p={p} /> };
const colNetas30: Columna<ProductoVentas> = { id: "netas30", titulo: "Netas 30 días", valor: (p) => p.netas30, ver: (p) => entero(p.netas30), numero: true };
const colAntes: Columna<ProductoVentas> = { id: "antes", titulo: "30 días antes", valor: (p) => p.netas30Antes, ver: (p) => entero(p.netas30Antes), numero: true };
const colStock: Columna<ProductoVentas> = { id: "stock", titulo: "Stock", valor: (p) => p.stock, ver: (p) => <span className={p.stock <= 0 ? "font-semibold text-destructive" : ""}>{entero(p.stock)}</span>, numero: true };
const colDias: Columna<ProductoVentas> = {
  id: "dias",
  titulo: "Días de inventario",
  valor: (p) => p.diasInventario,
  ver: (p) => (p.diasInventario === null ? "—" : <span className={p.diasInventario < 7 ? "font-semibold text-destructive" : p.diasInventario < DIAS_REPONER ? "font-semibold text-warning" : ""}>{entero(p.diasInventario)}</span>),
  numero: true,
};

/** Las barras por mes de un producto (al elegirlo en la tabla). */
function DetalleProducto({ p, meses }: { p: ProductoVentas; meses: string[] }) {
  const datos = meses.map((m) => ({ mes: nombreMes(m), netas: p.porMes[m] ?? 0 }));
  return (
    <Tarjeta id="vd-detalle" titulo={`${p.nombre} · ID ${p.id}`}>
      <Nota>
        Unidades netas por mes. {CATEGORIAS.find((c) => c.valor === p.categoria)?.etiqueta}. Stock {entero(p.stock)}
        {p.diasInventario !== null ? `, para ${entero(p.diasInventario)} días` : ""}. Pedidas en total {entero(p.pedidas)}: {pct(p.pctCancelacion)} canceladas y {pct(p.pctDevolucion)} devueltas o rechazadas. Última venta: {fecha(p.ultimaVenta)}.
        {p.alertas.length > 0 && <span className="font-medium text-foreground"> {p.alertas.join(" · ")}.</span>}
      </Nota>
      <div className="h-[220px] p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
            <DegradadosNeon />
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="mes" {...ejes} interval="preserveStartEnd" />
            <YAxis {...ejes} allowDecimals={false} width={40} />
            <Tooltip contentStyle={estiloTooltip} cursor={{ fill: "var(--muted)" }} formatter={(v) => [entero(Number(v)), "Netas"]} />
            <Bar dataKey="netas" name="Netas" radius={[4, 4, 0, 0]}>
              {datos.map((d) => (
                <Cell key={d.mes} fill={d.netas < 0 ? NEON.rosa : "url(#vd-violeta)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Tarjeta>
  );
}

/**
 * El tablero de Ventas Dropi: las cifras de arriba, la tendencia por mes y por día, lo que hay que reponer, lo que crece y cae,
 * el stock quieto, todos los productos (con búsqueda, categoría y su detalle por mes), los SKU del sistema y los dropshippers.
 */
export function TableroVentas({ corte, movimientos, productos, meses, dias, dropshippers }: { corte: string; movimientos: number; productos: ProductoVentas[]; meses: Mes[]; dias: { dia: string; pedidas: number; netas: number }[]; dropshippers: DropshipperVentas[] }) {
  const [categoria, setCategoria] = useState<Categoria | "todas">("todas");
  const [busqueda, setBusqueda] = useState("");
  const [buscaDs, setBuscaDs] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);

  const k = useMemo(() => {
    const suma = (f: (p: ProductoVentas) => number) => productos.reduce((a, p) => a + f(p), 0);
    const n30 = suma((p) => p.netas30);
    const antes = suma((p) => p.netas30Antes);
    const pedidas = suma((p) => p.pedidas);
    return {
      n30,
      antes,
      cambio: antes ? ((n30 - antes) / antes) * 100 : null,
      pedidas,
      cancel: pedidas ? suma((p) => p.canceladas) / pedidas : null,
      dev: pedidas ? suma((p) => p.devueltas + p.rechazadas) / pedidas : null,
      sinStock: productos.filter((p) => p.netas30 > 0 && p.stock <= 0).length,
      agotandose: productos.filter((p) => p.netas30 > 0 && p.stock > 0 && p.diasInventario !== null && p.diasInventario < DIAS_REPONER).length,
      sinVentas: productos.filter((p) => p.categoria === "sin_ventas").length,
      nunca: productos.filter((p) => p.categoria === "nunca").length,
      dsActivos: dropshippers.filter((d) => d.ultimaOrden && d.ultimaOrden >= dias[dias.length - 30]?.dia).length,
    };
  }, [productos, dropshippers, dias]);

  const reponer = useMemo(() => productos.filter(hayQueReponer), [productos]);
  const crecen = useMemo(() => productos.filter((p) => p.netas30Antes >= 10 && p.netas30 >= p.netas30Antes * 1.5), [productos]);
  const caen = useMemo(() => productos.filter((p) => p.netas30Antes >= 10 && p.netas30 < p.netas30Antes * 0.5), [productos]);
  const quietos = useMemo(() => productos.filter((p) => p.lista === "activo" && p.stock > 0 && p.netas30 <= 0), [productos]);
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => (categoria === "todas" || p.categoria === categoria) && (!q || `${p.id} ${p.nombre} ${p.sku ?? ""}`.toLowerCase().includes(q)));
  }, [productos, categoria, busqueda]);
  const porSku = useMemo(() => {
    const g = new Map<string, { sku: string; publicaciones: number; netas30: number; antes: number; netas90: number; netasTotal: number; stock: number; ultimaVenta: string | null }>();
    for (const p of productos) {
      if (!p.sku) continue;
      const x = g.get(p.sku) ?? { sku: p.sku, publicaciones: 0, netas30: 0, antes: 0, netas90: 0, netasTotal: 0, stock: 0, ultimaVenta: null };
      g.set(p.sku, x);
      x.publicaciones++;
      x.netas30 += p.netas30;
      x.antes += p.netas30Antes;
      x.netas90 += p.netas90;
      x.netasTotal += p.netasTotal;
      x.stock += Math.max(p.stock, 0);
      if (p.ultimaVenta && (!x.ultimaVenta || p.ultimaVenta > x.ultimaVenta)) x.ultimaVenta = p.ultimaVenta;
    }
    return [...g.values()].map((x) => ({ ...x, dias: x.netas30 > 0 ? Math.round(x.stock / (x.netas30 / 30)) : null }));
  }, [productos]);
  const dsFiltrados = useMemo(() => {
    const q = buscaDs.trim().toLowerCase();
    return q ? dropshippers.filter((d) => d.nombre.toLowerCase().includes(q)) : dropshippers;
  }, [dropshippers, buscaDs]);
  const detalle = elegido ? productos.find((p) => String(p.id) === elegido) : null;

  const datosMes = meses.map((m) => ({ mes: nombreMes(m.mes) + (m.mes === corte.slice(0, 7) ? "*" : ""), netas: m.netas, canceladas: m.canceladas, devrech: m.devueltas + m.rechazadas, pedidas: m.pedidas }));
  const datosDia = dias.map((d) => ({ dia: fechaCorta(d.dia), netas: d.netas, pedidas: d.pedidas }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Ventas Dropi</h2>
        <p className="max-w-[75ch] text-sm text-muted-foreground">
          En los últimos 30 días salieron <b className="font-semibold text-foreground">{entero(k.n30)} unidades netas</b>
          {k.cambio !== null && `, ${Math.abs(k.cambio).toLocaleString("es-PA", { maximumFractionDigits: 1 })} % ${k.cambio < 0 ? "menos" : "más"} que los 30 días anteriores`}. {k.sinStock} productos que se venden ya no tienen stock y a {k.agotandose} más se les acaba en menos de dos semanas.
        </p>
        <p className="text-xs text-muted-foreground">
          Del Historial de Existencia de Dropi hasta el {fecha(corte)} · {entero(productos.length)} productos y {entero(movimientos)} movimientos. Netas = pedidas − canceladas − rechazadas − devueltas.
        </p>
      </header>

      <section aria-label="Indicadores" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap">
          <Indicador titulo="Netas · últimos 30 días" valor={entero(k.n30)} detalle={<><Cambio valor={k.cambio} /> vs. los 30 anteriores ({entero(k.antes)})</>} />
          <Indicador titulo="Se venden y sin stock" punto={k.sinStock ? "peligro" : undefined} valor={entero(k.sinStock)} detalle={`${k.agotandose} más con menos de ${DIAS_REPONER} días`} />
          <Indicador titulo="Canceladas" valor={pct(k.cancel)} detalle={`de ${entero(k.pedidas)} unidades pedidas`} />
          <Indicador titulo="Devueltas o rechazadas" punto={k.dev !== null && k.dev > 0.15 ? "aviso" : undefined} valor={pct(k.dev)} detalle="de lo pedido, todo el historial" />
          <Indicador titulo="Sin ventas en 30 días" valor={entero(k.sinVentas)} detalle={`de ${entero(productos.length)} productos · ${k.nunca} nunca vendieron`} />
          <Indicador titulo="Dropshippers que pidieron" valor={entero(k.dsActivos)} detalle={`en 30 días, de ${entero(dropshippers.length)}`} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="vd-mes" titulo="Unidades por mes" extra={<span className="text-xs text-muted-foreground">* mes en curso</span>}>
          <div className="h-[260px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosMes} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <DegradadosNeon />
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="mes" {...ejes} interval="preserveStartEnd" />
                <YAxis {...ejes} width={48} tickFormatter={(v) => entero(Number(v))} />
                <Tooltip contentStyle={estiloTooltip} cursor={{ fill: "var(--muted)" }} formatter={(v, n) => [entero(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="netas" name="Netas" stackId="u" fill="url(#vd-violeta)" />
                <Bar dataKey="canceladas" name="Canceladas" stackId="u" fill="url(#vd-suave)" />
                <Bar dataKey="devrech" name="Devueltas o rechazadas" stackId="u" fill="url(#vd-rosa)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
        <Tarjeta id="vd-dia" titulo="Netas por día · últimos 90 días">
          <div className="h-[260px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosDia} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <DegradadosNeon />
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="dia" {...ejes} interval={13} />
                <YAxis {...ejes} width={48} tickFormatter={(v) => entero(Number(v))} />
                <Tooltip contentStyle={estiloTooltip} cursor={{ fill: "var(--muted)" }} formatter={(v, n) => [entero(Number(v)), n === "netas" ? "Netas" : "Pedidas"]} />
                <Bar dataKey="netas" name="netas" radius={[3, 3, 0, 0]}>
                  {datosDia.map((d) => (
                    <Cell key={d.dia} fill={d.netas < 0 ? NEON.rosa : "url(#vd-violeta)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta id="vd-reponer" titulo={`Reponer ya (${reponer.length})`}>
        <Nota>Se vendieron en los últimos 30 días y no tienen stock, o les alcanza para menos de {DIAS_REPONER} días al ritmo actual.</Nota>
        <TablaOrdenable
          etiqueta="Productos para reponer"
          filas={reponer}
          clave={(p) => String(p.id)}
          inicial={{ id: "netas30", dir: -1 }}
          vacio="Nada que reponer: todo lo que se vende tiene stock para más de dos semanas."
          columnas={[colProducto, colNetas30, { id: "dia", titulo: "Por día", valor: (p) => p.porDia, ver: (p) => p.porDia.toLocaleString("es-PA", { maximumFractionDigits: 1 }), numero: true }, colStock, colDias]}
        />
      </Tarjeta>

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="vd-crecen" titulo={`Crecen (${crecen.length})`}>
          <Nota>Con 10 o más netas el mes anterior y al menos 50 % más en los últimos 30 días.</Nota>
          <TablaOrdenable etiqueta="Productos que crecen" filas={crecen} clave={(p) => String(p.id)} inicial={{ id: "netas30", dir: -1 }} vacio="Ningún producto creció así este mes." columnas={[colProducto, colAntes, colNetas30, colStock]} />
        </Tarjeta>
        <Tarjeta id="vd-caen" titulo={`Caen (${caen.length})`}>
          <Nota>Con 10 o más netas el mes anterior y menos de la mitad en los últimos 30 días.</Nota>
          <TablaOrdenable etiqueta="Productos que caen" filas={caen} clave={(p) => String(p.id)} inicial={{ id: "antes", dir: -1 }} vacio="Ningún producto cayó así este mes." columnas={[colProducto, colAntes, colNetas30, colStock]} />
        </Tarjeta>
      </div>

      <Tarjeta id="vd-quietos" titulo={`Stock que no se mueve (${quietos.length})`}>
        <Nota>Productos activos en Dropi, con stock y sin ventas netas en los últimos 30 días.</Nota>
        <TablaOrdenable
          etiqueta="Stock que no se mueve"
          filas={quietos}
          clave={(p) => String(p.id)}
          inicial={{ id: "stock", dir: -1 }}
          vacio="Todo el stock activo se está vendiendo."
          columnas={[colProducto, colStock, { id: "ultima", titulo: "Última venta", valor: (p) => p.ultimaVenta, ver: (p) => (p.ultimaVenta ? fecha(p.ultimaVenta) : "Nunca") }, { id: "total", titulo: "Netas en total", valor: (p) => p.netasTotal, ver: (p) => entero(p.netasTotal), numero: true }]}
        />
      </Tarjeta>

      <section aria-labelledby="vd-todos" className="min-w-0 rounded-[10px] border border-border bg-card">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-t-[10px] border-b border-border bg-muted px-3.5 py-1.5">
          <h2 id="vd-todos" className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            Todos los productos ({filtrados.length})
          </h2>
          <Segmentado etiqueta="Categoría" valor={categoria} alCambiar={setCategoria} opciones={[{ valor: "todas" as const, etiqueta: "Todos" }, ...CATEGORIAS.map((c) => ({ valor: c.valor, etiqueta: c.etiqueta }))]} />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-3.5 pt-3">
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, ID o SKU" aria-label="Buscar producto" className={`${fieldClass} max-w-sm flex-1`} />
          <span className="text-xs text-muted-foreground">{CATEGORIAS.find((c) => c.valor === categoria)?.detalle ?? "Toca un producto para ver sus ventas por mes."}</span>
        </div>
        <TablaOrdenable
          etiqueta="Todos los productos"
          filas={filtrados}
          clave={(p) => String(p.id)}
          inicial={{ id: "netas30", dir: -1 }}
          alElegir={(p) => setElegido(String(p.id))}
          elegida={elegido}
          alto="max-h-[34rem]"
          vacio="Ningún producto coincide con la búsqueda."
          columnas={[
            colProducto,
            colNetas30,
            colAntes,
            colStock,
            colDias,
            { id: "total", titulo: "Netas en total", valor: (p) => p.netasTotal, ver: (p) => entero(p.netasTotal), numero: true },
            { id: "cancel", titulo: "Canceladas", valor: (p) => p.pctCancelacion, ver: (p) => pct(p.pctCancelacion), numero: true },
            { id: "dev", titulo: "Devueltas", valor: (p) => p.pctDevolucion, ver: (p) => <span className={p.pedidas >= 30 && (p.pctDevolucion ?? 0) > 0.2 ? "font-semibold text-destructive" : ""}>{pct(p.pctDevolucion)}</span>, numero: true },
            { id: "ultima", titulo: "Última venta", valor: (p) => p.ultimaVenta, ver: (p) => fecha(p.ultimaVenta) },
            { id: "alertas", titulo: "Alertas", valor: (p) => p.alertas.join(" · "), clase: "max-w-[18rem] whitespace-normal text-xs text-muted-foreground" },
          ]}
        />
      </section>

      {detalle && <DetalleProducto p={detalle} meses={meses.map((m) => m.mes)} />}

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <Tarjeta id="vd-sku" titulo={`Por SKU del sistema (${porSku.length})`}>
          <Nota>Suma las publicaciones de Dropi de un mismo producto (públicas y privadas), por el vínculo de Gestión de IDs Dropi.</Nota>
          <TablaOrdenable
            etiqueta="Ventas por SKU"
            filas={porSku}
            clave={(s) => s.sku}
            inicial={{ id: "netas30", dir: -1 }}
            vacio="Ninguna publicación está vinculada a un SKU."
            columnas={[
              { id: "sku", titulo: "SKU", valor: (s) => s.sku, clase: "font-mono text-xs" },
              { id: "netas30", titulo: "Netas 30 días", valor: (s) => s.netas30, ver: (s) => entero(s.netas30), numero: true },
              { id: "antes", titulo: "30 días antes", valor: (s) => s.antes, ver: (s) => entero(s.antes), numero: true },
              { id: "stock", titulo: "Stock", valor: (s) => s.stock, ver: (s) => entero(s.stock), numero: true },
              { id: "dias", titulo: "Días de inventario", valor: (s) => s.dias, ver: (s) => (s.dias === null ? "—" : <span className={s.dias < DIAS_REPONER ? "font-semibold text-warning" : ""}>{entero(s.dias)}</span>), numero: true },
              { id: "pubs", titulo: "Publicaciones", valor: (s) => s.publicaciones, numero: true },
            ]}
          />
        </Tarjeta>
        <section aria-labelledby="vd-ds" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="vd-ds" titulo={`Dropshippers (${dsFiltrados.length})`} />
          <Nota>Quién creó cada orden. Lo cancelado, rechazado o devuelto se le carga por el número de orden.</Nota>
          <div className="px-3.5 pt-2.5">
            <input type="search" value={buscaDs} onChange={(e) => setBuscaDs(e.target.value)} placeholder="Buscar dropshipper" aria-label="Buscar dropshipper" className={`${fieldClass} max-w-sm`} />
          </div>
          <TablaOrdenable
            etiqueta="Ventas por dropshipper"
            filas={dsFiltrados}
            clave={(d) => String(d.id)}
            inicial={{ id: "netas30", dir: -1 }}
            vacio="Ningún dropshipper coincide con la búsqueda."
            columnas={[
              { id: "nombre", titulo: "Dropshipper", valor: (d) => d.nombre, clase: "font-medium" },
              { id: "netas30", titulo: "Netas 30 días", valor: (d) => d.netas30, ver: (d) => entero(d.netas30), numero: true },
              { id: "netas", titulo: "Netas en total", valor: (d) => d.netas, ver: (d) => entero(d.netas), numero: true },
              { id: "no", titulo: "No efectivas", valor: (d) => (d.pedidas ? d.noEfectivas / d.pedidas : null), ver: (d) => <span className={d.pedidas >= 50 && d.noEfectivas / d.pedidas > 0.3 ? "font-semibold text-destructive" : ""}>{pct(d.pedidas ? d.noEfectivas / d.pedidas : null)}</span>, numero: true },
              { id: "productos", titulo: "Productos", valor: (d) => d.productos, numero: true },
              { id: "ultima", titulo: "Última orden", valor: (d) => d.ultimaOrden, ver: (d) => fecha(d.ultimaOrden) },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
