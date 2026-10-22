import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { getUsuarioActual } from "@/lib/auth";
import { filtrarPaises, puedeVerPais } from "@/lib/paises-permitidos";
import { productoDeCompra } from "@/lib/compras/foto-producto";
import { cargarFotosDeProductos, type FotosDeProductos } from "@/lib/compras/fotos-productos-datos";
import type { FilaCompra } from "./def-compras";
import { SIN_RESTRICCIONES, dentroDelAlcance, enmascarar, restriccionesDe, type RestriccionesCompras } from "./permisos-compras";

/** La cookie con la última vista elegida (todos, un país o Importadora), para que se mantenga al cambiar de pestaña. */
export const COOKIE_VISTA_COMPRAS = "compras-vista";

const COLUMNAS =
  "id, tipo, codigo, nombre, foto_url, etapa, estado, proveedor, agente_envio, venta_importacion, tiendas, qty_total, monto_total, primer_pago, segundo_pago, pagado_a_proveedor, anulada_en, anulada_por, motivo_anulacion, factura, financiamiento, fecha_limite, fecha_llegada, fecha_pago_1, fecha_pago_2, fecha_envio, planificacion, via_envio, etiquetas, responsable_nombre, creador_nombre, asignado_a, creado_por, descripcion, url_producto, nota_proveedor, paises_destino, fecha_inicio, cerrado_en, creado_en, paises(codigo), perfiles(nombre, email), numero, wms_compra_items(cantidad_pedida, creado_en, sku_maestro_id, skus_maestros(codigo, nombre))";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const uno = <T,>(r: unknown): T | null => (Array.isArray(r) ? ((r[0] as T) ?? null) : ((r as T) ?? null));
const txt = (v: unknown) => (v as string | null) ?? null;

/** Los productos vinculados a una compra, en el orden en que se agregaron. */
function lineasDe(items: unknown, categorias: Map<string, string>, fotos: Map<string, string>): Pick<FilaCompra, "productos" | "lineas"> {
  const filas = ((items as { cantidad_pedida: number; creado_en: string; sku_maestro_id: string; skus_maestros: unknown }[] | null) ?? [])
    .slice()
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const lineas = filas.map((i) => {
    const sku = uno<{ codigo: string; nombre: string }>(i.skus_maestros);
    return {
      codigo: sku?.codigo ?? "",
      nombre: sku?.nombre ?? "",
      cantidad: Number(i.cantidad_pedida),
      categoria: categorias.get(sku?.codigo ?? "") ?? null,
      foto: fotos.get(i.sku_maestro_id) ?? null,
    };
  });
  return { productos: lineas.length, lineas };
}

/** La foto comercial de la compra (la de Producto): la de su primer producto con foto o, sin productos, la del producto con su
 * mismo nombre. La foto real del proveedor es otra (`fotoUrl`). */
function conFotoComercial(nombre: string, l: Pick<FilaCompra, "productos" | "lineas">, fotos: FotosDeProductos): Pick<FilaCompra, "productos" | "lineas" | "fotoComercial"> {
  const deLinea = l.lineas.find((x) => x.foto)?.foto ?? null;
  if (deLinea || l.lineas.length) return { ...l, fotoComercial: deLinea };
  const parecido = nombre ? productoDeCompra(nombre, null, fotos.indice) : null;
  return { ...l, fotoComercial: parecido ? (fotos.porId.get(parecido.id) ?? null) : null };
}

export interface DatosCompras {
  compras: FilaCompra[];
  paises: { id: string; codigo: string; nombre: string }[];
  /** 'todos', el código de un país o 'importacion'. */
  vista: string;
  error: boolean;
  /** Si la persona puede ver Compras Importadora (sus países permitidos, migración 0087). */
  verImportadora: boolean;
  /** Lo que su rol (o ella misma) tiene limitado dentro de Compras (Usuarios y roles › Afinar). Los datos que no ve ya no vienen en `compras`. */
  restricciones: RestriccionesCompras;
}

