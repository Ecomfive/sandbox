"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO_PRODUCTO, validarProducto, type ProductoDatos } from "@/lib/wms/producto";

const BUCKET = "wms-productos";
const UUID = /^[0-9a-fA-F-]{8,64}$/;

type Cliente = ReturnType<typeof createServiceClient>;

/** Quita el archivo del bucket solo si ninguna otra fila (por ejemplo, un producto duplicado) sigue usándolo. */
async function quitarArchivosHuerfanos(supabase: Cliente, rutas: string[]) {
  const huerfanas: string[] = [];
  for (const ruta of [...new Set(rutas)]) {
    const { count } = await supabase.from("wms_producto_medios").select("id", { count: "exact", head: true }).eq("ruta", ruta);
    if ((count ?? 0) === 0) huerfanas.push(ruta);
  }
  if (huerfanas.length > 0) await supabase.storage.from(BUCKET).remove(huerfanas);
}

/**
 * Da una dirección firmada para que el navegador suba directo a Storage una imagen o un video (así no pasa por el
 * límite de tamaño de las acciones del servidor). Devuelve la ruta que quedará guardada y el token de la subida.
 */
export async function prepararSubidaMedio(nombre: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura("wms-productos");
  if (typeof nombre !== "string" || !nombre.trim()) return { error: "El archivo no tiene nombre." };
  const limpio = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  const ruta = `${crypto.randomUUID()}/${Date.now()}-${limpio}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) return { error: error?.message ?? "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Escribe variantes, inventario y medios de un producto ya guardado. Devuelve el error como valor. */
async function escribirHijos(supabase: Cliente, productoId: string, datos: ProductoDatos): Promise<string | null> {
  // Variantes: las que ya existían se actualizan (conservan su id), las nuevas se crean y las que sobran se borran.
  const { data: previas } = await supabase.from("wms_producto_variantes").select("id").eq("producto_id", productoId);
  const idsPrevios = new Set((previas ?? []).map((v) => v.id as string));
  const conservados = new Set<string>();

  for (const [posicion, v] of datos.variantes.entries()) {
    const fila = {
      producto_id: productoId,
      posicion,
      opciones: v.opciones,
      precio: v.precio,
      precio_comparacion: v.precio_comparacion,
      costo: v.costo,
      sku: v.sku || null,
      codigo_barras: v.codigo_barras || null,
      peso: v.peso,
      unidad_peso: v.unidad_peso,
    };
    let varianteId = v.id && idsPrevios.has(v.id) ? v.id : null;
    if (varianteId) {
      const { error } = await supabase.from("wms_producto_variantes").update(fila).eq("id", varianteId);
      if (error) return error.message;
    } else {
      const { data, error } = await supabase.from("wms_producto_variantes").insert(fila).select("id").single();
      if (error || !data) return error?.message ?? "No se pudo guardar una variante.";
      varianteId = data.id as string;
    }
    conservados.add(varianteId);

    await supabase.from("wms_producto_inventario").delete().eq("variante_id", varianteId);
    if (v.inventario.length > 0) {
      const { error } = await supabase.from("wms_producto_inventario").insert(
        v.inventario.map((i) => ({
          variante_id: varianteId,
          sucursal: i.sucursal,
          disponible: i.disponible,
          comprometido: i.comprometido,
          no_disponible: i.no_disponible,
        }))
      );
      if (error) return error.message;
    }
  }
  const sobran = [...idsPrevios].filter((id) => !conservados.has(id));
  if (sobran.length > 0) await supabase.from("wms_producto_variantes").delete().in("id", sobran);

  // Medios: se reescriben en el orden que trae el formulario; los que ya no están se quitan (y su archivo, si nadie más lo usa).
  const { data: mediosPrevios } = await supabase.from("wms_producto_medios").select("id, ruta").eq("producto_id", productoId);
  const idsMedios = new Set(datos.medios.map((m) => m.id).filter(Boolean) as string[]);
  const quitados = (mediosPrevios ?? []).filter((m) => !idsMedios.has(m.id as string));
  if (quitados.length > 0) {
    await supabase.from("wms_producto_medios").delete().in("id", quitados.map((m) => m.id as string));
    await quitarArchivosHuerfanos(supabase, quitados.map((m) => m.ruta as string));
  }
  for (const [posicion, m] of datos.medios.entries()) {
    if (m.id) {
      await supabase.from("wms_producto_medios").update({ posicion, alt: m.alt }).eq("id", m.id).eq("producto_id", productoId);
    } else if (m.ruta) {
      const { error } = await supabase.from("wms_producto_medios").insert({
        producto_id: productoId,
        ruta: m.ruta,
        nombre_archivo: m.nombre_archivo || null,
        tipo: m.tipo,
        alt: m.alt,
        posicion,
      });
      if (error) return error.message;
    }
  }
  return null;
}

function columnasProducto(d: ProductoDatos) {
  return {
    titulo: d.titulo,
    descripcion: d.descripcion,
    estado: d.estado,
    categoria: d.categoria || null,
    tipo: d.tipo || null,
    proveedor: d.proveedor || null,
    colecciones: d.colecciones,
    etiquetas: d.etiquetas,
    plantilla_tema: d.plantilla_tema,
    canales: d.canales,
    cobrar_impuesto: d.cobrar_impuesto,
    seguimiento_inventario: d.seguimiento_inventario,
    vender_sin_existencias: d.vender_sin_existencias,
    es_fisico: d.es_fisico,
    embalaje: d.embalaje || null,
    pais_origen: d.pais_origen || null,
    codigo_sa: d.codigo_sa || null,
    seo_titulo: d.seo_titulo || null,
    seo_descripcion: d.seo_descripcion || null,
    seo_url: d.seo_url || null,
    metacampos: d.metacampos,
    opciones: d.opciones,
  };
}

/**
 * Crea o guarda un producto completo (datos, variantes, inventario y medios) desde su ficha. `datos` llega como JSON;
 * las imágenes nuevas ya se subieron directo a Storage (`prepararSubidaMedio`) y solo traen su ruta. Devuelve el error
 * como valor, porque en producción Next.js oculta el mensaje de una excepción.
 */
export async function guardarProductoWms(entrada: { id: string | null; paisId: string; datos: unknown }): Promise<{ id: string } | { error: string }> {
  const usuario = await requireModuloEscritura("wms-productos");
  const valido = validarProducto(entrada.datos);
  if ("error" in valido) return valido;
  const { datos } = valido;
  const id = entrada.id;
  if (id !== null && !UUID.test(id)) return { error: "Producto no válido." };

  const supabase = createServiceClient();
  let productoId = id;
  let antes: { titulo: string; estado: string } | null = null;

  if (productoId) {
    const { data: actual, error: errorActual } = await supabase.from("wms_productos").select("titulo, estado").eq("id", productoId).single();
    if (errorActual || !actual) return { error: "El producto ya no existe." };
    antes = actual;
    const { error } = await supabase
      .from("wms_productos")
      .update({ ...columnasProducto(datos), actualizado_en: new Date().toISOString() })
      .eq("id", productoId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("wms_productos")
      .insert({ ...columnasProducto(datos), pais_id: entrada.paisId, creado_por: usuario.id })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "No se pudo crear el producto." };
    productoId = data.id as string;
  }

  const errorHijos = await escribirHijos(supabase, productoId, datos);
  if (errorHijos) return { error: errorHijos };

  await registrarAuditoria(
    antes
      ? {
          accion: "editar_producto_wms",
          entidad: "wms_productos",
          entidadId: productoId,
          antes: { Título: antes.titulo, Estado: ETIQUETA_ESTADO_PRODUCTO[antes.estado as keyof typeof ETIQUETA_ESTADO_PRODUCTO] ?? antes.estado },
          despues: { Título: datos.titulo, Estado: ETIQUETA_ESTADO_PRODUCTO[datos.estado] },
        }
      : {
          accion: "crear_producto_wms",
          entidad: "wms_productos",
          entidadId: productoId,
          detalle: `${datos.titulo} (${ETIQUETA_ESTADO_PRODUCTO[datos.estado]})`,
        }
  );

  revalidatePath("/wms-productos");
  revalidatePath(`/wms-productos/${productoId}`);
  return { id: productoId };
}

/** Copia un producto (datos, variantes e inventario; los medios apuntan a los mismos archivos) como un borrador nuevo. */
export async function duplicarProductoWms(id: string): Promise<{ id: string } | { error: string }> {
  const usuario = await requireModuloEscritura("wms-productos");
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();

  const { data: origen, error } = await supabase.from("wms_productos").select("*").eq("id", id).single();
  if (error || !origen) return { error: "El producto ya no existe." };
  const { id: _id, creado_en: _c, actualizado_en: _a, ...campos } = origen as Record<string, unknown>;
  void _id;
  void _c;
  void _a;

  const { data: nuevo, error: errorNuevo } = await supabase
    .from("wms_productos")
    .insert({ ...campos, titulo: `Copia de ${origen.titulo}`, estado: "borrador", seo_url: null, creado_por: usuario.id })
    .select("id")
    .single();
  if (errorNuevo || !nuevo) return { error: errorNuevo?.message ?? "No se pudo duplicar el producto." };

  const { data: variantes } = await supabase.from("wms_producto_variantes").select("*").eq("producto_id", id).order("posicion");
  for (const v of variantes ?? []) {
    const { id: varianteId, producto_id: _p, ...resto } = v as Record<string, unknown>;
    void _p;
    const { data: copia } = await supabase
      .from("wms_producto_variantes")
      .insert({ ...resto, producto_id: nuevo.id, sku: null })
      .select("id")
      .single();
    if (!copia) continue;
    const { data: inventario } = await supabase.from("wms_producto_inventario").select("sucursal, disponible, comprometido, no_disponible").eq("variante_id", varianteId as string);
    if ((inventario ?? []).length > 0) {
      await supabase.from("wms_producto_inventario").insert((inventario ?? []).map((i) => ({ ...i, variante_id: copia.id })));
    }
  }
  const { data: medios } = await supabase.from("wms_producto_medios").select("ruta, nombre_archivo, tipo, alt, posicion").eq("producto_id", id);
  if ((medios ?? []).length > 0) {
    await supabase.from("wms_producto_medios").insert((medios ?? []).map((m) => ({ ...m, producto_id: nuevo.id })));
  }

  await registrarAuditoria({ accion: "duplicar_producto_wms", entidad: "wms_productos", entidadId: nuevo.id as string, detalle: `Copia de ${origen.titulo}` });
  revalidatePath("/wms-productos");
  return { id: nuevo.id as string };
}

/** Borra el producto con sus variantes, inventario y medios (en cascada) y los archivos que nadie más usa. */
export async function eliminarProductoWms(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura("wms-productos");
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();

  const { data: producto } = await supabase.from("wms_productos").select("titulo").eq("id", id).single();
  const { data: medios } = await supabase.from("wms_producto_medios").select("ruta").eq("producto_id", id);
  const { error } = await supabase.from("wms_productos").delete().eq("id", id);
  if (error) return { error: error.message };
  await quitarArchivosHuerfanos(supabase, (medios ?? []).map((m) => m.ruta as string));

  await registrarAuditoria({ accion: "eliminar_producto_wms", entidad: "wms_productos", entidadId: id, detalle: producto?.titulo ?? undefined });
  revalidatePath("/wms-productos");
  return {};
}

/** La actividad de un producto para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialProductoWms(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo("wms-productos");
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "wms_productos")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
