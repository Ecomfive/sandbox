// Gestión de tienda: lo que se lee de las órdenes de Finanzas (`ven_ordenes`, Portal AF4) para las tiendas que todavía no están conectadas a Shopify.
// Ver src/lib/tienda/ordenes-finanzas.ts. Solo lectura: nada de aquí escribe. Si las tablas de Finanzas no existen, no hay datos y las pantallas
// siguen como antes (vacías hasta conectar la tienda).

import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { fechaProgramada } from "./programado";
import { colaTelefono } from "./chat-tienda";
import { transportistaDe } from "./logistica";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { cargarPedidos, inicioPeriodo, type PedidoFila, type Tienda } from "./datos";
import { riesgoCliente } from "@/lib/ventas/operacion";
import { entradaDeOrden, estadoDesdeFinanzas, etiquetasDe, mismaTiendaUnidad, momentoDeFecha, nombreComparable, textoProductos, zonaDeEtiquetas, type LineaFinanzas } from "./ordenes-finanzas";
import { periodoDe, sumarDias, type EleccionPeriodo, type Periodo } from "./rango";
import type { EstadoPedido } from "./resumen";

/** Cómo queda cada `estado_entrega` de Finanzas en la pantalla (los demás, como «pendiente» o vacío, son nuevos o confirmados por la etiqueta). */
const ESTADO_DE_ENTREGA: Record<string, EstadoPedido> = { entregada: "entregado", en_transito: "en_camino", devuelta: "devuelto", cancelada: "cancelado", no_gestionada: "cancelado" };

/** Los `estado_entrega` que la base puede dejar afuera cuando solo se quieren esos estados (los pendientes siempre vienen: se separan después por la etiqueta). */
function excluirEstados(abiertos: EstadoPedido[]): string[] {
  return Object.entries(ESTADO_DE_ENTREGA)
    .filter(([, e]) => !abiertos.includes(e))
    .map(([k]) => k);
}

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