/** Las fallas: el último comentario «Inconveniente: …» de cada compra. */
async function cargarInconvenientes(): Promise<Map<string, string>> {
  const inconvenientes = new Map<string, string>();
  const { data: marcados } = await createServiceClient()
    .from("wms_compra_comentarios")
    .select("compra_id, texto, creado_en")
    .ilike("texto", "inconveniente%")
    .order("creado_en", { ascending: false });
  for (const m of marcados ?? []) {
    const texto = String(m.texto).replace(/^inconveniente\s*:?\s*/i, "").trim();
    if (!inconvenientes.has(m.compra_id) && texto) inconvenientes.set(m.compra_id, texto);
  }
  return inconvenientes;
}

/** La categoría de cada producto (taxonomía de Shopify, migración 0113), por su SKU. Sin la migración, ninguna. */
async function cargarCategoriasPorSku(): Promise<Map<string, string>> {
  const categorias = new Map<string, string>();
  try {
    const supabase = createServiceClient();
    const conCategoria = await traerTodasLasFilas<{ codigo: string; categorias_productos: unknown }>((desde, hasta) =>
      supabase.from("skus_maestros").select("codigo, categorias_productos(ruta)").not("categoria_id", "is", null).order("id").range(desde, hasta),
    );
    for (const p of conCategoria) {
      const ruta = uno<{ ruta: string }>(p.categorias_productos)?.ruta;
      if (ruta) categorias.set(p.codigo, ruta);
    }
  } catch {
    // Sin la migración 0113: sin categorías.
  }
  return categorias;
}

/**
 * Las compras de la vista pedida (`?ver=`, o la última elegida): todos los países, uno solo o Importadora (que nunca se
 * mezcla con las de un país). La usan Informe, Compras y Tiempos y fallas.
 */
export async function cargarCompras(ver: string | string[] | undefined): Promise<DatosCompras> {
  const supabase = createServiceClient();
  // Lo que no depende de la vista arranca ya y se espera al final, en paralelo con las compras (antes iba una consulta tras
  // otra: compras → comentarios → categorías).
  const inconvenientesP = cargarInconvenientes();
  const categoriasP = cargarCategoriasPorSku();
  const fotosP = cargarFotosDeProductos(supabase);
  const paisesP = supabase.from("paises").select("id, codigo, nombre").order("nombre");
  // Solo los países que la persona puede ver (y Importadora si la tiene): lo demás no se pide a la base.
  const usuario = await getUsuarioActual();
  const permitidos = usuario?.paisesPermitidos ?? null;
  const restricciones = restriccionesDe(usuario?.afinado.compras);
  const verImportadora = puedeVerPais(permitidos, null);
  const { data: paisesBd } = await paisesP;
  const paises = filtrarPaises(permitidos, (paisesBd ?? []) as DatosCompras["paises"]);
  const guardada = (await cookies()).get(COOKIE_VISTA_COMPRAS)?.value;
  const pedido = typeof ver === "string" ? ver : (guardada ?? "todos");
  const vista = paises.some((p) => p.codigo === pedido) ? pedido : "todos";
  const paisVista = paises.find((p) => p.codigo === vista) ?? null;

  let filas: Record<string, unknown>[] = [];
  let error = false;
  try {
    // «Todos» con países limitados: solo los suyos (sin ninguno, nada).
    if (vista === "todos" && permitidos !== null && paises.length === 0) filas = [];
    else
      filas = await traerTodasLasFilas<Record<string, unknown>>((desde, hasta) => {
        let q = supabase.from("wms_compras").select(COLUMNAS);
        if (vista === "importacion") q = q.eq("tipo", "importacion");
        else if (paisVista) q = q.eq("tipo", "pais").eq("pais_id", paisVista.id);
        else if (permitidos !== null) q = q.eq("tipo", "pais").in("pais_id", paises.map((p) => p.id));
        else q = q.eq("tipo", "pais");
        return q.order("creado_en", { ascending: false }).range(desde, hasta);
      });
  } catch {
    error = true;
  }

  const [inconvenientes, categorias, fotos] = await Promise.all([
    error ? new Map<string, string>() : inconvenientesP,
    error ? new Map<string, string>() : categoriasP,
    fotosP,
  ]);

  // Qué compras alcanza: todas, o solo las asignadas o creadas por la persona (lo decide su rol en Usuarios y roles › Afinar).
  const alcanzadas = usuario
    ? filas.filter((c) =>
        dentroDelAlcance(
          restricciones.alcance,
          { asignadoId: txt(c.asignado_a), creadoPorId: txt(c.creado_por), responsableNombre: txt(c.responsable_nombre), creadorNombre: txt(c.creador_nombre) },
          usuario,
        ),
      )
    : filas;

  const compras: FilaCompra[] = alcanzadas.map((c) => {
    const asignado = uno<{ nombre: string | null; email: string }>(c.perfiles);
    return enmascarar({
      id: String(c.id),
      tipo: String(c.tipo),
      paisCodigo: uno<{ codigo: string }>(c.paises)?.codigo ?? null,
      codigo: txt(c.codigo),
      nombre: String(c.nombre),
      fotoUrl: txt(c.foto_url),
      etapa: String(c.etapa),
      estado: String(c.estado),
      proveedor: txt(c.proveedor),
      agenteEnvio: txt(c.agente_envio),
      ventaImportacion: c.venta_importacion === true,
      anulada: c.anulada_en ? { en: String(c.anulada_en), por: txt(c.anulada_por), motivo: txt(c.motivo_anulacion) } : null,
      tiendas: (c.tiendas as string[] | null) ?? [],
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
      asignadoNombre: asignado ? asignado.nombre || asignado.email : txt(c.responsable_nombre),
      viaEnvio: (c.via_envio as string[] | null) ?? [],
      etiquetas: (c.etiquetas as string[] | null) ?? [],
      creadorNombre: txt(c.creador_nombre),
      descripcion: txt(c.descripcion),
      urlProducto: txt(c.url_producto),
      notaProveedor: txt(c.nota_proveedor),
      paisesDestino: (c.paises_destino as string[] | null) ?? [],
      fechaInicio: txt(c.fecha_inicio),
      cerradoEn: txt(c.cerrado_en),
      creadoEn: String(c.creado_en),
      numero: Number(c.numero),
      ...conFotoComercial(String(c.nombre ?? ""), lineasDe(c.wms_compra_items, categorias, fotos.porId), fotos),
    }, restricciones);
  });

  return { compras, paises, vista, error, verImportadora, restricciones: usuario ? restricciones : SIN_RESTRICCIONES };
}

