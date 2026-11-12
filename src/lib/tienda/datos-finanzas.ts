// Gestión de tienda: lo que se lee de las órdenes de Finanzas (`ven_ordenes`, Portal AF4) para las tiendas que todavía no están conectadas a Shopify.
// Ver src/lib/tienda/ordenes-finanzas.ts. Solo lectura: nada de aquí escribe. Si las tablas de Finanzas no existen, no hay datos y las pantallas
// siguen como antes (vacías hasta conectar la tienda).

import { fechaProgramada } from "./programado";
import { transportistaDe } from "./logistica";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { cargarPedidos, inicioPeriodo, type PedidoFila, type Tienda } from "./datos";
import { riesgoCliente } from "@/lib/ventas/operacion";
import { entradaDeOrden, estadoDesdeFinanzas, etiquetasDe, momentoDeFecha, nombreComparable, textoProductos, zonaDeEtiquetas, type LineaFinanzas } from "./ordenes-finanzas";
import { periodoDe, sumarDias, type EleccionPeriodo, type Periodo } from "./rango";

/**
 * Cuántos pedidos tiene el cliente y su riesgo: «medio» o «alto» por su historial, y «bajo» si no tiene nada en contra (12 nov 2026, pedido de Hernán: un cliente sin
 * pedidos anteriores sale «Bajo» en gris, como en Mi Reto Digital). Sin historial (sin teléfono), null en los dos.
 */
function datosDelCliente(h: { total: number; entregadas: number; devueltas: number; canceladas: number } | undefined): { pedidosCliente: number | null; riesgo: "bajo" | "medio" | "alto" | null } {
  if (!h) return { pedidosCliente: null, riesgo: null };
  const r = riesgoCliente({ entregadas: h.entregadas, devueltas: h.devueltas, canceladas: h.canceladas, fallidas: 0 });
  return { pedidosCliente: h.total, riesgo: r === "medio" || r === "alto" ? r : "bajo" };
}

/** De dónde salen los datos de las tiendas sin conectar: su unidad en Finanzas y hasta qué día llegan sus órdenes. */
export interface FuenteFinanzas {
  /** Tienda del sistema → su unidad en Finanzas (`fin_unidades`). Solo las que no están conectadas a Shopify. */
  unidadDe: Map<string, string>;
  /** El último día con órdenes (AAAA-MM-DD) de esas tiendas, o null si no tienen. */
  hasta: string | null;
  /** El archivo del que vienen (lo que dice `ven_ordenes.origen`). */
  origen: string | null;
}

let horaLista = false;
/** Si ya se corrió la migración 0276 (la hora de Shopify en `ven_ordenes.creado_origen`). Una vez que existe, no se vuelve a preguntar. */
export async function hayHoraDeShopify(supabase: SupabaseClient): Promise<boolean> {
  if (horaLista) return true;
  const { error } = await supabase.from("ven_ordenes").select("creado_origen").limit(1);
  horaLista = !error;
  return horaLista;
}

const SIN_FUENTE: FuenteFinanzas = { unidadDe: new Map(), hasta: null, origen: null };

/**
 * Las tiendas con órdenes en Finanzas: se emparejan por nombre (Kenku = KENKU) dentro del mismo país. También las conectadas a Shopify desde el 12 nov
 * 2026: sus pedidos en vivo entran a las mismas órdenes (`ven_ordenes`, origen «shopify»), así que se leen de ahí igual.
 */
export async function fuenteFinanzas(supabase: SupabaseClient, tiendas: Tienda[], codigoPais: string): Promise<FuenteFinanzas> {
  const sinConectar = tiendas;
  if (!sinConectar.length) return SIN_FUENTE;
  const { data: unidades, error } = await supabase.from("fin_unidades").select("id, nombre").eq("pais", codigoPais).eq("clase", "tienda").eq("activo", true);
  if (error || !unidades?.length) return SIN_FUENTE;
  const porNombre = new Map(unidades.map((u) => [nombreComparable(u.nombre as string), u.id as string]));
  const unidadDe = new Map<string, string>();
  for (const t of sinConectar) {
    const u = porNombre.get(nombreComparable(t.nombre));
    if (u) unidadDe.set(t.id, u);
  }
  if (!unidadDe.size) return SIN_FUENTE;
  const { data: ultima } = await supabase
    .from("ven_ordenes")
    .select("fecha, origen")
    .in("unidad_id", [...unidadDe.values()])
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima) return SIN_FUENTE;
  return { unidadDe, hasta: ultima.fecha as string, origen: (ultima.origen as string | null) ?? null };
}

