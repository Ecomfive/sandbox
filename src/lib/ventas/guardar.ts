// Guarda en Supabase las órdenes leídas de la Matriz (ver `matriz.ts`). Lo usan la pantalla «Importar» de Ventas por
// tienda (en lotes, desde una Server Action) y el script `scripts/finanzas/importar-ventas.ts`. Recibe el cliente de
// Supabase: no decide permisos (eso lo hace quien lo llama). Prueba de `validarOrden` en `guardar.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { claveCatalogo } from "../finanzas/libro-excel";
import { ESTADOS_ENTREGA, METODOS_PAGO, type EstadoEntrega, type LineaVenta, type MetodoPago, type OrdenVenta } from "./matriz";

/** Órdenes por lote: con sus líneas y datos de cliente quedan lejos del límite de 1 MB de una Server Action. */
export const TAMANO_LOTE_VENTAS = 400;
export const MAX_LINEAS = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HUELLA = /^[0-9a-f]{24}$/;
const txt = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s === "" ? null : s;
};
const fecha = (v: unknown) => (typeof v === "string" && FECHA.test(v) ? v : null);
const monto = (v: unknown, max = 1_000_000): number | null => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};

/**
 * Revisa una orden que llega del navegador: no se confía en nada de lo que mandó. Devuelve la orden limpia o el motivo
 * por el que se rechaza.
 */
export function validarOrden(v: unknown): { ok: true; orden: OrdenVenta } | { ok: false; motivo: string } {
  if (!v || typeof v !== "object") return { ok: false, motivo: "fila vacía" };
  const o = v as Record<string, unknown>;
  const tienda = txt(o.tienda, 80);
  if (!tienda) return { ok: false, motivo: "sin tienda" };
  const numero = txt(o.numero, 40);
  if (!numero) return { ok: false, motivo: "sin número" };
  const f = fecha(o.fecha);
  if (!f) return { ok: false, motivo: "fecha inválida" };
  const periodo = typeof o.periodo === "string" && o.periodo === `${f.slice(0, 7)}-01` ? o.periodo : null;
  if (!periodo) return { ok: false, motivo: "mes inválido" };
  if (typeof o.origen_clave !== "string" || !HUELLA.test(o.origen_clave)) return { ok: false, motivo: "huella inválida" };
  const estado = ESTADOS_ENTREGA.includes(o.estado_entrega as EstadoEntrega) ? (o.estado_entrega as EstadoEntrega) : null;
  if (!estado) return { ok: false, motivo: "estado inválido" };
  const metodo = o.metodo_pago === null || o.metodo_pago === undefined ? null : METODOS_PAGO.includes(o.metodo_pago as MetodoPago) ? (o.metodo_pago as MetodoPago) : undefined;
  if (metodo === undefined) return { ok: false, motivo: "método de pago inválido" };
  const total = monto(o.total);
  if (total === null) return { ok: false, motivo: "total inválido" };
  if (!Array.isArray(o.lineas) || o.lineas.length === 0 || o.lineas.length > MAX_LINEAS) return { ok: false, motivo: "líneas inválidas" };
  const lineas: LineaVenta[] = [];
  for (const [k, l] of o.lineas.entries()) {
    if (!l || typeof l !== "object") return { ok: false, motivo: "línea inválida" };
    const x = l as Record<string, unknown>;
    const producto = txt(x.producto, 300);
    const clave = txt(x.producto_clave, 300);
    const cantidad = monto(x.cantidad, 100_000);
    if (!producto || !clave || !cantidad) return { ok: false, motivo: "línea inválida" };
    lineas.push({
      linea: k + 1,
      producto,
      producto_clave: clave,
      cantidad,
      sku: txt(x.sku, 80),
      costo_excel: x.costo_excel === null || x.costo_excel === undefined ? null : monto(x.costo_excel),
      es_servicio: x.es_servicio === true,
    });
  }
  const c = (o.cliente && typeof o.cliente === "object" ? o.cliente : {}) as Record<string, unknown>;
  return {
    ok: true,
    orden: {
      tienda,
      numero,
      fecha: f,
      periodo,
      estado_pago: txt(o.estado_pago, 30),
      estado_entrega: estado,
      metodo_pago: metodo,
      forma_pago_texto: txt(o.forma_pago_texto, 80),
      informe_servientrega: txt(o.informe_servientrega, 20),
      transportista: txt(o.transportista, 80),
      guia: txt(o.guia, 40),
      fecha_envio: fecha(o.fecha_envio),
      fecha_devolucion: fecha(o.fecha_devolucion),
      resultado_courier: txt(o.resultado_courier, 80),
      subtotal: monto(o.subtotal) ?? total,
      envio: monto(o.envio) ?? 0,
      descuento: monto(o.descuento) ?? 0,
      total,
      costo_envio: monto(o.costo_envio, 10_000) ?? 0,
      facturado: o.facturado === true,
      factura_numero: txt(o.factura_numero, 40),
      mes_gestion: txt(o.mes_gestion, 60),
      motivo_cancelacion: txt(o.motivo_cancelacion, 200),
      etiquetas: txt(o.etiquetas, 300),
      lineas,
      cliente: {
        nombre: txt(c.nombre, 200),
        telefono: txt(c.telefono, 40),
        direccion: txt(c.direccion, 500),
        corregimiento: txt(c.corregimiento, 200),
        notas: txt(c.notas, 500),
      },
      origen_clave: o.origen_clave,
      huella_contenido: typeof o.huella_contenido === "string" && HUELLA.test(o.huella_contenido) ? o.huella_contenido : "",
    },
  };
}

