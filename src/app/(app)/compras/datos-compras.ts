import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { FilaCompra } from "./def-compras";

/** La cookie con la última vista elegida (todos, un país o Importadora), para que se mantenga al cambiar de pestaña. */
export const COOKIE_VISTA_COMPRAS = "compras-vista";

const COLUMNAS =
  "id, tipo, codigo, nombre, foto_url, etapa, estado, proveedor, tiendas, producto_relacionado, qty_total, monto_total, primer_pago, segundo_pago, pagado_a_proveedor, factura, financiamiento, fecha_limite, fecha_llegada, fecha_pago_1, fecha_pago_2, fecha_envio, planificacion, documentos, via_envio, etiquetas, responsable_nombre, creador_nombre, descripcion, url_producto, paises_destino, fecha_inicio, cerrado_en, creado_en, paises(codigo), perfiles(nombre, email), numero, wms_compra_items(cantidad_pedida, creado_en, skus_maestros(codigo, nombre))";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const uno = <T,>(r: unknown): T | null => (Array.isArray(r) ? ((r[0] as T) ?? null) : ((r as T) ?? null));
const txt = (v: unknown) => (v as string | null) ?? null;

/** Los productos vinculados a una compra, en el orden en que se agregaron. */
function lineasDe(items: unknown): Pick<FilaCompra, "productos" | "lineas"> {
  const filas = ((items as { cantidad_pedida: number; creado_en: string; skus_maestros: unknown }[] | null) ?? [])
    .slice()
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const lineas = filas.map((i) => {
    const sku = uno<{ codigo: string; nombre: string }>(i.skus_maestros);
    return { codigo: sku?.codigo ?? "", nombre: sku?.nombre ?? "", cantidad: Number(i.cantidad_pedida) };
  });
  return { productos: lineas.length, lineas };
}

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

  // Las fallas: el último comentario «Inconveniente: …» de cada compra.
  const inconvenientes = new Map<string, string>();
  if (!error) {
    const { data: marcados } = await supabase
      .from("wms_compra_comentarios")
      .select("compra_id, texto, creado_en")
      .ilike("texto", "inconveniente%")
      .order("creado_en", { ascending: false });
    for (const m of marcados ?? []) {
      const texto = String(m.texto).replace(/^inconveniente\s*:?\s*/i, "").trim();
      if (!inconvenientes.has(m.compra_id) && texto) inconvenientes.set(m.compra_id, texto);
    }
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
      tiendas: (c.tiendas as string[] | null) ?? [],
      productoRelacionado: txt(c.producto_relacionado),
      qtyTotal: num(c.qty_total),
      montoTotal: num(c.monto_total),
      primerPago: num(c.primer_pago),
      segundoPago: num(c.segundo_pago),
      pagadoAProveedor: num(c.pagado_a_proveedor),
      factura: c.factura === true,
      financiamiento: c.financiamiento === true,
      fechaLimite: txt(c.fecha_limite),
      fechaLlegada: txt(c.fecha_llegada),
      fechaPago1: txt(c.fecha_pago_1),
      fechaPago2: txt(c.fecha_pago_2),
      fechaEnvio: txt(c.fecha_envio),
      inconveniente: inconvenientes.get(String(c.id)) ?? null,
      planificacion: txt(c.planificacion),
      documentos: txt(c.documentos),
      asignadoNombre: asignado ? asignado.nombre || asignado.email : txt(c.responsable_nombre),
      viaEnvio: (c.via_envio as string[] | null) ?? [],
      etiquetas: (c.etiquetas as string[] | null) ?? [],
      creadorNombre: txt(c.creador_nombre),
      descripcion: txt(c.descripcion),
      urlProducto: txt(c.url_producto),
      paisesDestino: (c.paises_destino as string[] | null) ?? [],
      fechaInicio: txt(c.fecha_inicio),
      cerradoEn: txt(c.cerrado_en),
      creadoEn: String(c.creado_en),
      numero: Number(c.numero),
      ...lineasDe(c.wms_compra_items),
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

/** El color elegido para cada etiqueta de Compras (por su nombre). Sin la tabla todavía (migración 0082), ninguno. */
export async function cargarColoresEtiquetas(): Promise<Record<string, string>> {
  const { data, error } = await createServiceClient().from("wms_compras_etiquetas").select("nombre, color");
  if (error) return {};
  return Object.fromEntries((data ?? []).map((e) => [e.nombre as string, e.color as string]));
}
