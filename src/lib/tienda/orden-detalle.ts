// El detalle de una orden de tienda (de `ven_ordenes`: Excel de Finanzas o Shopify en vivo), para la ficha lateral de Pedidos y para su página
// (12 nov 2026). Solo lectura. Solo órdenes de tiendas del país que se pide (si no, null).

import type { SupabaseClient } from "@supabase/supabase-js";
import { datosAsistente, evaluarAsistente, type Asistente } from "./asistente";
import { costosDeProductos, cuentasDelPedido, type CostoProducto, type IngresosYCostos } from "./costos";
import { hayHoraDeShopify } from "./datos-finanzas";
import { nombreComparable } from "./ordenes-finanzas";

export interface OrdenFinanzas {
  numero: string | null;
  fecha: string;
  estado_entrega: string | null;
  etiquetas: string | null;
  subtotal: number | null;
  descuento: number | null;
  envio: number | null;
  total: number | null;
  estado_pago: string | null;
  forma_pago_texto: string | null;
  transportista: string | null;
  guia: string | null;
  fecha_envio: string | null;
  fecha_devolucion: string | null;
  resultado_courier: string | null;
  motivo_cancelacion: string | null;
  origen: string | null;
  /** La hora en que se creó en Shopify (migración 0276); null en las del Excel. */
  creado_origen?: string | null;
  /** Cuándo entró al sistema. */
  creado_en?: string | null;
  /** El ciclo de la orden (migración 0956): fase y cuándo se confirmó, despachó y entregó; lo cobrado contra entrega. */
  fase?: string | null;
  confirmada_en?: string | null;
  confirmada_por?: string | null;
  despachada_en?: string | null;
  entregada_en?: string | null;
  cod_esperado?: number | null;
  cod_cobrado?: number | null;
  metodo_pago?: string | null;
}

/** Un cambio registrado en la orden (`ven_orden_eventos`): de qué fase a cuál, quién y por qué. */
export interface EventoOrden {
  tipo: string;
  fase_antes: string | null;
  fase_despues: string | null;
  detalle: string | null;
  usuario: string | null;
  creado_en: string;
}

/** Lo que Monday (ciudad) o Servientrega (interior, SISCORE) tienen registrado del pedido (13 nov 2026). */
export interface EntregaOrden {
  fuente: "monday" | "siscore";
  grupo: string;
  estado: string | null;
  fecha: string | null;
  repartidor: string | null;
  causa: string | null;
  guia: string | null;
  destino?: string | null;
  visitas?: number;
  /** Servientrega: el rastreo de la guía, del primero al último. */
  rastreo?: { fecha: string | null; hora: string | null; estado: string }[];
}

/** La conversación de WhatsApp del cliente en el CRM (por su teléfono), con los últimos mensajes. Solo lectura. */
export interface WhatsappOrden {
  conversacionId: string;
  nombre: string | null;
  mensajes: { id: string; entrante: boolean; texto: string | null; tipo: string | null; momento: string; autor: string | null }[];
}

export interface ClienteOrdenFinanzas {
  nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  corregimiento: string | null;
  notas: string | null;
}

export interface LineaOrdenFinanzas {
  linea: number;
  producto: string | null;
  cantidad: number | null;
  precio: number | null;
  es_servicio: boolean | null;
  sku_maestro_id?: string | null;
  skus_maestros: { codigo: string; nombre: string } | null;
  /** El costo por unidad del producto nuestro en el país (y de dónde salió), si se sabe. */
  costo?: CostoProducto | null;
}

/** Una nota del equipo en el pedido (`ven_orden_notas`, la misma tabla del portal de Finanzas). No va a Shopify. */
export interface NotaOrden {
  id: string;
  texto: string;
  autor: string | null;
  creado_en: string;
}

export interface OrdenTienda {
  id: string;
  o: OrdenFinanzas;
  lineas: LineaOrdenFinanzas[];
  cliente: ClienteOrdenFinanzas | null;
  /** El estado de entrega de los otros pedidos del mismo cliente. */
  anteriores: (string | null)[];
  /** El pedido en el admin de Shopify (solo si llegó de Shopify y la tienda está conectada). */
  enShopify: string | null;
  /** El nombre de la tienda como está en Tiendas («Kenku»). */
  tienda: string;
  /** «Ingresos y costos» (12 nov 2026): venta, costo de los productos, fulfillment, flete y margen. */
  cuentas: IngresosYCostos;
  /** Las notas del equipo, de la más vieja a la más nueva (12 nov 2026). */
  notas: NotaOrden[];
  /** Lo que pasó con la orden, del más nuevo al más viejo (13 nov 2026). */
  eventos: EventoOrden[];
  /** Lo que dicen Monday o Servientrega; null si ninguno lo tiene. */
  entrega: EntregaOrden | null;
  /** El chat de WhatsApp del cliente, si escribió a algún número del sistema. */
  whatsapp: WhatsappOrden | null;
  /** El asistente de confirmación (13 nov 2026): riesgo, dirección, transportadora y conversación, con lo registrado. */
  asistente: Asistente | null;
}