/** Las unidades del libro por nombre canónico; crea las que falten como tienda que no recibe reparto. */
async function unidades(supabase: SupabaseClient, nombres: string[]): Promise<{ mapa: Map<string, string>; nuevas: string[] }> {
  const leer = async () => {
    const { data, error } = await supabase.from("fin_unidades").select("id, nombre");
    if (error) throw new Error(`fin_unidades: ${error.message}`);
    return new Map((data ?? []).map((r) => [claveCatalogo(r.nombre as string), r.id as string]));
  };
  let mapa = await leer();
  const faltan = [...new Map(nombres.map((n) => [claveCatalogo(n), n])).values()].filter((n) => !mapa.has(claveCatalogo(n)));
  if (faltan.length) {
    const { error } = await supabase
      .from("fin_unidades")
      .upsert(faltan.map((nombre) => ({ nombre, clase: "tienda", recibe_reparto: false })), { onConflict: "nombre", ignoreDuplicates: true });
    if (error) throw new Error(`fin_unidades: ${error.message}`);
    mapa = await leer();
  }
  return { mapa, nuevas: faltan };
}

export interface ResultadoLoteVentas {
  nuevas: number;
  actualizadas: number;
  sinCambios: number;
  tiendasNuevas: string[];
}

/** Crea o actualiza (por huella) un lote de órdenes con sus líneas y sus datos de cliente. */
export async function guardarLoteOrdenes(supabase: SupabaseClient, origen: string, ordenes: OrdenVenta[]): Promise<ResultadoLoteVentas> {
  if (!ordenes.length) return { nuevas: 0, actualizadas: 0, sinCambios: 0, tiendasNuevas: [] };
  const { mapa, nuevas: tiendasNuevas } = await unidades(supabase, ordenes.map((o) => o.tienda));

  const previas = new Map<string, string | null>();
  const claves = ordenes.map((o) => o.origen_clave);
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase.from("ven_ordenes").select("origen_clave, huella_contenido").in("origen_clave", claves.slice(i, i + 100));
    if (error) throw new Error(`ven_ordenes: ${error.message}`);
    for (const r of data ?? []) previas.set(r.origen_clave as string, (r.huella_contenido as string | null) ?? null);
  }
  const aGuardar = ordenes.filter((o) => !o.huella_contenido || previas.get(o.origen_clave) !== o.huella_contenido);
  const sinCambios = ordenes.length - aGuardar.length;
  if (!aGuardar.length) return { nuevas: 0, actualizadas: 0, sinCambios, tiendasNuevas };

  const ahora = new Date().toISOString();
  const { data: guardadas, error } = await supabase
    .from("ven_ordenes")
    .upsert(
      aGuardar.map((o) => ({
        unidad_id: mapa.get(claveCatalogo(o.tienda))!,
        numero: o.numero,
        fecha: o.fecha,
        periodo: o.periodo,
        estado_pago: o.estado_pago,
        estado_entrega: o.estado_entrega,
        metodo_pago: o.metodo_pago,
        forma_pago_texto: o.forma_pago_texto,
        informe_servientrega: o.informe_servientrega,
        transportista: o.transportista,
        guia: o.guia,
        fecha_envio: o.fecha_envio,
        fecha_devolucion: o.fecha_devolucion,
        resultado_courier: o.resultado_courier,
        subtotal: o.subtotal,
        envio: o.envio,
        descuento: o.descuento,
        total: o.total,
        costo_envio: o.costo_envio,
        facturado: o.facturado,
        factura_numero: o.factura_numero,
        mes_gestion: o.mes_gestion,
        motivo_cancelacion: o.motivo_cancelacion,
        etiquetas: o.etiquetas,
        origen,
        origen_clave: o.origen_clave,
        huella_contenido: o.huella_contenido || null,
        actualizado_en: ahora,
      })),
      { onConflict: "origen_clave" },
    )
    .select("id, origen_clave");
  if (error) throw new Error(`ven_ordenes: ${error.message}`);
  const idDe = new Map((guardadas ?? []).map((r) => [r.origen_clave as string, r.id as string]));
  const ids = [...idDe.values()];

  // Las líneas se reemplazan enteras: la Matriz no tiene una llave por línea.
  for (let i = 0; i < ids.length; i += 100) {
    const { error: e } = await supabase.from("ven_orden_lineas").delete().in("orden_id", ids.slice(i, i + 100));
    if (e) throw new Error(`ven_orden_lineas: ${e.message}`);
  }
  const lineas = aGuardar.flatMap((o) =>
    o.lineas.map((l) => ({
      orden_id: idDe.get(o.origen_clave)!,
      linea: l.linea,
      producto: l.producto,
      producto_clave: l.producto_clave,
      cantidad: l.cantidad,
      sku: l.sku,
      costo_excel: l.costo_excel,
      es_servicio: l.es_servicio,
    })),
  );
  for (let i = 0; i < lineas.length; i += 1000) {
    const { error: e } = await supabase.from("ven_orden_lineas").insert(lineas.slice(i, i + 1000));
    if (e) throw new Error(`ven_orden_lineas: ${e.message}`);
  }
  const { error: ec } = await supabase.from("ven_ordenes_clientes").upsert(
    aGuardar.map((o) => ({ orden_id: idDe.get(o.origen_clave)!, ...o.cliente, actualizado_en: ahora })),
    { onConflict: "orden_id" },
  );
  if (ec) throw new Error(`ven_ordenes_clientes: ${ec.message}`);

  const actualizadas = aGuardar.filter((o) => previas.has(o.origen_clave)).length;
  return { nuevas: aGuardar.length - actualizadas, actualizadas, sinCambios, tiendasNuevas };
}

