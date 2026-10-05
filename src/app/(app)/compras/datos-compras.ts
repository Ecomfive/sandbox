import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { FilaCompra } from "./def-compras";

/** La cookie con la última vista elegida (todos, un país o Importadora), para que se mantenga al cambiar de pestaña. */
export const COOKIE_VISTA_COMPRAS = "compras-vista";

const COLUMNAS =
  "id, tipo, codigo, nombre, foto_url, etapa, estado, proveedor, cliente, tienda, track_id, orden, producto_relacionado, qty_total, monto_total, primer_pago, segundo_pago, pagado_a_proveedor, pago_pendiente, cobrado_cliente, pendiente_cliente, pago_cliente, cuenta_receptora, factura, financiamiento, revisado_aa, fecha_limite, fecha_llegada, fecha_pago_1, fecha_pago_2, fecha_envio, inconveniente, planificacion, documentos, notas, via_envio, prioridad, etiquetas, responsable_nombre, creador_nombre, descripcion, url_producto, paises_destino, fecha_inicio, cerrado_en, creado_en, paises(codigo), perfiles(nombre, email)";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const uno = <T,>(r: unknown): T | null => (Array.isArray(r) ? ((r[0] as T) ?? null) : ((r as T) ?? null));
const txt = (v: unknown) => (v as string | null) ?? null;

export interface DatosCompras {
  compras: FilaCompra[];
  paises: { id: string; codigo: string; nombre: string }[];
  /** 'todos', el código de un país o 'importacion'. */
  vista: string;
  error: boolean;
}

/**
 * Las compras de la vista pedida (`?ver=`, o la última elegida): todos los países, uno solo o Importadora (que nunca se
 * mezcla con las de un país). La usan Informe, Compras y Tiempos y fallas.
 */
export async function cargarCompras(ver: string | string[] | undefined): Promise<DatosCompras> {
  const supabase = createServiceClient();
  const { data: paisesBd } = await supabase.from("paises").select("id, codigo, nombre").order("nombre");
  const paises = (paisesBd ?? []) as DatosCompras["paises"];
  const guardada = (await cookies()).get(COOKIE_VISTA_COMPRAS)?.value;
  const pedido = typeof ver === "string" ? ver : (guardada ?? "todos");
  const vista = pedido === "importacion" || paises.some((p) => p.codigo === pedido) ? pedido : "todos";
  const paisVista = paises.find((p) => p.codigo === vista) ?? null;

  let filas: Record<string, unknown>[] = [];
  let error = false;
  try {
    filas = await traerTodasLasFilas<Record<string, unknown>>((desde, hasta) => {
      let q = supabase.from("wms_compras").select(COLUMNAS);
      if (vista === "importacion") q = q.eq("tipo", "importacion");
      else if (paisVista) q = q.eq("tipo", "pais").eq("pais_id", paisVista.id);
      else q = q.eq("tipo", "pais");
      return q.order("creado_en", { ascending: false }).range(desde, hasta);
    });
  } catch {
    error = true;
  }

  const compras: FilaCompra[] = filas.map((c) => {
    const asignado = uno<{ nombre: string | null; email: string }>(c.perfiles);
    return {
      id: String(c.id),
      tipo: String(c.tipo),
      paisCodigo: uno<{ codigo: string }>(c.paises)?.codigo ?? null,
      codigo: txt(c.codigo),
      nombre: String(c.nombre),
      fotoUrl: txt(c.foto_url),
      etapa: String(c.etapa),
      estado: String(c.estado),
      proveedor: txt(c.proveedor),
      cliente: txt(c.cliente),
      tienda: txt(c.tienda),
      trackId: txt(c.track_id),
      orden: txt(c.orden),
      productoRelacionado: txt(c.producto_relacionado),
      qtyTotal: num(c.qty_total),
      montoTotal: num(c.monto_total),
      primerPago: num(c.primer_pago),
      segundoPago: num(c.segundo_pago),
      pagadoAProveedor: num(c.pagado_a_proveedor),
      pagoPendiente: num(c.pago_pendiente),
      cobradoCliente: num(c.cobrado_cliente),
      pendienteCliente: num(c.pendiente_cliente),
      pagoCliente: txt(c.pago_cliente),
      cuentaReceptora: txt(c.cuenta_receptora),
      factura: c.factura === true,
      financiamiento: c.financiamiento === true,
      revisadoAA: c.revisado_aa === true,
      fechaLimite: txt(c.fecha_limite),
      fechaLlegada: txt(c.fecha_llegada),
      fechaPago1: txt(c.fecha_pago_1),
      fechaPago2: txt(c.fecha_pago_2),
      fechaEnvio: txt(c.fecha_envio),
      inconveniente: txt(c.inconveniente),
      planificacion: txt(c.planificacion),
      documentos: txt(c.documentos),
      notas: txt(c.notas),
      asignadoNombre: asignado ? asignado.nombre || asignado.email : txt(c.responsable_nombre),
      viaEnvio: (c.via_envio as string[] | null) ?? [],
      prioridad: txt(c.prioridad),
      etiquetas: (c.etiquetas as string[] | null) ?? [],
      creadorNombre: txt(c.creador_nombre),
      descripcion: txt(c.descripcion),
      urlProducto: txt(c.url_producto),
      paisesDestino: (c.paises_destino as string[] | null) ?? [],
      fechaInicio: txt(c.fecha_inicio),
      cerradoEn: txt(c.cerrado_en),
      creadoEn: String(c.creado_en),
    };
  });

  return { compras, paises, vista, error };
}

/** Eventos de etapa y estado de las compras de la vista (para los tiempos por estado). */
export async function cargarEventos(ids: Set<string>): Promise<{ compraId: string; campo: string; valor: string | null; ocurridoEn: string }[]> {
  const supabase = createServiceClient();
  try {
    const filas = await traerTodasLasFilas<{ compra_id: string; campo: string; valor_despues: string | null; ocurrido_en: string }>((desde, hasta) =>
      supabase.from("wms_compra_eventos").select("compra_id, campo, valor_despues, ocurrido_en").order("ocurrido_en").range(desde, hasta),
    );
    return filas.filter((e) => ids.has(e.compra_id)).map((e) => ({ compraId: e.compra_id, campo: e.campo, valor: e.valor_despues, ocurridoEn: e.ocurrido_en }));
  } catch {
    return [];
  }
}