interface FilaOrden {
  id: string;
  unidad_id: string;
  numero: string | null;
  fecha: string;
  estado_entrega: string | null;
  etiquetas: string | null;
  total: number | null;
  moneda: string | null;
  transportista: string | null;
  guia: string | null;
  origen: string | null;
  /** Sin la migración 0276 no viene. */
  creado_origen?: string | null;
  ven_ordenes_clientes: ClienteFila | ClienteFila[] | null;
}

interface ClienteFila {
  nombre: string | null;
  corregimiento: string | null;
  direccion: string | null;
  telefono_clave: string | null;
  notas: string | null;
}

/**
 * El historial de cada cliente por su teléfono normalizado (`telefono_clave`), con todas sus órdenes (de cualquier fecha y tienda): cuántas tiene y cuántas
 * terminaron entregadas, devueltas o canceladas. De a 150 teléfonos por consulta, 6 a la vez.
 */
async function historialDeClientes(supabase: SupabaseClient, claves: string[]): Promise<Map<string, { total: number; entregadas: number; devueltas: number; canceladas: number }>> {
  const unicas = [...new Set(claves.filter(Boolean))];
  const mapa = new Map<string, { total: number; entregadas: number; devueltas: number; canceladas: number }>();
  const tandas: string[][] = [];
  for (let i = 0; i < unicas.length; i += 150) tandas.push(unicas.slice(i, i + 150));
  for (let i = 0; i < tandas.length; i += 6) {
    const respuestas = await Promise.all(
      tandas.slice(i, i + 6).map((t) => supabase.from("ven_ordenes_clientes").select("telefono_clave, ven_ordenes(estado_entrega)").in("telefono_clave", t).limit(5000)),
    );
    for (const { data } of respuestas)
      for (const r of (data ?? []) as { telefono_clave: string; ven_ordenes: { estado_entrega: string | null } | { estado_entrega: string | null }[] | null }[]) {
        const o = Array.isArray(r.ven_ordenes) ? r.ven_ordenes[0] : r.ven_ordenes;
        const h = mapa.get(r.telefono_clave) ?? { total: 0, entregadas: 0, devueltas: 0, canceladas: 0 };
        h.total++;
        if (o?.estado_entrega === "entregada") h.entregadas++;
        else if (o?.estado_entrega === "devuelta") h.devueltas++;
        else if (o?.estado_entrega === "cancelada" || o?.estado_entrega === "no_gestionada") h.canceladas++;
        mapa.set(r.telefono_clave, h);
      }
  }
  return mapa;
}