export interface MapeoProducto {
  producto_clave: string;
  producto: string;
  costo_clave: string;
}

/** Revisa una fila del mapeo que llega del navegador. */
export function validarMapeoProducto(v: unknown): MapeoProducto | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const producto_clave = txt(m.producto_clave, 300);
  const producto = txt(m.producto, 300);
  const costo_clave = txt(m.costo_clave, 300);
  if (!producto_clave || !producto || !costo_clave) return null;
  return { producto_clave, producto, costo_clave };
}

/** Guarda el mapeo nombre de tienda → producto de costo. Lo que se cargó a mano en el portal no se pisa. */
export async function guardarMapeoProductos(supabase: SupabaseClient, origen: string, mapeo: MapeoProducto[]): Promise<number> {
  if (!mapeo.length) return 0;
  const { data, error } = await supabase.from("ven_productos_mapeo").select("producto_clave").eq("origen", "manual");
  if (error) throw new Error(`ven_productos_mapeo: ${error.message}`);
  const manuales = new Set((data ?? []).map((r) => r.producto_clave as string));
  const filas = mapeo.filter((m) => !manuales.has(m.producto_clave)).map((m) => ({ ...m, origen, actualizado_en: new Date().toISOString() }));
  for (let i = 0; i < filas.length; i += 500) {
    const { error: e } = await supabase.from("ven_productos_mapeo").upsert(filas.slice(i, i + 500), { onConflict: "producto_clave" });
    if (e) throw new Error(`ven_productos_mapeo: ${e.message}`);
  }
  return filas.length;
}
