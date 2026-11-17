// Reportería de pedidos: lo que se lee de Supabase (solo servidor; los permisos los revisa la página o la acción que llama). Un mes a la vez, todas
// las tiendas del país o una: los pedidos con sus líneas, el cliente, el costo (el de la Matriz o, si no lo trae, el de Compras) y lo editado a mano.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import type { EstadoEntrega } from "./matriz";
import type { FilaReporteria } from "./reporteria";

export const SIN_MIGRACION_REPORTERIA = "Falta correr la migración 0310 (Reportería de pedidos) en Supabase: las columnas de administración salen vacías.";

export interface TiendaReporteria {
  id: string;
  nombre: string;
}

/** Las tiendas del país (las unidades del libro de clase «tienda»). */
export async function tiendasReporteria(supabase: SupabaseClient, paisId: string): Promise<TiendaReporteria[]> {
  const { data } = await supabase.from("fin_unidades").select("id, nombre").eq("clase", "tienda").eq("pais_id", paisId).order("nombre");
  return (data ?? []).map((u) => ({ id: u.id as string, nombre: u.nombre as string }));
}

/** Los meses que tienen pedidos en esas tiendas, del más nuevo al más viejo (AAAA-MM), y las tiendas que tienen alguno. */
export async function mesesReporteria(supabase: SupabaseClient, unidades: string[]): Promise<{ meses: string[]; conPedidos: Set<string> }> {
  if (!unidades.length) return { meses: [], conPedidos: new Set() };
  const { data } = await supabase.from("ven_resumen_mensual").select("periodo, unidad_id").in("unidad_id", unidades);
  return {
    meses: [...new Set((data ?? []).map((r) => String(r.periodo).slice(0, 7)))].sort().reverse(),
    conPedidos: new Set((data ?? []).map((r) => r.unidad_id as string)),
  };
}

const COLS_BASE =
  "id, unidad_id, numero, fecha, origen, estado_pago, etiquetas, estado_entrega, transportista, fecha_envio, resultado_courier, motivo_cancelacion, forma_pago_texto, mes_gestion, total, facturado, factura_numero, fecha_devolucion, costo_envio";
const COLS_0310 =
  "estado_matriz, verificado, preparacion, courier_matriz, monto_envio, monto_envio_se, monto_pagado_delivery, delivery, cambio_monto, cambio_forma_pago, cambio_envio, fecha_devolucion_texto, bloque_facturado";
const COLS_REL = "ven_orden_lineas(linea, producto, sku, cantidad, costo_excel, es_servicio), ven_ordenes_clientes(nombre, telefono, direccion, corregimiento, notas";