export async function cargarOrdenTienda(supabase: SupabaseClient, id: string, paisId: string): Promise<OrdenTienda | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  // Con la migración 0276, también la hora de Shopify (texto armado: se declara como `string`).
  const columnas: string = `numero, fecha, estado_entrega, etiquetas, subtotal, descuento, envio, total, estado_pago, forma_pago_texto, transportista, guia, fecha_envio, fecha_devolucion, resultado_courier, motivo_cancelacion, origen, costo_envio, costo_envio_real, fase, confirmada_en, confirmada_por, despachada_en, entregada_en, cod_esperado, cod_cobrado, metodo_pago, unidad_id, ${(await hayHoraDeShopify(supabase)) ? "creado_origen, " : ""}creado_en, fin_unidades(nombre, pais_id, clase, tarifa_fulfillment)`;
  const { data: crudo } = await supabase.from("ven_ordenes").select(columnas).eq("id", id).maybeSingle();
  const o = crudo as unknown as (OrdenFinanzas & { fin_unidades: unknown; costo_envio?: number | null; costo_envio_real?: number | null }) | null;
  const unidad = (o?.fin_unidades ?? null) as { nombre: string; pais_id: string; clase: string; tarifa_fulfillment: number | null } | null;
  if (!o || !unidad || unidad.clase !== "tienda" || unidad.pais_id !== paisId) return null;
  const [{ data: lineas }, { data: tiendasPais }, { data: cliente }, { data: notas }, eventos, entrega] = await Promise.all([
    supabase.from("ven_orden_lineas").select("linea, producto, cantidad, precio, es_servicio, sku_maestro_id, skus_maestros(codigo, nombre)").eq("orden_id", id).order("linea"),
    supabase.from("tiendas").select("nombre, dominio").eq("pais_id", paisId),
    supabase.from("ven_ordenes_clientes").select("nombre, telefono, direccion, corregimiento, notas, telefono_clave").eq("orden_id", id).maybeSingle(),
    supabase.from("ven_orden_notas").select("id, texto, autor, creado_en").eq("orden_id", id).order("creado_en").limit(200),
    supabase
      .from("ven_orden_eventos")
      .select("tipo, fase_antes, fase_despues, detalle, usuario, creado_en")
      .eq("orden_id", id)
      .order("creado_en", { ascending: false })
      .limit(100)
      .then((r) => (r.error ? [] : ((r.data ?? []) as EventoOrden[]))),
    entregaDeOrden(supabase, id),
  ]);
  // Los otros pedidos del mismo cliente (por su teléfono normalizado), como en Mi Reto Digital: cuántos y cuántos se entregaron.
  const clave = (cliente as { telefono_clave?: string | null } | null)?.telefono_clave ?? null;
  const { data: otros } = clave
    ? await supabase.from("ven_ordenes_clientes").select("orden_id, ven_ordenes(estado_entrega)").eq("telefono_clave", clave).neq("orden_id", id).limit(200)
    : { data: [] };
  const anteriores = (otros ?? []).map((x) => {
    const r = (Array.isArray(x.ven_ordenes) ? x.ven_ordenes[0] : x.ven_ordenes) as { estado_entrega: string | null } | null;
    return r?.estado_entrega ?? null;
  });
  const tiendaSistema = (tiendasPais ?? []).find((t) => nombreComparable(t.nombre as string) === nombreComparable(unidad.nombre));
  const dominio = (tiendaSistema?.dominio as string | null | undefined) ?? null;
  const enShopify = o.origen === "shopify" && dominio && o.numero ? `https://${dominio}/admin/orders?query=${encodeURIComponent(String(o.numero).replace(/^#/, ""))}` : null;
  // Ingresos y costos: el costo de cada producto en el país (el costo promedio de compra del producto: del país o, si no hay, de todos), el fulfillment de la unidad y el flete del pedido.
  const lineasT = (lineas ?? []) as unknown as LineaOrdenFinanzas[];
  const costos = await costosDeProductos(supabase, lineasT.map((l) => l.sku_maestro_id ?? "").filter(Boolean), paisId);
  for (const l of lineasT) l.costo = l.sku_maestro_id ? (costos.get(l.sku_maestro_id) ?? null) : null;
  const flete = Number(o.costo_envio_real) > 0 ? Number(o.costo_envio_real) : Number(o.costo_envio) > 0 ? Number(o.costo_envio) : null;
  const cuentas = cuentasDelPedido(
    Number(o.total) || 0,
    lineasT.map((l) => ({ skuId: l.sku_maestro_id ?? null, cantidad: Number(l.cantidad) || 0, esServicio: l.es_servicio === true })),
    costos,
    unidad.tarifa_fulfillment === null || unidad.tarifa_fulfillment === undefined ? null : Number(unidad.tarifa_fulfillment),
    flete,
  );
  const orden: OrdenFinanzas & { fin_unidades?: unknown; costo_envio?: unknown; costo_envio_real?: unknown } = { ...o };
  delete orden.fin_unidades;
  delete orden.costo_envio;
  delete orden.costo_envio_real;
  delete (orden as { unidad_id?: unknown }).unidad_id;
  const datosCliente: ClienteOrdenFinanzas & { telefono_clave?: string | null } = { ...((cliente ?? {}) as ClienteOrdenFinanzas & { telefono_clave?: string | null }) };
  delete datosCliente.telefono_clave;
  const whatsapp = await whatsappDeCliente(supabase, (cliente as { telefono?: string | null } | null)?.telefono ?? null).catch(() => null);
  const unidadId = (o as { unidad_id?: string }).unidad_id ?? null;
  const ultimoDelCliente = whatsapp?.mensajes.filter((m) => m.entrante).at(-1)?.momento ?? null;
  const asistente = unidadId
    ? await datosAsistente(supabase, unidadId, {
        fase: o.fase ?? null,
        etiquetas: o.etiquetas,
        cliente: cliente ? { nombre: cliente.nombre as string | null, telefono: cliente.telefono as string | null, direccion: cliente.direccion as string | null, corregimiento: cliente.corregimiento as string | null } : null,
        anteriores,
        whatsapp: { existe: !!whatsapp, ultimoDelCliente },
      })
        .then(evaluarAsistente)
        .catch(() => null)
    : null;
  return {
    id,
    o: orden,
    lineas: lineasT,
    cliente: cliente ? (datosCliente as ClienteOrdenFinanzas) : null,
    anteriores,
    enShopify,
    tienda: ((tiendaSistema?.nombre as string | undefined) ?? unidad.nombre) as string,
    cuentas,
    notas: (notas ?? []) as NotaOrden[],
    eventos,
    entrega,
    whatsapp,
    asistente,
  };
}

