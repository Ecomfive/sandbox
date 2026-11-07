"use client";

import Link from "next/link";
import { plataformaDe } from "@/lib/plataformas";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState, useTransition, type ComponentType } from "react";
import { FotoAmpliable, HistorialCompetencia } from "@/components/competencia/piezas-competencia";
import { COLORES, type Color } from "@/components/panel/colores-tablero";
import { BotonBarra, CabeceraTarjeta } from "@/components/panel/piezas-panel";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useMonedaCompetencia } from "@/components/competencia/moneda-competencia";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { ActualizarIcon, AlertaIcon, AnalisisCompetenciaIcon, EnlaceIcon, ProveedorIcon, TiendaIcon, VentasIcon } from "@/lib/nav-icons";
import { marcarAlertasVistas } from "./actions";
import { decisionesDeHoy, posicionPrecio, precioEquivalente, type Decision, type EstadoPosicion, type Posicion, type TipoDecision } from "@/lib/competencia/analisis";
import type { AlertaC, CompetidorC, DatosCompetencia, FilaNuestro, ProductoC } from "./def-competencia";

const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-PA"));
const segundos = (ms: number | null) => (ms === null ? "" : ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
/** Cuántos productos de un competidor se ven al abrirlo (el resto, con «Ver todos»). */
const PRIMEROS = 25;

// Cada alerta lleva un punto del color de su tipo junto al título (la regla del sistema: un punto, no una caja).
const TIPO: Record<string, { etiqueta: string; tono: "destructive" | "warning" | "neutral"; punto: string }> = {
  mas_barato: { etiqueta: "Más barato que nosotros", tono: "destructive", punto: "bg-destructive" },
  bajo_precio: { etiqueta: "Bajó precio", tono: "warning", punto: "bg-warning" },
  bajo_stock: { etiqueta: "Bajó stock", tono: "warning", punto: "bg-warning" },
  desaparecio: { etiqueta: "Desapareció", tono: "neutral", punto: "bg-border-control" },
  competidor_nuevo: { etiqueta: "Competidor nuevo", tono: "neutral", punto: "bg-border-control" },
  nuevo: { etiqueta: "Producto nuevo de un vigilado", tono: "warning", punto: "bg-warning" },
};

// ---------- Datos derivados ----------

/** Cada producto nuestro con los iguales de la competencia (más baratos primero) y la diferencia con el más bajo. */
export function filasNuestras(productos: ProductoC[]): FilaNuestro[] {
  const iguales = new Map<string, ProductoC[]>();
  for (const p of productos) if (p.igualA && p.estado === "activo") iguales.set(p.igualA, [...(iguales.get(p.igualA) ?? []), p]);
  return productos
    .filter((p) => p.esNuestro && p.estado === "activo")
    .map((n) => {
      const eq = (p: ProductoC) => precioEquivalente(n.nombre, p).precio;
      const lista = (iguales.get(n.id) ?? []).sort((a, b) => (eq(a) ?? 1e9) - (eq(b) ?? 1e9));
      const precios = lista.map(eq).filter((x): x is number => x !== null);
      const minimo = precios.length ? Math.min(...precios) : null;
      return {
        nuestro: n,
        iguales: lista,
        minimo,
        convertido: lista.some((l) => precioEquivalente(n.nombre, l).nota !== null),
        diferencia: minimo !== null && n.precio !== null ? Math.round((minimo - n.precio) * 100) / 100 : null,
        bajo7: lista.reduce((t, l) => t + l.bajo7, 0),
      };
    })
    .sort((a, b) => b.iguales.length - a.iguales.length || a.nuestro.nombre.localeCompare(b.nuestro.nombre));
}

// ---------- Posición en precio y «Qué hacer hoy» ----------

const ESTILO_POSICION: Record<EstadoPosicion, { etiqueta: string; clase: string }> = {
  ganando: { etiqueta: "Ganando", clase: "bg-success-soft text-success" },
  empatado: { etiqueta: "Empatado", clase: "bg-muted text-muted-foreground" },
  perdiendo: { etiqueta: "Perdiendo", clase: "bg-destructive-soft text-destructive" },
};

/** La insignia de posición en precio: «Ganando #1 de 3», «Perdiendo · él $1.49 más barato». */
export function InsigniaPosicion({ estado, detalle }: { estado: EstadoPosicion; detalle: string }) {
  const e = ESTILO_POSICION[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${e.clase}`}>
      {e.etiqueta}
      <span className="font-medium opacity-85">{detalle}</span>
    </span>
  );
}

/** Cada producto nuestro con competencia y su posición en precio (los que van perdiendo primero). */
export function posicionesNuestras(productos: ProductoC[]) {
  return filasNuestras(productos)
    .map((f) => ({ ...f, posicion: posicionPrecio(f.nuestro.precio, f.iguales.map((i) => precioEquivalente(f.nuestro.nombre, i).precio)) }))
    .filter((f): f is typeof f & { posicion: Posicion } => f.posicion !== null)
    .sort((a, b) => ORDEN_POSICION[a.posicion.estado] - ORDEN_POSICION[b.posicion.estado] || (a.diferencia ?? 0) - (b.diferencia ?? 0));
}
const ORDEN_POSICION: Record<EstadoPosicion, number> = { perdiendo: 0, empatado: 1, ganando: 2 };

const ESTILO_DECISION: Record<TipoDecision, { etiqueta: string; clase: string }> = {
  bajar: { etiqueta: "Bajar precio", clase: "bg-destructive-soft text-destructive" },
  oportunidad: { etiqueta: "Oportunidad de stock", clase: "bg-azul-soft text-azul" },
  vigilar: { etiqueta: "Vigilar", clase: "bg-warning-soft text-warning" },
  mantener: { etiqueta: "Mantener precio", clase: "bg-success-soft text-success" },
};

/** «Qué hacer hoy»: las decisiones que salen de los datos, con su motivo; tocar una abre su competidor. */
function QueHacerHoy({ decisiones, alAbrir }: { decisiones: Decision[]; alAbrir: (proveedorId: number) => void }) {
  const [tipo, setTipo] = useState<TipoDecision | "">("");
  const [todas, setTodas] = useState(false);
  const lista = decisiones.filter((d) => !tipo || d.tipo === tipo);
  const visibles = todas ? lista : lista.slice(0, 6);
  const cuenta = (t: TipoDecision) => decisiones.filter((d) => d.tipo === t).length;
  return (
    <section aria-labelledby="titulo-hoy" className="rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="titulo-hoy" titulo={`Qué hacer hoy · ${decisiones.length}`}>
        <span className="flex flex-wrap justify-end gap-1">
          {(Object.keys(ESTILO_DECISION) as TipoDecision[]).map((t) =>
            cuenta(t) ? (
              <button
                key={t}
                type="button"
                aria-pressed={tipo === t}
                onClick={() => setTipo(tipo === t ? "" : t)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTILO_DECISION[t].clase} ${tipo === t ? "ring-1 ring-current" : "opacity-80 hover:opacity-100"} ${anilloFoco}`}
              >
                {ESTILO_DECISION[t].etiqueta} {cuenta(t)}
              </button>
            ) : null,
          )}
        </span>
      </CabeceraTarjeta>
      {!decisiones.length ? (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">
          Nada que decidir por ahora. Las decisiones salen de lo que cambia entre búsquedas: precio, stock vendido y competidores nuevos.
        </p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((d, i) => (
            <li key={`${d.tipo}-${d.titulo}-${i}`} className="border-b border-border md:border-r">
              <button type="button" onClick={() => alAbrir(d.proveedorId)} className={`flex h-full w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-muted ${anilloFoco}`}>
                {d.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- fotos de Dropi (CloudFront)
                  <img src={d.foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border-control" />
                )}
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTILO_DECISION[d.tipo].clase}`}>{ESTILO_DECISION[d.tipo].etiqueta}</span>
                  <span className="text-sm font-semibold">{d.titulo}</span>
                  <span className="text-xs text-muted-foreground">{d.motivo}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 6 && (
        <button type="button" onClick={() => setTodas(!todas)} className={`w-full px-3.5 py-2 text-left text-xs text-primario hover:bg-muted ${anilloFoco}`}>
          {todas ? "Ver menos" : `Ver las ${lista.length} decisiones`}
        </button>
      )}
    </section>
  );
}

/** «Nuestros productos frente a la competencia»: la posición en precio de cada uno, con filtros de un toque. */
function NuestrosFrente({ filas, alAbrir, plataforma }: { filas: ReturnType<typeof posicionesNuestras>; alAbrir: (proveedorId: number) => void; plataforma: string }) {
  const { moneda, precio: usd } = useMonedaCompetencia();
  const [estado, setEstado] = useState<EstadoPosicion | "">("");
  const [todos, setTodos] = useState(false);
  const cuenta = (e: EstadoPosicion) => filas.filter((f) => f.posicion.estado === e).length;
  const lista = filas.filter((f) => !estado || f.posicion.estado === estado);
  const visibles = todos ? lista : lista.slice(0, 8);
  return (
    <section aria-labelledby="titulo-frente" className="rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="titulo-frente" titulo={`Nuestros productos frente a la competencia · ${filas.length}`}>
        <span className="flex flex-wrap justify-end gap-1">
          {(["perdiendo", "empatado", "ganando"] as EstadoPosicion[]).map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={estado === e}
              onClick={() => setEstado(estado === e ? "" : e)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTILO_POSICION[e].clase} ${estado === e ? "ring-1 ring-current" : "opacity-80 hover:opacity-100"} ${anilloFoco}`}
            >
              {ESTILO_POSICION[e].etiqueta} {cuenta(e)}
            </button>
          ))}
        </span>
      </CabeceraTarjeta>
      {!filas.length ? (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">Ningún producto nuestro tiene competencia en {plataforma}.</p>
      ) : (
        <ul className="flex flex-col">
          {visibles.map((f) => {
            const mas = f.iguales.find((i) => precioEquivalente(f.nuestro.nombre, i).precio === f.posicion.minimo) ?? f.iguales[0];
            const dif = f.nuestro.precio !== null ? Math.round((f.nuestro.precio - f.posicion.minimo) * 100) / 100 : null;
            const nota = precioEquivalente(f.nuestro.nombre, mas, moneda).nota;
            return (
              <li key={f.nuestro.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  onClick={() => alAbrir(mas.proveedorId)}
                  className={`grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2 text-left hover:bg-muted sm:grid-cols-[36px_minmax(0,1.6fr)_auto_minmax(0,0.8fr)_minmax(0,0.8fr)] ${anilloFoco}`}
                >
                  {f.nuestro.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- fotos de Dropi (CloudFront)
                    <img src={f.nuestro.foto} alt="" loading="lazy" className="h-9 w-9 rounded-md border border-border object-cover" />
                  ) : (
                    <span aria-hidden="true" className="h-9 w-9 rounded-md border border-dashed border-border-control" />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{f.nuestro.nombre}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      nosotros {usd(f.nuestro.precio)} · más bajo {usd(f.posicion.minimo)}
                      {nota ? ` equivalente (${nota})` : ""}
                      {f.posicion.estado === "perdiendo" ? ` (${mas.proveedor})` : ""}
                    </span>
                  </span>
                  <InsigniaPosicion estado={f.posicion.estado} detalle={`#${f.posicion.pos} de ${f.posicion.de}`} />
                  <span aria-hidden="true" className="hidden items-center gap-0.5 sm:flex">
                    {Array.from({ length: f.posicion.de }, (_, k) => (
                      <span key={k} className={`h-2 min-w-2.5 flex-1 rounded-sm ${k === f.posicion.pos - 1 ? "bg-primario" : "bg-muted"}`} />
                    ))}
                  </span>
                  <span className="hidden text-right text-xs text-muted-foreground tabular-nums sm:block">
                    {dif === null || dif === 0 ? "mismo precio" : dif > 0 ? `${usd(dif)} más caros` : `${usd(-dif)} más baratos`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > 8 && (
        <button type="button" onClick={() => setTodos(!todos)} className={`w-full border-t border-border px-3.5 py-2 text-left text-xs text-primario hover:bg-muted ${anilloFoco}`}>
          {todos ? "Ver menos" : `Ver los ${lista.length} productos`}
        </button>
      )}
    </section>
  );
}

// ---------- Tablero de arriba ----------

/** Un competidor con lo que cuentan las tarjetas: productos iguales a los nuestros, cuántos más baratos, cambios, si es nuevo y novedades sin ver. */
export type CompetidorFila = CompetidorC & { igualesN: number; baratos: number; cambiosHoy: number; nuevo: boolean; sinVer: number };

const sinPrefijoNuevo = (titulo: string) => titulo.replace(/^Competidor nuevo:\s*/, "");

/** El competidor de una novedad: el del producto o, si es un competidor nuevo, el que se llama como dice su título. */
function proveedorDeAlerta(a: AlertaC, datos: DatosCompetencia, porId: Map<string, ProductoC>): number | undefined {
  if (a.tipo === "competidor_nuevo") return datos.competidores.find((c) => c.nombre === sinPrefijoNuevo(a.titulo))?.id;
  return a.productoId ? porId.get(a.productoId)?.proveedorId : undefined;
}

/** Los productos activos de la competencia, por competidor. */
function productosPorCompetidor(productos: ProductoC[]): Map<number, ProductoC[]> {
  const m = new Map<number, ProductoC[]>();
  for (const p of productos) if (!p.esNuestro && p.estado === "activo") (m.get(p.proveedorId) ?? m.set(p.proveedorId, []).get(p.proveedorId)!).push(p);
  return m;
}

/** Cada competidor con lo que cuentan las tarjetas de arriba (y filtran la lista). */
export function competidoresConDatos(datos: DatosCompetencia): CompetidorFila[] {
  const porId = new Map(datos.productos.map((p) => [p.id, p]));
  const porCompetidor = productosPorCompetidor(datos.productos);
  const ultima = datos.ultima?.inicio ?? null;
  const cambios = new Map<string, number>();
  if (ultima) for (const b of datos.bitacora) if (b.fecha >= ultima && !b.esNuestro) cambios.set(b.proveedor, (cambios.get(b.proveedor) ?? 0) + 1);
  const nuevos = new Set(datos.alertas.filter((a) => a.tipo === "competidor_nuevo").map((a) => sinPrefijoNuevo(a.titulo)));
  const sinVer = new Map<number, number>();
  for (const a of datos.alertas) {
    const id = a.vista ? undefined : proveedorDeAlerta(a, datos, porId);
    if (id !== undefined) sinVer.set(id, (sinVer.get(id) ?? 0) + 1);
  }
  return datos.competidores.map((c) => {
    const iguales = (porCompetidor.get(c.id) ?? []).filter((p) => p.igualA);
    const baratos = iguales.filter((p) => {
      const n = porId.get(p.igualA!);
      const pu = n ? precioEquivalente(n.nombre, p).precio : null;
      return n?.precio != null && pu !== null && pu < n.precio - 0.004;
    }).length;
    return { ...c, igualesN: iguales.length, baratos, cambiosHoy: cambios.get(c.nombre) ?? 0, nuevo: nuevos.has(c.nombre), sinVer: sinVer.get(c.id) ?? 0 };
  });
}

/** Lo que filtra cada tarjeta del tablero (los competidores de la lista de abajo). */
const FILTRO_TARJETA = {
  iguales: (c: CompetidorFila) => c.igualesN > 0,
  baratos: (c: CompetidorFila) => c.baratos > 0,
  vendieron: (c: CompetidorFila) => c.bajo7 > 0,
  cambios: (c: CompetidorFila) => c.cambiosHoy > 0,
  nuevos: (c: CompetidorFila) => c.nuevo,
  novedades: (c: CompetidorFila) => c.sinVer > 0,
} as const;
export type IdTarjeta = keyof typeof FILTRO_TARJETA;
export const esIdTarjeta = (v: string | null): v is IdTarjeta => !!v && Object.hasOwn(FILTRO_TARJETA, v);

interface TarjetaC {
  id: IdTarjeta | "todos";
  titulo: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  /** Lo que avisa: en 0 se ve en verde (está todo bien). */
  avisa?: boolean;
}

const TARJETAS_COMPETENCIA: TarjetaC[] = [
  { id: "todos", titulo: "Competidores", icono: TiendaIcon, color: "verde" },
  { id: "iguales", titulo: "Venden lo nuestro", icono: EnlaceIcon, color: "azul" },
  { id: "baratos", titulo: "Más baratos que nosotros", icono: AnalisisCompetenciaIcon, color: "rojo", avisa: true },
  { id: "vendieron", titulo: "Vendieron en 7 días", icono: VentasIcon, color: "ambar" },
  { id: "cambios", titulo: "Con cambios", icono: ActualizarIcon, color: "azul" },
  { id: "nuevos", titulo: "Competidores nuevos", icono: ProveedorIcon, color: "violeta" },
  { id: "novedades", titulo: "Novedades sin ver", icono: AlertaIcon, color: "rojo", avisa: true },
];
export const tituloTarjeta = (id: IdTarjeta) => TARJETAS_COMPETENCIA.find((t) => t.id === id)!.titulo;

/**
 * El tablero de arriba de Análisis de competencia (2 nov 2026, pedido de Hernán: «como el de Gestión de IDs Dropi»), igual en todos los países.
 * Cada tarjeta cuenta los competidores de lo suyo y, al tocarla, filtra la lista de abajo; tocarla otra vez quita el filtro. «Competidores» los
 * muestra todos. Sin `alPulsar` (en la pestaña Resumen), cada tarjeta lleva a Competidores con su filtro puesto.
 */
export function TableroCompetencia({
  datos,
  filas,
  activa = null,
  alPulsar,
}: {
  datos: DatosCompetencia;
  filas?: CompetidorFila[];
  activa?: IdTarjeta | null;
  alPulsar?: (id: IdTarjeta | null) => void;
}) {
  const { pais } = useMonedaCompetencia();
  const competidores = useMemo(() => filas ?? competidoresConDatos(datos), [filas, datos]);
  const nuestras = useMemo(() => filasNuestras(datos.productos), [datos.productos]);
  const perdiendo = useMemo(() => posicionesNuestras(datos.productos).filter((f) => f.posicion.estado === "perdiendo").length, [datos.productos]);
  const conCompetencia = nuestras.filter((f) => f.iguales.length).length;
  const productosCompetencia = datos.productos.filter((p) => !p.esNuestro && p.estado === "activo").length;
  const vendido7 = competidores.reduce((t, c) => t + c.bajo7, 0);
  const sinVer = datos.alertas.filter((a) => !a.vista).length;
  const cuantos = (id: IdTarjeta) => competidores.filter(FILTRO_TARJETA[id]).length;
  const ultima = datos.ultima ? `${formatearFechaHoraCompleta(datos.ultima.inicio, pais)}${datos.ultima.duracionMs !== null ? ` · ${segundos(datos.ultima.duracionMs)}` : ""}` : null;

  const contenido: Record<TarjetaC["id"], { valor: number; junto?: string; detalle: string; extra?: string | null; extraRojo?: boolean }> = {
    todos: { valor: competidores.length, junto: `${num(productosCompetencia)} productos`, detalle: ultima ? `En ${plataformaDe(datos.plataforma).nombre} ${datos.pais} · última búsqueda ${ultima}` : `En ${plataformaDe(datos.plataforma).nombre} ${datos.pais}` },
    iguales: { valor: cuantos("iguales"), detalle: "Tienen productos iguales a los nuestros", extra: `${conCompetencia} de ${nuestras.length} productos nuestros con competencia` },
    baratos: {
      valor: cuantos("baratos"),
      detalle: "Venden un producto igual al nuestro más barato",
      extra: perdiendo ? `${perdiendo} ${perdiendo === 1 ? "producto nuestro pierde" : "productos nuestros pierden"} en precio` : null,
      extraRojo: true,
    },
    vendieron: { valor: cuantos("vendieron"), junto: `${num(vendido7)} unidades`, detalle: datos.plataforma === "effi" ? "Subieron sus ventas entre búsquedas" : "Bajó su stock entre búsquedas" },
    cambios: { valor: cuantos("cambios"), detalle: "Precio o stock distinto en la última búsqueda" },
    nuevos: { valor: cuantos("nuevos"), detalle: "Aparecieron después de la primera búsqueda" },
    novedades: {
      valor: sinVer,
      detalle: datos.busquedas > 1 ? "Cambios en lo igual a lo nuestro y competidores nuevos" : "Empiezan en la segunda búsqueda",
      extra: sinVer ? `De ${cuantos("novedades")} ${cuantos("novedades") === 1 ? "competidor" : "competidores"}` : null,
    },
  };

  return (
    <section aria-label="Tablero de la competencia" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {TARJETAS_COMPETENCIA.map((t) => {
        const d = contenido[t.id];
        const c = COLORES[t.avisa && d.valor === 0 ? "verde" : t.color];
        const Icono = t.icono;
        const encendida = t.id !== "todos" && activa === t.id;
        const clase = `group flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco} ${
          encendida ? `ring-2 ${c.activa}` : "border-border"
        }`;
        const ayuda = t.id === "todos" ? "Ver todos los competidores, sin filtro." : encendida ? "Filtrando la lista: tócala para quitar el filtro." : `Ver solo: ${t.titulo.toLowerCase()}.`;
        const interior = (
          <>
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
                <Icono className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-1">
              <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{num(d.valor)}</span>
              {d.junto && <span className="text-sm text-muted-foreground tabular-nums">/ {d.junto}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {d.detalle}
              {d.extra && <span className={`mt-0.5 block font-medium ${d.extraRojo ? "text-destructive" : "text-foreground-soft"}`}>{d.extra}</span>}
              <span className="sr-only">. {ayuda}</span>
            </span>
          </>
        );
        if (!alPulsar)
          return (
            <Link key={t.id} href={t.id === "todos" ? "/analisis-competencia" : `/analisis-competencia?tarjeta=${t.id}`} className={clase}>
              {interior}
            </Link>
          );
        return (
          <button key={t.id} type="button" aria-pressed={t.id === "todos" ? undefined : encendida} onClick={() => alPulsar(t.id === "todos" || encendida ? null : t.id)} className={clase}>
            {interior}
          </button>
        );
      })}
    </section>
  );
}

// ---------- Novedades ----------

function Novedades({ alertas, alAbrir, puedeEscribir, busquedas }: { alertas: AlertaC[]; alAbrir: (a: AlertaC) => void; puedeEscribir: boolean; busquedas: number }) {
  const { pais } = useMonedaCompetencia();
  const [verVistas, setVerVistas] = useState(false);
  const [todas, setTodas] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  const sinVer = alertas.filter((a) => !a.vista);
  const lista = verVistas ? alertas : sinVer;
  const visibles = todas ? lista : lista.slice(0, 6);
  const marcar = (ids?: string[]) =>
    iniciar(async () => {
      const r = await marcarAlertasVistas(ids);
      if (r.error) return mostrarToast(r.error, "destructive");
      router.refresh();
    });

  return (
    <section aria-labelledby="titulo-novedades" className="rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="titulo-novedades" titulo={`Novedades${sinVer.length ? ` · ${sinVer.length} sin ver` : ""}`}>
        <span className="flex items-center gap-2">
          <button type="button" aria-pressed={verVistas} onClick={() => setVerVistas(!verVistas)} className={`rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
            {verVistas ? "Solo sin ver" : "Ver también las vistas"}
          </button>
          {puedeEscribir && sinVer.length > 0 && (
            <BotonBarra disabled={pendiente} onClick={() => marcar()} className="!h-7 !text-xs">
              Marcar todas como vistas
            </BotonBarra>
          )}
        </span>
      </CabeceraTarjeta>
      {!visibles.length ? (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">
          {busquedas > 1 ? "Sin novedades: ningún cambio de precio o stock en los productos iguales a los nuestros ni competidores nuevos." : "Las novedades empiezan en la segunda búsqueda: la primera solo guarda cómo está todo hoy."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {visibles.map((a) => {
            const t = TIPO[a.tipo] ?? TIPO.competidor_nuevo;
            return (
              <li key={a.id} className={`flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-2 last:border-0 ${a.vista ? "opacity-70" : ""}`}>
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${t.punto}`} />
                <button type="button" onClick={() => alAbrir(a)} className={`flex min-w-0 flex-1 flex-col text-left hover:underline ${anilloFoco}`}>
                  <span className="text-sm font-medium">{a.titulo}</span>
                  {a.detalle && <span className="text-xs text-muted-foreground">{a.detalle}</span>}
                </button>
                <Badge tone={t.tono}>{t.etiqueta}</Badge>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{formatearFechaHoraCompleta(a.fecha, pais)}</span>
                {puedeEscribir && !a.vista && (
                  <button type="button" disabled={pendiente} onClick={() => marcar([a.id])} className={`rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
                    Vista
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > 6 && (
        <button type="button" onClick={() => setTodas(!todas)} className={`w-full border-t border-border px-3.5 py-2 text-left text-xs text-primario hover:bg-muted ${anilloFoco}`}>
          {todas ? "Ver menos" : `Ver las ${lista.length} novedades`}
        </button>
      )}
    </section>
  );
}

// ---------- Un competidor (se abre en su sitio) ----------

function ProductosDelCompetidor({ productos, nuestros, busqueda }: { productos: ProductoC[]; nuestros: Map<string, ProductoC>; busqueda: string }) {
  const { moneda, precio: usd } = useMonedaCompetencia();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const orden = useMemo(
    () =>
      productos
        .filter((p) => !busqueda || p.nombre.toLowerCase().includes(busqueda))
        .sort((a, b) => Number(!!b.igualA) - Number(!!a.igualA) || b.bajo7 - a.bajo7 || b.bajo30 - a.bajo30 || (b.ventasTotal ?? 0) - (a.ventasTotal ?? 0) || (b.stock ?? 0) - (a.stock ?? 0)),
    [productos, busqueda],
  );
  const visibles = todos ? orden : orden.slice(0, PRIMEROS);
  const conVentas = productos.some((p) => p.ventasTotal !== null);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th className={claseEncabezadoColumna}>Producto</th>
              <th className={`${claseEncabezadoColumna} text-right`}>Su precio</th>
              <th className={claseEncabezadoColumna}>Igual a nuestro</th>
              <th className={`${claseEncabezadoColumna} text-right`}>Stock</th>
              {conVentas && <th className={`${claseEncabezadoColumna} text-right`}>Ventas</th>}
              <th className={`${claseEncabezadoColumna} text-right`}>Vendido 7 d</th>
              <th className={`${claseEncabezadoColumna} text-right`}>30 d</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const n = p.igualA ? nuestros.get(p.igualA) : undefined;
              const eq = n ? precioEquivalente(n.nombre, p, moneda) : null;
              const dif = n && n.precio !== null && eq?.precio != null ? Math.round((eq.precio - n.precio) * 100) / 100 : null;
              const ab = abierto === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className="border-b border-border align-middle last:border-0 hover:bg-muted/50">
                    <td className={claseCeldaColumna}>
                      <span className="flex min-w-[15rem] items-center gap-2.5">
                        <FotoAmpliable url={p.foto} nombre={p.nombre} tam="h-9 w-9" />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">{p.nombre}</span>
                          <button
                            type="button"
                            aria-expanded={ab}
                            onClick={() => setAbierto(ab ? null : p.id)}
                            className={`self-start rounded text-xs text-primario hover:underline ${anilloFoco}`}
                          >
                            {ab ? "Ocultar historial" : "Ver historial"}
                          </button>
                        </span>
                      </span>
                    </td>
                    <td className={`${claseCeldaColumna} text-right font-medium tabular-nums ${dif !== null && dif < 0 ? "text-destructive" : ""}`}>
                      {usd(p.precio)}
                      {eq?.nota && <span className="block text-xs font-normal text-muted-foreground">= {usd(eq.precio)} por el nuestro</span>}
                    </td>
                    <td className={claseCeldaColumna}>
                      {n ? (
                        <span className="flex flex-col items-start gap-0.5">
                          <span className="text-xs">
                            {n.nombre} · <span className="tabular-nums">{usd(n.precio)}</span>
                          </span>
                          {dif !== null && dif < 0 && <InsigniaPosicion estado="perdiendo" detalle={`él ${usd(-dif)} más barato${eq?.nota ? " (equivalente)" : ""}`} />}
                          {dif !== null && dif > 0 && <InsigniaPosicion estado="ganando" detalle={`nosotros ${usd(dif)} más baratos${eq?.nota ? " (equivalente)" : ""}`} />}
                          {dif === 0 && <InsigniaPosicion estado="empatado" detalle="mismo precio" />}
                        </span>
                      ) : p.dudosoDe && nuestros.get(p.dudosoDe) ? (
                        <span className="flex flex-col items-start gap-0.5">
                          <Badge tone="neutral">Dudoso</Badge>
                          <span className="text-xs text-muted-foreground">Se parece a «{nuestros.get(p.dudosoDe)!.nombre}», pero no es seguro que sea el mismo: no se compara su precio.</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums`}>{num(p.stock)}</td>
                    {conVentas && <td className={`${claseCeldaColumna} text-right font-medium tabular-nums`}>{num(p.ventasTotal)}</td>}
                    <td className={`${claseCeldaColumna} text-right tabular-nums ${p.bajo7 ? "text-destructive" : "text-muted-foreground"}`}>{p.bajo7 ? `−${num(p.bajo7)}` : "0"}</td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums ${p.bajo30 ? "text-destructive" : "text-muted-foreground"}`}>{p.bajo30 ? `−${num(p.bajo30)}` : "0"}</td>
                  </tr>
                  {ab && (
                    <tr className="border-b border-border bg-muted/40">
                      <td colSpan={6} className="px-4 py-3">
                        <HistorialCompetencia productoId={p.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {orden.length > PRIMEROS && (
        <button type="button" onClick={() => setTodos(!todos)} className={`self-start rounded px-1.5 py-0.5 text-xs text-primario hover:underline ${anilloFoco}`}>
          {todos ? "Ver menos" : `Ver los ${orden.length} productos`}
        </button>
      )}
    </div>
  );
}

function TarjetaCompetidor({
  c,
  productos,
  nuestros,
  abierto,
  alAlternar,
  busqueda,
}: {
  c: CompetidorFila;
  productos: ProductoC[];
  nuestros: Map<string, ProductoC>;
  abierto: boolean;
  alAlternar: () => void;
  busqueda: string;
}) {
  return (
    <article id={`competidor-${c.id}`} className={`overflow-hidden rounded-[10px] border bg-card ${abierto ? "border-primario shadow-[0_0_0_1px_var(--primario)]" : "border-border"}`}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={alAlternar}
        className={`grid w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-3 px-3.5 py-3 text-left hover:bg-muted sm:grid-cols-[18px_minmax(0,1.5fr)_repeat(4,minmax(0,1fr))] ${anilloFoco}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none ${abierto ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.nombre}</span>
            {c.vigilado && <Badge tone="warning">Vigilado · {c.vigilado}</Badge>}
            {c.nuevo && <Badge>Nuevo</Badge>}
          </span>
          <span className="text-xs text-muted-foreground">{c.cambiosHoy ? `${c.cambiosHoy} ${c.cambiosHoy === 1 ? "cambio" : "cambios"} en la última búsqueda` : "sin cambios en la última búsqueda"}</span>
        </span>
        <Dato titulo="Productos" valor={num(c.productos)} />
        {c.ventasTotal !== null && <Dato titulo="Ventas totales" valor={num(c.ventasTotal)} />}
        <Dato titulo="Iguales a los nuestros" valor={num(c.igualesN)} extra={c.baratos ? <Badge tone="destructive">{c.baratos} más baratos</Badge> : null} />
        <Dato titulo="Vendido 7 d" valor={num(c.bajo7)} />
        <Dato titulo="Vendido 30 d" valor={num(c.bajo30)} />
      </button>
      {abierto && (
        <div className="flex flex-col gap-2 border-t border-border bg-muted/50 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Los iguales a los nuestros primero; luego lo que más vendió.</span>
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primario underline-offset-2 hover:underline">
              {c.enlace}
            </a>
          </div>
          <ProductosDelCompetidor productos={productos} nuestros={nuestros} busqueda={busqueda} />
        </div>
      )}
    </article>
  );
}

function Dato({ titulo, valor, extra }: { titulo: string; valor: string; extra?: React.ReactNode }) {
  return (
    <span className="hidden min-w-0 flex-col sm:flex">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{titulo}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold tabular-nums">{valor}</span>
        {extra}
      </span>
    </span>
  );
}

// ---------- La pantalla ----------

type Orden = "vendido" | "iguales" | "productos";

/**
 * Análisis de competencia en una sola pantalla: el tablero de tarjetas arriba (cuentan y filtran los competidores), lo que hay que decidir
 * hoy, nuestra posición en precio, las novedades y la lista de competidores con su buscador; cada uno se abre en su sitio con sus productos
 * (los iguales a los nuestros primero, con el precio frente al nuestro) y cada producto despliega su historial. Con una tarjeta encendida
 * la lista queda justo debajo del tablero, como en Gestión de IDs Dropi.
 */
export function VistaCompetidores({ datos, puedeEscribir }: { datos: DatosCompetencia; puedeEscribir: boolean }) {
  const { moneda } = useMonedaCompetencia();
  const parametros = useSearchParams();
  const [abierto, setAbierto] = useState<number | null>(null);
  // El buscador de arriba (Ctrl K) llega con el competidor escrito («?buscar=Oferfly»).
  const [texto, setTexto] = useState(() => parametros.get("buscar") ?? "");
  // La tarjeta encendida del tablero; desde la pestaña Resumen llega en la dirección («?tarjeta=baratos»).
  const [tarjeta, setTarjeta] = useState<IdTarjeta | null>(() => {
    const t = parametros.get("tarjeta");
    return esIdTarjeta(t) ? t : null;
  });
  const [orden, setOrden] = useState<Orden>("vendido");
  const busqueda = texto.trim().toLowerCase();

  const nuestros = useMemo(() => new Map(datos.productos.filter((p) => p.esNuestro).map((p) => [p.id, p])), [datos.productos]);
  const porId = useMemo(() => new Map(datos.productos.map((p) => [p.id, p])), [datos.productos]);
  const porCompetidor = useMemo(() => productosPorCompetidor(datos.productos), [datos.productos]);
  const conDatos = useMemo(() => competidoresConDatos(datos), [datos]);

  const competidores = useMemo(
    () =>
      conDatos
        .filter(
          (c) =>
            (!tarjeta || FILTRO_TARJETA[tarjeta](c)) &&
            (!busqueda || c.nombre.toLowerCase().includes(busqueda) || !!c.vigilado?.toLowerCase().includes(busqueda) || (porCompetidor.get(c.id) ?? []).some((p) => p.nombre.toLowerCase().includes(busqueda))),
        )
        .sort((a, b) =>
          orden === "vendido" ? b.bajo7 - a.bajo7 || b.bajo30 - a.bajo30 || (b.ventasTotal ?? 0) - (a.ventasTotal ?? 0) || b.productos - a.productos : orden === "iguales" ? b.igualesN - a.igualesN || b.bajo7 - a.bajo7 : b.productos - a.productos,
        ),
    [conDatos, porCompetidor, tarjeta, busqueda, orden],
  );

  const posiciones = useMemo(() => posicionesNuestras(datos.productos), [datos.productos]);
  const decisiones = useMemo(() => {
    const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const nuevosComp = datos.corte
      ? datos.competidores.filter((c) => c.primeraVez > datos.corte! && c.primeraVez > hace7).map((c) => ({ proveedorId: c.id, nombre: c.nombre, productos: c.productos }))
      : [];
    return decisionesDeHoy(
      datos.productos.filter((p) => p.esNuestro && p.estado === "activo").map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, foto: p.foto })),
      datos.productos.filter((p) => !p.esNuestro),
      nuevosComp,
      datos.corte,
      undefined,
      moneda,
    );
  }, [datos.productos, datos.competidores, datos.corte, moneda]);
  const abrirCompetidor = (prov: number) => {
    setTexto("");
    setTarjeta(null);
    setAbierto(prov);
    requestAnimationFrame(() => document.getElementById(`competidor-${prov}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  // Una novedad abre su competidor (y lo lleva a la vista).
  const abrirNovedad = (a: AlertaC) => {
    const prov = proveedorDeAlerta(a, datos, porId);
    if (prov !== undefined) abrirCompetidor(prov);
  };

  return (
    <div className="flex flex-col gap-4">
      <TableroCompetencia datos={datos} filas={conDatos} activa={tarjeta} alPulsar={setTarjeta} />
      {!tarjeta && <QueHacerHoy decisiones={decisiones} alAbrir={abrirCompetidor} />}
      {!tarjeta && <NuestrosFrente filas={posiciones} alAbrir={abrirCompetidor} plataforma={plataformaDe(datos.plataforma).nombre} />}
      {(!tarjeta || tarjeta === "novedades") && <Novedades alertas={datos.alertas} alAbrir={abrirNovedad} puedeEscribir={puedeEscribir} busquedas={datos.busquedas} />}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar un competidor o un producto"
          aria-label="Buscar un competidor o un producto"
          className={`${fieldClass} min-w-0 flex-[1_1_16rem]`}
        />
        <select aria-label="Ordenar competidores" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={`h-[34px] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`}>
          <option value="vendido">Más vendido (7 días)</option>
          <option value="iguales">Más productos iguales a los nuestros</option>
          <option value="productos">Más productos</option>
        </select>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        {competidores.length} de {datos.competidores.length} competidores
        {tarjeta && (
          <>
            <span>· {tituloTarjeta(tarjeta)}</span>
            <button type="button" onClick={() => setTarjeta(null)} className={`rounded px-1.5 py-0.5 text-primario hover:underline ${anilloFoco}`}>
              Quitar filtro
            </button>
          </>
        )}
      </p>
      <div className="flex flex-col gap-2">
        {competidores.map((c) => (
          <TarjetaCompetidor
            key={c.id}
            c={c}
            productos={porCompetidor.get(c.id) ?? []}
            nuestros={nuestros}
            abierto={abierto === c.id}
            alAlternar={() => setAbierto(abierto === c.id ? null : c.id)}
            busqueda={busqueda && !c.nombre.toLowerCase().includes(busqueda) ? busqueda : ""}
          />
        ))}
        {!competidores.length && <p className="rounded-[10px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Ningún competidor con estos filtros.</p>}
      </div>
    </div>
  );
}