/** Las órdenes de Finanzas de esas tiendas entre `desde` y `hasta` (días AAAA-MM-DD), con sus unidades, como pedidos de la pantalla; y sus líneas. */
export async function cargarPedidosFinanzas(
  supabase: SupabaseClient,
  fuente: FuenteFinanzas,
  tiendaIds: string[],
  desde: string,
  hasta: string,
): Promise<{ pedidos: PedidoFila[]; lineas: LineaFinanzas[] }> {
  const tiendaDeUnidad = new Map<string, string>();
  for (const id of tiendaIds) {
    const u = fuente.unidadDe.get(id);
    if (u) tiendaDeUnidad.set(u, id);
  }
  if (!tiendaDeUnidad.size) return { pedidos: [], lineas: [] };
  const unidades = [...tiendaDeUnidad.keys()];
  // Con la migración 0276, también la hora de Shopify (un texto armado: por eso se declara como `string`).
  const columnas: string = `id, unidad_id, numero, fecha, estado_entrega, etiquetas, total, moneda, transportista, guia, origen, ${(await hayHoraDeShopify(supabase)) ? "creado_origen, " : ""}ven_ordenes_clientes(nombre, corregimiento, direccion, telefono_clave, notas)`;
  const [ordenes, lineas] = await Promise.all([
    traerTodasLasFilas<FilaOrden>(
      (d, h) =>
        supabase
          .from("ven_ordenes")
          // El cliente está aparte, en `ven_ordenes_clientes` (lo trae el Excel y lo trae Shopify).
          .select(columnas)
          .in("unidad_id", unidades)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha", { ascending: false })
          .order("id")
          .range(d, h) as unknown as PromiseLike<{ data: FilaOrden[] | null; error: unknown }>,
    ).catch(() => [] as FilaOrden[]),
    cargarLineasFinanzas(supabase, unidades, desde, hasta),
  ]);
  // La foto de cada pedido (12 nov 2026, como Mi Reto Digital): la de la variante de Shopify con el SKU de su primera línea.
  // Si no la encuentra por el SKU (Shopify le cambió el SKU a la variante y los pedidos viejos traen el de antes: «CAPS.MULTI.COLLAGEN.COMPLEX»), por el nombre
  // del producto en Shopify (12 nov 2026: el Multi Collagen salía con y sin foto siendo el mismo).
  const { data: variantesFoto } = await supabase.from("tienda_variantes").select("sku, producto_titulo, foto_url").in("tienda_id", [...tiendaDeUnidad.values()]).not("foto_url", "is", null);
  const fotoDeSku = new Map((variantesFoto ?? []).filter((v) => v.sku).map((v) => [String(v.sku).trim().toLowerCase(), v.foto_url as string]));
  const fotoDeNombre = new Map<string, string>();
  for (const v of variantesFoto ?? []) {
    const k = nombreComparable(String(v.producto_titulo ?? ""));
    if (k && !fotoDeNombre.has(k)) fotoDeNombre.set(k, v.foto_url as string);
  }
  const fotoDe = new Map<string, string>();
  for (const l of lineas) if (!l.esServicio && !fotoDe.has(l.pedidoId)) {
    const f = (l.sku ? fotoDeSku.get(l.sku.trim().toLowerCase()) : undefined) ?? fotoDeNombre.get(nombreComparable(l.titulo));
    if (f) fotoDe.set(l.pedidoId, f);
  }
  const unidadesDe = new Map<string, number>();
  const productosDe = new Map<string, string[]>();
  for (const l of lineas) {
    if (l.esServicio) continue;
    unidadesDe.set(l.pedidoId, (unidadesDe.get(l.pedidoId) ?? 0) + l.cantidad);
    productosDe.set(l.pedidoId, [...(productosDe.get(l.pedidoId) ?? []), l.titulo]);
  }
  const clienteDe = (o: (typeof ordenes)[number]) => (Array.isArray(o.ven_ordenes_clientes) ? (o.ven_ordenes_clientes[0] ?? null) : o.ven_ordenes_clientes);
  // El historial de cada cliente: cuántos pedidos tiene y su riesgo (la regla de Finanzas, `riesgoCliente`).
  const historial = await historialDeClientes(supabase, ordenes.map((o) => clienteDe(o)?.telefono_clave ?? ""));
  const pedidos = ordenes.map((o) => ({
    id: o.id,
    tiendaId: tiendaDeUnidad.get(o.unidad_id) ?? "",
    numero: o.numero ?? "—",
    creado: o.creado_origen ?? momentoDeFecha(o.fecha),
    sinHora: !o.creado_origen,
    productos: textoProductos(productosDe.get(o.id) ?? []),
    productosLista: productosDe.get(o.id) ?? [],
    foto: fotoDe.get(o.id) ?? null,
    direccion: clienteDe(o)?.direccion ?? null,
    etiquetas: etiquetasDe(o.etiquetas),
    entrada: entradaDeOrden(o.origen, o.etiquetas),
    ...datosDelCliente(historial.get(clienteDe(o)?.telefono_clave ?? "")),
    // La fecha que pidió el cliente, de la nota del pedido (solo en los que llegan de Shopify: así la deja el equipo al confirmar).
    programado: o.origen === "shopify" ? fechaProgramada(clienteDe(o)?.notas, o.fecha) : null,
    cliente: clienteDe(o)?.nombre ?? null,
    provincia: zonaDeEtiquetas(o.etiquetas),
    ciudad: clienteDe(o)?.corregimiento ?? null,
    moneda: o.moneda ?? "USD",
    total: Number(o.total) || 0,
    unidades: unidadesDe.get(o.id) ?? 0,
    estado: estadoDesdeFinanzas(o.estado_entrega, o.etiquetas),
    // La transportista guardada o la de la etiqueta de zona («INTERIOR/SERVIENTREGA» → Servientrega).
    transportista: transportistaDe(o.transportista, o.etiquetas),
    guia: o.guia,
  }));
  return { pedidos, lineas };
}