/** Eventos de etapa y estado de las compras de la vista (para los tiempos por estado). */
export async function cargarEventos(ids?: Set<string>): Promise<{ compraId: string; campo: string; valor: string | null; ocurridoEn: string }[]> {
  const supabase = createServiceClient();
  try {
    const filas = await traerTodasLasFilas<{ compra_id: string; campo: string; valor_despues: string | null; ocurrido_en: string }>((desde, hasta) =>
      supabase.from("wms_compra_eventos").select("compra_id, campo, valor_despues, ocurrido_en").order("ocurrido_en").range(desde, hasta),
    );
    return filas.filter((e) => !ids || ids.has(e.compra_id)).map((e) => ({ compraId: e.compra_id, campo: e.campo, valor: e.valor_despues, ocurridoEn: e.ocurrido_en }));
  } catch {
    return [];
  }
}

/** El color elegido para cada etiqueta de Compras (por su nombre). Sin la tabla todavía (migración 0082), ninguno. */
/** El color elegido de cada tienda (migración 0091; sin ella, todas con su color automático). */
export async function cargarColoresTiendas(): Promise<Record<string, string>> {
  const { data, error } = await createServiceClient().from("wms_compras_tiendas").select("nombre, color");
  if (error) return {};
  return Object.fromEntries((data ?? []).map((e) => [e.nombre as string, e.color as string]));
}

export async function cargarColoresEtiquetas(): Promise<Record<string, string>> {
  const { data, error } = await createServiceClient().from("wms_compras_etiquetas").select("nombre, color");
  if (error) return {};
  return Object.fromEntries((data ?? []).map((e) => [e.nombre as string, e.color as string]));
}