type Orden = Record<string, unknown> & {
  ven_orden_lineas: { linea: number; producto: string | null; sku: string | null; cantidad: number | null; costo_excel: number | null; es_servicio: boolean }[] | null;
  ven_ordenes_clientes: Record<string, unknown> | Record<string, unknown>[] | null;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

/**
 * Los pedidos de un mes (`periodo` = AAAA-MM-01) de esas tiendas, una fila por línea. `faltaMigracion` si todavía no existen las columnas de 0310
 * (se lee igual, sin ellas).
 */
export async function cargarReporteria(
  supabase: SupabaseClient,
  tiendas: TiendaReporteria[],
  periodo: string,
): Promise<{ filas: FilaReporteria[]; faltaMigracion: boolean }> {
  if (!tiendas.length) return { filas: [], faltaMigracion: false };
  const unidades = tiendas.map((t) => t.id);
  const nombre = new Map(tiendas.map((t) => [t.id, t.nombre]));
  const leer = (cols: string) =>
    traerTodasLasFilas<Orden>((d, h) =>
      supabase.from("ven_ordenes").select(cols).in("unidad_id", unidades).eq("periodo", periodo).order("fecha", { ascending: false }).order("numero", { ascending: false }).range(d, h) as unknown as PromiseLike<{ data: Orden[] | null; error: unknown }>,
    );
  let faltaMigracion = false;
  let ordenes: Orden[];
  try {
    ordenes = await leer(`${COLS_BASE}, ${COLS_0310}, ${COLS_REL}, provincia)`);
  } catch {
    faltaMigracion = true;
    ordenes = await leer(`${COLS_BASE}, ${COLS_REL})`);
  }

  // El costo de Compras de cada línea (para las que la Matriz no trae «COSTO PRODUCTO») y lo editado a mano.
  const costoCompras = new Map<string, number>();
  const costos = await traerTodasLasFilas<{ orden_id: string; linea: number; costo: number | null; costo_fuente: string }>((d, h) =>
    supabase.from("ven_lineas_costo").select("orden_id, linea, costo, costo_fuente").in("unidad_id", unidades).eq("periodo", periodo).order("orden_id").order("linea").range(d, h) as unknown as PromiseLike<{
      data: { orden_id: string; linea: number; costo: number | null; costo_fuente: string }[] | null;
      error: unknown;
    }>,
  ).catch(() => []);
  for (const c of costos) if (c.costo !== null && c.costo_fuente === "costo_vigente") costoCompras.set(`${c.orden_id}:${c.linea}`, Number(c.costo));

  const editadas = new Map<string, string[]>();
  if (!faltaMigracion) {
    const ids = ordenes.map((o) => o.id as string);
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await supabase.from("ven_orden_ediciones").select("orden_id, campo").in("orden_id", ids.slice(i, i + 300));
      for (const e of data ?? []) editadas.set(e.orden_id as string, [...new Set([...(editadas.get(e.orden_id as string) ?? []), e.campo as string])]);
    }
  }

  const filas: FilaReporteria[] = [];
  for (const o of ordenes) {
    const c = (Array.isArray(o.ven_ordenes_clientes) ? o.ven_ordenes_clientes[0] : o.ven_ordenes_clientes) ?? {};
    const lineas = [...(o.ven_orden_lineas ?? [])].sort((a, b) => a.linea - b.linea);
    const id = o.id as string;
    for (const [k, l] of (lineas.length ? lineas : [null]).entries()) {
      const deCompras = l ? costoCompras.get(`${id}:${l.linea}`) : undefined;
      const costo = l?.costo_excel !== null && l?.costo_excel !== undefined ? Number(l.costo_excel) : (deCompras ?? null);
      filas.push({
        id: `${id}:${l?.linea ?? 1}`,
        ordenId: id,
        linea: k + 1,
        tiendaId: o.unidad_id as string,
        tienda: nombre.get(o.unidad_id as string) ?? "",
        fecha: String(o.fecha),
        numero: String(o.numero),
        origen: txt(o.origen),
        estadoShopify: txt(o.estado_pago),
        etiquetas: txt(o.etiquetas),
        preparacion: txt(o.preparacion),
        notas: txt(c.notas),
        cliente: txt(c.nombre),
        telefono: txt(c.telefono),
        provincia: txt(c.provincia),
        corregimiento: txt(c.corregimiento),
        direccion: txt(c.direccion),
        zona: zonaDeEtiquetas(txt(o.etiquetas)),
        producto: l?.producto ?? null,
        sku: l?.sku ?? null,
        cantidad: l ? num(l.cantidad) : null,
        venta: k === 0 ? num(o.total) : null,
        estado: o.estado_entrega as EstadoEntrega,
        estadoMatriz: txt(o.estado_matriz),
        verificado: txt(o.verificado),
        courier: txt(o.courier_matriz) ?? txt(o.transportista),
        fechaEnvio: txt(o.fecha_envio),
        resultado: txt(o.resultado_courier),
        motivo: txt(o.motivo_cancelacion),
        delivery: txt(o.delivery),
        formaPago: txt(o.forma_pago_texto),
        mesCobro: txt(o.mes_gestion),
        pagadoDelivery: num(o.monto_pagado_delivery),
        costo,
        costoFuente: l?.costo_excel !== null && l?.costo_excel !== undefined ? "matriz" : deCompras !== undefined ? "compras" : null,
        // Sin la migración 0310, el envío sale de la suma de siempre.
        montoEnvio: faltaMigracion ? num(o.costo_envio) : num(o.monto_envio),
        montoEnvioSe: num(o.monto_envio_se),
        devueltosSe: txt(o.fecha_devolucion),
        fechaDevolucion: txt(o.fecha_devolucion_texto),
        cambioMonto: num(o.cambio_monto),
        cambioFormaPago: txt(o.cambio_forma_pago),
        cambioEnvio: num(o.cambio_envio),
        facturado: o.facturado === true,
        factura: txt(o.factura_numero),
        bloque: txt(o.bloque_facturado),
        editadas: editadas.get(id) ?? [],
      });
    }
  }
  return { filas, faltaMigracion };
}

export interface Movimiento {
  id: string;
  ordenId: string;
  numero: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  quien: string | null;
  cuando: string;
}

/** Los últimos cambios hechos a mano en los pedidos de esas tiendas (la pestaña «MOVIMIENTOS» del Excel). */
export async function movimientosReporteria(supabase: SupabaseClient, unidades: string[], limite = 60): Promise<Movimiento[]> {
  if (!unidades.length) return [];
  const { data, error } = await supabase
    .from("ven_orden_ediciones")
    .select("id, orden_id, campo, antes, despues, usuario_nombre, creado_en, ven_ordenes!inner(numero, unidad_id)")
    .in("ven_ordenes.unidad_id", unidades)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) return [];
  return (data ?? []).map((m) => {
    const o = (Array.isArray(m.ven_ordenes) ? m.ven_ordenes[0] : m.ven_ordenes) as { numero: string } | null;
    return { id: m.id as string, ordenId: m.orden_id as string, numero: o?.numero ?? "", campo: m.campo as string, antes: (m.antes as string | null) ?? null, despues: (m.despues as string | null) ?? null, quien: (m.usuario_nombre as string | null) ?? null, cuando: m.creado_en as string };
  });
}