/** Lo último que tienen Monday o Servientrega del pedido (la guía manda: es de interior). Sin sus tablas, null. */
async function entregaDeOrden(supabase: SupabaseClient, id: string): Promise<EntregaOrden | null> {
  const [g, m] = await Promise.all([
    supabase.from("tienda_guias").select("guia, estado, estado_grupo, fecha_estado, fecha_emision, ultimo_motivo, visitas_sin_entregar, destino, historial").eq("orden_id", id).order("fecha_emision", { ascending: false }).limit(1),
    supabase.from("mon_despachos").select("estado, estado_grupo, courier, causa_rechazo, fecha_despacho, fecha_entrega, actualizado_monday").eq("orden_id", id).order("actualizado_monday", { ascending: false }).limit(1),
  ]);
  const guia = g.error ? null : (g.data?.[0] as Record<string, unknown> | undefined);
  if (guia) {
    const historial = Array.isArray(guia.historial) ? (guia.historial as Record<string, unknown>[]) : [];
    return {
      fuente: "siscore",
      grupo: String(guia.estado_grupo),
      estado: (guia.estado as string | null) ?? null,
      fecha: (guia.fecha_estado as string | null) ?? null,
      repartidor: "Servientrega",
      causa: (guia.ultimo_motivo as string | null) ?? null,
      guia: String(guia.guia),
      destino: (guia.destino as string | null) ?? null,
      visitas: Number(guia.visitas_sin_entregar ?? 0),
      rastreo: historial.slice(0, 80).map((h) => ({ fecha: typeof h.fecha === "string" ? h.fecha : null, hora: typeof h.hora === "string" ? h.hora : null, estado: String(h.estado ?? "") })),
    };
  }
  const d = m.error ? null : (m.data?.[0] as Record<string, string | null> | undefined);
  if (!d) return null;
  return { fuente: "monday", grupo: String(d.estado_grupo), estado: d.estado, fecha: d.fecha_entrega ?? d.fecha_despacho, repartidor: d.courier, causa: d.causa_rechazo, guia: null };
}

/** El chat del cliente en el CRM: la conversación cuyo teléfono termina en los mismos 8 dígitos, con sus últimos 40 mensajes. */
async function whatsappDeCliente(supabase: SupabaseClient, telefono: string | null): Promise<WhatsappOrden | null> {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 7) return null;
  const { data: conv } = await supabase.from("whatsapp_conversaciones").select("id, nombre_perfil, nombre_personalizado").like("telefono", `%${digitos.slice(-8)}`).order("ultimo_mensaje_en", { ascending: false }).limit(1);
  const c = conv?.[0];
  if (!c) return null;
  const { data: msgs } = await supabase.from("whatsapp_mensajes").select("id, direccion, texto, tipo, momento, creado_en, autor_nombre").eq("conversacion_id", c.id).is("oculto_en", null).order("momento", { ascending: false }).limit(40);
  return {
    conversacionId: String(c.id),
    nombre: ((c.nombre_personalizado as string | null) || (c.nombre_perfil as string | null)) ?? null,
    mensajes: ((msgs ?? []) as Record<string, string | null>[])
      .map((x) => ({ id: String(x.id), entrante: x.direccion === "entrante", texto: x.texto, tipo: x.tipo, momento: String(x.momento ?? x.creado_en), autor: x.autor_nombre }))
      .reverse(),
  };
}