let pagoListo = false;
/** Si ya se corrió la migración 0295 (la forma de pago al recibir, `ven_ordenes.forma_pago_entrega`). Una vez que existe, no se vuelve a preguntar. */
export async function hayFormaPagoEntrega(supabase: SupabaseClient): Promise<boolean> {
  if (pagoListo) return true;
  const { error } = await supabase.from("ven_ordenes").select("forma_pago_entrega").limit(1);
  pagoListo = !error;
  return pagoListo;
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
  const unidadDe = new Map<string, string>();
  for (const t of sinConectar) {
    const u = unidades.find((x) => mismaTiendaUnidad(t.nombre, x.nombre as string))?.id as string | undefined;
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
  /** Sin la migración 0295 no vienen. */
  forma_pago_entrega?: string | null;
  despachada_en?: string | null;
  ven_ordenes_clientes: ClienteFila | ClienteFila[] | null;
}

interface ClienteFila {
  nombre: string | null;
  corregimiento: string | null;
  direccion: string | null;
  telefono?: string | null;
  telefono_clave: string | null;
  notas: string | null;
}

/** Si la base tiene `ven_historial_clientes` (migración 0322). */
let historialEnUna: boolean | null = null;

/**
 * El historial de cada cliente por su teléfono normalizado (`telefono_clave`), con todas sus órdenes (de cualquier fecha y tienda): cuántas tiene y cuántas
 * terminaron entregadas, devueltas o canceladas. De a 150 teléfonos por consulta, 6 a la vez.
 */
async function historialDeClientes(supabase: SupabaseClient, claves: string[]): Promise<Map<string, { total: number; entregadas: number; devueltas: number; canceladas: number }>> {
  const unicas = [...new Set(claves.filter(Boolean))];
  const mapa = new Map<string, { total: number; entregadas: number; devueltas: number; canceladas: number }>();
  if (!unicas.length) return mapa;
  // Con tiendas limitadas (17 nov 2026), el historial cuenta solo los pedidos de sus tiendas.
  const permitidas = await cargarTiendasPermitidas();
  // Con la migración 0322 (18 nov 2026), en una sola consulta (antes ~50 en Confirmación y Logística); sin ella, la forma de antes.
  if (historialEnUna !== false) {
    const { data, error } = await supabase.rpc("ven_historial_clientes", { claves: unicas, unidades: permitidas });
    if (!error) {
      historialEnUna = true;
      for (const [k, v] of Object.entries((data ?? {}) as Record<string, { total: number; entregadas: number; devueltas: number; canceladas: number }>)) mapa.set(k, v);
      return mapa;
    }
    if (/ven_historial_clientes|function|schema cache/i.test(error.message)) historialEnUna = false;
  }
  const tandas: string[][] = [];
  for (let i = 0; i < unicas.length; i += 150) tandas.push(unicas.slice(i, i + 150));
  for (let i = 0; i < tandas.length; i += 6) {
    const respuestas = await Promise.all(
      tandas.slice(i, i + 6).map((t) => supabase.from("ven_ordenes_clientes").select("telefono_clave, ven_ordenes(estado_entrega, unidad_id)").in("telefono_clave", t).limit(5000)),
    );
    for (const { data } of respuestas)
      for (const r of (data ?? []) as { telefono_clave: string; ven_ordenes: { estado_entrega: string | null; unidad_id: string | null } | { estado_entrega: string | null; unidad_id: string | null }[] | null }[]) {
        const o = Array.isArray(r.ven_ordenes) ? r.ven_ordenes[0] : r.ven_ordenes;
        if (!puedeVerUnidad(permitidas, o?.unidad_id ?? null)) continue;
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

/**
 * Las órdenes de Finanzas de esas tiendas entre `desde` y `hasta` (días AAAA-MM-DD), con sus unidades, como pedidos de la pantalla; y sus líneas.
 * `liviano` (18 nov 2026, velocidad de Gestión de tienda): sin la foto de cada pedido ni el historial de cada cliente (riesgo y pedidos del cliente), que
 * el tablero «Todas las tiendas» y el Dashboard no muestran: eran la mitad de las consultas.
 */
export async function cargarPedidosFinanzas(
  supabase: SupabaseClient,
  fuente: FuenteFinanzas,
  tiendaIds: string[],
  desde: string,
  hasta: string,
  { liviano = false, abiertos }: { liviano?: boolean; abiertos?: EstadoPedido[] } = {},
): Promise<{ pedidos: PedidoFila[]; lineas: LineaFinanzas[] }> {
  const tiendaDeUnidad = new Map<string, string>();
  for (const id of tiendaIds) {
    const u = fuente.unidadDe.get(id);
    if (u) tiendaDeUnidad.set(u, id);
  }
  if (!tiendaDeUnidad.size) return { pedidos: [], lineas: [] };
  const unidades = [...tiendaDeUnidad.keys()];
  // Con la migración 0276, también la hora de Shopify (un texto armado: por eso se declara como `string`).
  const columnas: string = `id, unidad_id, numero, fecha, estado_entrega, etiquetas, total, moneda, transportista, guia, origen, ${(await hayHoraDeShopify(supabase)) ? "creado_origen, " : ""}${(await hayFormaPagoEntrega(supabase)) ? "forma_pago_entrega, despachada_en, " : ""}ven_ordenes_clientes(nombre, corregimiento, direccion, telefono, telefono_clave, notas)`;
  // Los pedidos y sus líneas (18 nov 2026, velocidad de Gestión de tienda): con la migración 0321, cada uno en una sola respuesta de la base
  // (`ven_pedidos_periodo` / `ven_lineas_periodo`); sin ella, los pedidos de a 1.000 y las líneas por número de pedido (antes se cruzaban con los pedidos
  // página por página y cada página tardaba ~1,6 s). Las fotos de las variantes, a la vez.
  const fotos = liviano
    ? Promise.resolve([] as { sku: string | null; producto_titulo: string | null; foto_url: string }[])
    : supabase
        .from("tienda_variantes")
        .select("sku, producto_titulo, foto_url")
        .in("tienda_id", [...tiendaDeUnidad.values()])
        .not("foto_url", "is", null)
        .then((r) => (r.data ?? []) as { sku: string | null; producto_titulo: string | null; foto_url: string }[]);
  const enUna = await pedidosYLineasEnUna(supabase, unidades, desde, hasta, abiertos);
  const [todas, variantesFoto] = await Promise.all([
    enUna ? Promise.resolve(enUna.ordenes) : traerTodasLasFilas<FilaOrden>(
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
    fotos,
  ]);
  // `abiertos` (18 nov 2026, la cola de Logística y Confirmación): solo los de Shopify en esos estados. La base ya los filtra (migración 0323); esto deja
  // afuera lo que la base no separa (nuevo o confirmado salen de la etiqueta) y todo lo demás si la migración no está.
  const ordenes = abiertos ? todas.filter((o) => !!o.creado_origen && abiertos.includes(estadoDesdeFinanzas(o.estado_entrega, o.etiquetas))) : todas;
  const quedan = abiertos && ordenes.length !== todas.length ? new Set(ordenes.map((o) => o.id)) : null;
  const lineas = enUna ? (quedan ? enUna.lineas.filter((l) => quedan.has(l.pedidoId)) : enUna.lineas) : await lineasDeOrdenes(supabase, ordenes.map((o) => o.id));
  // La foto de cada pedido (12 nov 2026, como Mi Reto Digital): la de la variante de Shopify con el SKU de su primera línea.
  // Si no la encuentra por el SKU (Shopify le cambió el SKU a la variante y los pedidos viejos traen el de antes: «CAPS.MULTI.COLLAGEN.COMPLEX»), por el nombre
  // del producto en Shopify (12 nov 2026: el Multi Collagen salía con y sin foto siendo el mismo).
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
  const historial = liviano ? new Map<string, { total: number; entregadas: number; devueltas: number; canceladas: number }>() : await historialDeClientes(supabase, ordenes.map((o) => clienteDe(o)?.telefono_clave ?? ""));
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
    // Los 4 últimos dígitos del teléfono: con eso (y el nombre) se cruzan los chats de iComfly, que dan el número oculto (13 nov 2026).
    colaTel: colaTelefono(clienteDe(o)?.telefono),
    provincia: zonaDeEtiquetas(o.etiquetas),
    ciudad: clienteDe(o)?.corregimiento ?? null,
    moneda: o.moneda ?? "USD",
    total: Number(o.total) || 0,
    unidades: unidadesDe.get(o.id) ?? 0,
    estado: estadoDesdeFinanzas(o.estado_entrega, o.etiquetas),
    // La transportista guardada o la de la etiqueta de zona («INTERIOR/SERVIENTREGA» → Servientrega).
    transportista: transportistaDe(o.transportista, o.etiquetas),
    guia: o.guia,
    // Cómo pagó al recibir (Monday) y cuándo salió (Shopify, Monday o Servientrega), 14 nov 2026.
    pagoEntrega: o.forma_pago_entrega ?? null,
    despachadoEn: o.despachada_en ?? null,
  }));
  return { pedidos, lineas };
}

type FilaLinea = { orden_id: string; linea: number; producto: string | null; cantidad: number | null; precio: number | null; sku: string | null; sku_maestro_id: string | null; es_servicio: boolean | null };
const comoLinea = (l: FilaLinea): LineaFinanzas => ({
  pedidoId: l.orden_id,
  titulo: l.producto ?? "(sin nombre)",
  skuId: l.sku_maestro_id,
  cantidad: Number(l.cantidad) || 0,
  precio: l.precio === null ? null : Number(l.precio),
  sku: l.sku,
  esServicio: l.es_servicio === true,
});

/** Si la base tiene las funciones de la migración 0321 (se pregunta hasta que respondan bien una vez o digan que no existen). */
let enUnaDisponible: boolean | null = null;

/** Si esas funciones ya reciben los filtros de la migración 0323 (`solo_shopify`, `excluir`). */
let filtroDisponible: boolean | null = null;

/**
 * Los pedidos (con su cliente) y las líneas de esas unidades entre esos días, en dos respuestas de la base (migración 0321); null si no están. Con
 * `abiertos`, la base ya deja afuera los del Excel y los estados cerrados que no se piden (migración 0323); sin ella, trae todo (se filtra después).
 */
async function pedidosYLineasEnUna(
  supabase: SupabaseClient,
  unidades: string[],
  desde: string,
  hasta: string,
  abiertos?: EstadoPedido[],
): Promise<{ ordenes: FilaOrden[]; lineas: LineaFinanzas[] } | null> {
  if (enUnaDisponible === false) return null;
  if (abiertos && filtroDisponible !== false) {
    const args = { unidades, desde, hasta, solo_shopify: true, excluir: excluirEstados(abiertos) };
    const [o, l] = await Promise.all([supabase.rpc("ven_pedidos_periodo", args), supabase.rpc("ven_lineas_periodo", args)]);
    if (!o.error && !l.error) {
      filtroDisponible = enUnaDisponible = true;
      return { ordenes: (o.data ?? []) as FilaOrden[], lineas: ((l.data ?? []) as FilaLinea[]).map(comoLinea) };
    }
    // Sin la migración 0323 la base no conoce los filtros: se sigue con la forma de 3 datos (y no se vuelve a probar hasta que se reinicie el servidor).
    filtroDisponible = false;
  }
  const args = { unidades, desde, hasta };
  const [o, l] = await Promise.all([supabase.rpc("ven_pedidos_periodo", args), supabase.rpc("ven_lineas_periodo", args)]);
  if (o.error || l.error) {
    if (/ven_pedidos_periodo|ven_lineas_periodo|function|schema cache/i.test(`${o.error?.message ?? ""} ${l.error?.message ?? ""}`)) enUnaDisponible = false;
    return null;
  }
  enUnaDisponible = true;
  return { ordenes: (o.data ?? []) as FilaOrden[], lineas: ((l.data ?? []) as FilaLinea[]).map(comoLinea) };
}

/** Las líneas de esos pedidos, por su número (la llave de la tabla): de a 300 pedidos por consulta, 6 a la vez, en el orden de los pedidos. */
export async function lineasDeOrdenes(supabase: SupabaseClient, ordenIds: string[]): Promise<LineaFinanzas[]> {
  const tandas: string[][] = [];
  for (let i = 0; i < ordenIds.length; i += 300) tandas.push(ordenIds.slice(i, i + 300));
  const filas: FilaLinea[] = [];
  for (let i = 0; i < tandas.length; i += 6) {
    const rs = await Promise.all(
      tandas.slice(i, i + 6).map((t) => supabase.from("ven_orden_lineas").select("orden_id, linea, producto, cantidad, precio, sku, sku_maestro_id, es_servicio").in("orden_id", t).order("orden_id").order("linea").limit(10000)),
    );
    for (const r of rs) filas.push(...((r.data ?? []) as FilaLinea[]));
  }
  return filas.map(comoLinea);
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
  /**
   * `comparar`: también el periodo anterior del mismo largo (Dashboard); `minDias`: traer al menos esos días hasta hoy (la cola de Confirmación y
   * Logística). `abiertos` (18 nov 2026, velocidad): de esos días fuera del periodo, solo los de Shopify en esos estados; el periodo va completo.
   * `periodoLiviano` (con `abiertos`): el periodo sin fotos ni historial de clientes (solo se cuenta); los abiertos, que se listan, van completos.
   */
  opciones: { comparar?: boolean; minDias?: number; liviano?: boolean; abiertos?: EstadoPedido[]; periodoLiviano?: boolean } = {},
): Promise<{ pedidos: PedidoFila[]; lineasFinanzas: LineaFinanzas[]; fuente: FuenteFinanzas; referencia: Date; periodo: Periodo & { hoy: string } }> {
  const fuente = await fuenteFinanzas(supabase, miradas, codigoPais);
  // Una foto (todo sale del Excel y ninguna tienda está conectada): los periodos terminan en su último día. Con una conectada, en hoy.
  const soloFinanzas = miradas.length > 0 && miradas.every((t) => fuente.unidadDe.has(t.id) && t.estado !== "conectada");
  const referencia = soloFinanzas && fuente.hasta ? new Date(momentoDeFecha(fuente.hasta)) : new Date();
  const hoy = inicioPeriodo(1, referencia);
  const periodo = periodoDe(eleccion, hoy);
  let desde = opciones.comparar ? sumarDias(periodo.desde, -periodo.dias) : periodo.desde;
  let hasta = periodo.hasta;
  const ids = miradas.map((t) => t.id);
  const soloShopify = ids.filter((id) => !fuente.unidadDe.has(id));
  // La cola con `abiertos`: el periodo completo y, aparte, los abiertos de los `minDias` (antes, todo lo de esos días: 9.146 pedidos el 18 nov para usar ~3.900).
  if (opciones.minDias && opciones.abiertos) {
    const abiertos = opciones.abiertos;
    const minimo = sumarDias(hoy, -(opciones.minDias - 1));
    // El periodo liviano solo si cabe entero en los días de la cola: así todo abierto del periodo viene también completo en la cola.
    const periodoLiviano = !!opciones.liviano || (!!opciones.periodoLiviano && desde >= minimo);
    const [deShopify, deFinanzas, colaShopify, colaFinanzas] = await Promise.all([
      cargarPedidos(supabase, soloShopify, desde, hasta),
      cargarPedidosFinanzas(supabase, fuente, ids, desde, hasta, { liviano: periodoLiviano }),
      cargarPedidos(supabase, soloShopify, minimo, hoy),
      cargarPedidosFinanzas(supabase, fuente, ids, minimo, hoy, { liviano: opciones.liviano, abiertos }),
    ]);
    // Si un pedido está en los dos, vale el de la cola (va completo aunque el periodo sea liviano).
    const cola = [...colaShopify.filter((p) => !p.sinHora && abiertos.includes(p.estado)), ...colaFinanzas.pedidos];
    const enCola = new Set(cola.map((p) => p.id));
    const pedidos = [...[...deShopify, ...deFinanzas.pedidos].filter((p) => !enCola.has(p.id)), ...cola].sort((x, y) => y.creado.localeCompare(x.creado));
    const lineasFinanzas = [...deFinanzas.lineas.filter((l) => !enCola.has(l.pedidoId)), ...colaFinanzas.lineas];
    return { pedidos, lineasFinanzas, fuente, referencia, periodo: { ...periodo, hoy } };
  }
  if (opciones.minDias) {
    const minimo = sumarDias(hoy, -(opciones.minDias - 1));
    if (minimo < desde) desde = minimo;
    hasta = hoy;
  }
  const [deShopify, deFinanzas] = await Promise.all([
    cargarPedidos(supabase, soloShopify, desde, hasta),
    cargarPedidosFinanzas(supabase, fuente, ids, desde, hasta, { liviano: opciones.liviano }),
  ]);
  const pedidos = [...deShopify, ...deFinanzas.pedidos].sort((x, y) => y.creado.localeCompare(x.creado));
  return { pedidos, lineasFinanzas: deFinanzas.lineas, fuente, referencia, periodo: { ...periodo, hoy } };
}