/** Las líneas de las órdenes de esas unidades entre esos días (por la fecha de su orden). */
export async function cargarLineasFinanzas(supabase: SupabaseClient, unidades: string[], desde: string, hasta: string): Promise<LineaFinanzas[]> {
  if (!unidades.length) return [];
  const filas = await traerTodasLasFilas<{ orden_id: string; linea: number; producto: string | null; cantidad: number | null; precio: number | null; sku: string | null; sku_maestro_id: string | null; es_servicio: boolean | null }>((d, h) =>
    supabase
      .from("ven_orden_lineas")
      .select("orden_id, linea, producto, cantidad, precio, sku, sku_maestro_id, es_servicio, ven_ordenes!inner(unidad_id, fecha)")
      .in("ven_ordenes.unidad_id", unidades)
      .gte("ven_ordenes.fecha", desde)
      .lte("ven_ordenes.fecha", hasta)
      .order("orden_id")
      .order("linea")
      .range(d, h),
  ).catch(() => []);
  return filas.map((l) => ({
    pedidoId: l.orden_id,
    titulo: l.producto ?? "(sin nombre)",
    skuId: l.sku_maestro_id,
    cantidad: Number(l.cantidad) || 0,
    precio: l.precio === null ? null : Number(l.precio),
    sku: l.sku,
    esServicio: l.es_servicio === true,
  }));
}

/**
 * Los pedidos de las tiendas que se miran, de Shopify (las conectadas) y de Finanzas (las demás), y el día desde el que cuentan los periodos: si todo
 * sale de Finanzas, el último día con órdenes (es una foto); si no, hoy. El periodo es el elegido en la barra (`EleccionPeriodo`), con sus días ya calculados.
 */
export async function pedidosDeTiendas(
  supabase: SupabaseClient,
  miradas: Tienda[],
  codigoPais: string,
  eleccion: EleccionPeriodo,
  /** `comparar`: también el periodo anterior del mismo largo (Dashboard); `minDias`: traer al menos esos días hasta hoy (la cola de Confirmación). */
  opciones: { comparar?: boolean; minDias?: number } = {},
): Promise<{ pedidos: PedidoFila[]; lineasFinanzas: LineaFinanzas[]; fuente: FuenteFinanzas; referencia: Date; periodo: Periodo & { hoy: string } }> {
  const fuente = await fuenteFinanzas(supabase, miradas, codigoPais);
  // Una foto (todo sale del Excel y ninguna tienda está conectada): los periodos terminan en su último día. Con una conectada, en hoy.
  const soloFinanzas = miradas.length > 0 && miradas.every((t) => fuente.unidadDe.has(t.id) && t.estado !== "conectada");
  const referencia = soloFinanzas && fuente.hasta ? new Date(momentoDeFecha(fuente.hasta)) : new Date();
  const hoy = inicioPeriodo(1, referencia);
  const periodo = periodoDe(eleccion, hoy);
  let desde = opciones.comparar ? sumarDias(periodo.desde, -periodo.dias) : periodo.desde;
  let hasta = periodo.hasta;
  if (opciones.minDias) {
    const minimo = sumarDias(hoy, -(opciones.minDias - 1));
    if (minimo < desde) desde = minimo;
    hasta = hoy;
  }
  const ids = miradas.map((t) => t.id);
  const [deShopify, deFinanzas] = await Promise.all([
    cargarPedidos(
      supabase,
      ids.filter((id) => !fuente.unidadDe.has(id)),
      desde,
      hasta,
    ),
    cargarPedidosFinanzas(supabase, fuente, ids, desde, hasta),
  ]);
  const pedidos = [...deShopify, ...deFinanzas.pedidos].sort((x, y) => y.creado.localeCompare(x.creado));
  return { pedidos, lineasFinanzas: deFinanzas.lineas, fuente, referencia, periodo: { ...periodo, hoy } };
}
