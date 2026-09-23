"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ETIQUETA_PUBLICACION, garantiasPorDefecto, validarProductoDropi, type Bodega, type ProductoDropiDatos } from "@/lib/wms/producto-dropi";

const BUCKET = "wms-productos";
const MODULO = "wms-productos-dropi";
const UUID = /^[0-9a-fA-F-]{8,64}$/;

type Cliente = ReturnType<typeof createServiceClient>;

/** Quita el archivo del bucket solo si ninguna otra fila (un producto duplicado) sigue usándolo. */
async function quitarArchivosHuerfanos(supabase: Cliente, rutas: string[]) {
  const huerfanas: string[] = [];
  for (const ruta of [...new Set(rutas)]) {
    const { count } = await supabase.from("wms_dropi_producto_medios").select("id", { count: "exact", head: true }).eq("ruta", ruta);
    if ((count ?? 0) === 0) huerfanas.push(ruta);
  }
  if (huerfanas.length > 0) await supabase.storage.from(BUCKET).remove(huerfanas);
}

/** Da una dirección firmada para subir directo a Storage una imagen o un video (sin pasar por el límite de las acciones). */
export async function prepararSubidaMedioDropi(nombre: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof nombre !== "string" || !nombre.trim()) return { error: "El archivo no tiene nombre." };
  const limpio = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  const ruta = `dropi/${crypto.randomUUID()}/${Date.now()}-${limpio}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) return { error: error?.message ?? "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Agrega una bodega a la lista del país (la ficha las ofrece en la pestaña Stock). */
export async function crearBodegaWms(paisId: string, nombre: string): Promise<{ bodega: Bodega } | { error: string }> {
  await requireModuloEscritura(MODULO);
  const limpio = typeof nombre === "string" ? nombre.trim().slice(0, 120) : "";
  if (!limpio) return { error: "Escribe el nombre de la bodega." };
  if (typeof paisId !== "string" || !UUID.test(paisId)) return { error: "País no válido." };
  const { data, error } = await createServiceClient().from("wms_bodegas").insert({ pais_id: paisId, nombre: limpio }).select("id, nombre").single();
  if (error?.code === "23505") return { error: "Ya existe una bodega con ese nombre." };
  if (error || !data) return { error: error?.message ?? "No se pudo crear la bodega." };
  revalidatePath("/wms-productos-dropi");
  return { bodega: { id: data.id as string, nombre: data.nombre as string } };
}

async function escribirMedios(supabase: Cliente, productoId: string, datos: ProductoDropiDatos): Promise<string | null> {
  const { data: previos } = await supabase.from("wms_dropi_producto_medios").select("id, ruta").eq("producto_id", productoId);
  const conservados = new Set(datos.medios.map((m) => m.id).filter(Boolean) as string[]);
  const quitados = (previos ?? []).filter((m) => !conservados.has(m.id as string));
  if (quitados.length > 0) {
    await supabase.from("wms_dropi_producto_medios").delete().in("id", quitados.map((m) => m.id as string));
    await quitarArchivosHuerfanos(supabase, quitados.map((m) => m.ruta as string));
  }
  for (const [posicion, m] of datos.medios.entries()) {
    if (m.id) {
      await supabase.from("wms_dropi_producto_medios").update({ posicion }).eq("id", m.id).eq("producto_id", productoId);
    } else if (m.ruta) {
      const { error } = await supabase.from("wms_dropi_producto_medios").insert({
        producto_id: productoId,
        ruta: m.ruta,
        nombre_archivo: m.nombre_archivo || null,
        tipo: m.tipo,
        posicion,
      });
      if (error) return error.message;
    }
  }
  return null;
}

function columnas(d: ProductoDropiDatos) {
  return {
    nombre: d.nombre,
    nombre_guia: d.usar_nombre_guia ? d.nombre_guia : null,
    publicacion: d.publicacion,
    peso: d.peso,
    longitud: d.longitud,
    ancho: d.ancho,
    alto: d.alto,
    precio: d.tipo === "simple" ? d.precio : null,
    precio_sugerido: d.tipo === "simple" ? d.precio_sugerido : null,
    tipo: d.tipo,
    categorias: d.categorias,
    aprobado: d.aprobado,
    sku: d.sku || null,
    descripcion: d.descripcion,
    descripcion_app: d.descripcion_app,
    stock: d.stock,
    atributos: d.atributos,
    variaciones: d.variaciones,
    garantias: d.garantias,
    privados: d.privados,
    recursos: d.recursos,
  };
}

/**
 * Crea o guarda un producto de Dropi completo desde su ficha. Las imágenes y los videos nuevos ya se subieron directo a
 * Storage y solo traen su ruta. Devuelve el error como valor, porque en producción Next.js oculta las excepciones.
 */
export async function guardarProductoDropi(entrada: { id: string | null; paisId: string; datos: unknown }): Promise<{ id: string } | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const valido = validarProductoDropi(entrada.datos);
  if ("error" in valido) return valido;
  const { datos } = valido;
  const id = entrada.id;
  if (id !== null && !UUID.test(id)) return { error: "Producto no válido." };
  if (id === null && !UUID.test(entrada.paisId)) return { error: "País no válido." };

  const supabase = createServiceClient();
  let productoId = id;
  let antes: { nombre: string; publicacion: string } | null = null;
  let stockAntes: Record<string, number> = {};

  if (productoId) {
    const { data: actual } = await supabase.from("wms_dropi_productos").select("nombre, publicacion, tipo, stock, variaciones").eq("id", productoId).single();
    if (!actual) return { error: "El producto ya no existe." };
    antes = actual;
    stockAntes = stockPorBodega(actual as unknown as Pick<ProductoDropiDatos, "tipo" | "stock" | "variaciones">);
    const { error } = await supabase.from("wms_dropi_productos").update({ ...columnas(datos), actualizado_en: new Date().toISOString() }).eq("id", productoId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("wms_dropi_productos")
      .insert({ ...columnas(datos), pais_id: entrada.paisId, creado_por: usuario.id })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "No se pudo crear el producto." };
    productoId = data.id as string;
  }

  const errorMedios = await escribirMedios(supabase, productoId, datos);
  if (errorMedios) return { error: errorMedios };

  await registrarAuditoria(
    antes
      ? {
          accion: "editar_producto_dropi",
          entidad: "wms_dropi_productos",
          entidadId: productoId,
          antes: { Nombre: antes.nombre, Publicación: ETIQUETA_PUBLICACION[antes.publicacion as keyof typeof ETIQUETA_PUBLICACION] ?? antes.publicacion },
          despues: { Nombre: datos.nombre, Publicación: ETIQUETA_PUBLICACION[datos.publicacion] },
        }
      : { accion: "crear_producto_dropi", entidad: "wms_dropi_productos", entidadId: productoId, detalle: `${datos.nombre} (${ETIQUETA_PUBLICACION[datos.publicacion]})` }
  );

  // Historial de existencia: si el stock de alguna bodega cambió (o el producto nace con stock), queda una línea aparte.
  const stockDespues = stockPorBodega(datos);
  const ids = [...new Set([...Object.keys(stockAntes), ...Object.keys(stockDespues)])];
  const cambios = ids.filter((b) => (stockAntes[b] ?? 0) !== (stockDespues[b] ?? 0));
  if (cambios.length > 0) {
    const { data: bodegas } = await supabase.from("wms_bodegas").select("id, nombre").in("id", cambios);
    const nombre = new Map((bodegas ?? []).map((b) => [b.id as string, b.nombre as string]));
    const total = (m: Record<string, number>) => Object.values(m).reduce((t, n) => t + n, 0);
    await registrarAuditoria({
      accion: "ajustar_stock_dropi",
      entidad: "wms_dropi_productos",
      entidadId: productoId,
      antes: { ...Object.fromEntries(cambios.map((b) => [nombre.get(b) ?? "Bodega", String(stockAntes[b] ?? 0)])), Total: String(total(stockAntes)) },
      despues: { ...Object.fromEntries(cambios.map((b) => [nombre.get(b) ?? "Bodega", String(stockDespues[b] ?? 0)])), Total: String(total(stockDespues)) },
    });
  }

  revalidatePath("/wms-productos-dropi");
  return { id: productoId };
}

/** Stock por bodega de un producto: el simple lo trae directo; el variable suma sus variaciones. */
function stockPorBodega(d: Pick<ProductoDropiDatos, "tipo" | "stock" | "variaciones">): Record<string, number> {
  const fuentes = d.tipo === "variable" ? (d.variaciones ?? []).map((v) => v.stock ?? {}) : [d.stock ?? {}];
  const suma: Record<string, number> = {};
  for (const s of fuentes) for (const [b, n] of Object.entries(s)) suma[b] = (suma[b] ?? 0) + (Number(n) || 0);
  return suma;
}

/** Todo el producto para abrir su ficha (la lista solo trae lo justo para las filas). */
export async function obtenerProductoDropi(
  id: string
): Promise<{ producto: ProductoDropiDatos; numero: number; archivado: boolean; actualizadoEn: string } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const { data: p, error } = await createServiceClient()
    .from("wms_dropi_productos")
    .select("*, wms_dropi_producto_medios(id, ruta, nombre_archivo, tipo, posicion)")
    .eq("id", id)
    .maybeSingle();
  if (error || !p) return { error: "El producto ya no existe." };

  const medios = ((p.wms_dropi_producto_medios ?? []) as Record<string, unknown>[])
    .sort((a, b) => Number(a.posicion) - Number(b.posicion))
    .map((m) => ({
      id: String(m.id),
      ruta: String(m.ruta),
      nombre_archivo: (m.nombre_archivo as string | null) ?? "",
      tipo: (m.tipo === "video" ? "video" : "imagen") as "imagen" | "video",
      alt: "",
    }));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    numero: Number(p.numero),
    archivado: p.archivado === true,
    actualizadoEn: p.actualizado_en as string,
    producto: {
      nombre: p.nombre,
      usar_nombre_guia: !!p.nombre_guia,
      nombre_guia: p.nombre_guia ?? "",
      publicacion: p.publicacion === "privado" ? "privado" : "publico",
      peso: n(p.peso),
      longitud: n(p.longitud),
      ancho: n(p.ancho),
      alto: n(p.alto),
      precio: n(p.precio),
      precio_sugerido: n(p.precio_sugerido),
      tipo: p.tipo === "variable" ? "variable" : "simple",
      categorias: p.categorias ?? [],
      aprobado: p.aprobado === true,
      sku: p.sku ?? "",
      descripcion: p.descripcion ?? "",
      descripcion_app: p.descripcion_app ?? "",
      stock: p.stock ?? {},
      atributos: p.atributos ?? [],
      variaciones: p.variaciones ?? [],
      garantias: { ...garantiasPorDefecto(), ...(p.garantias ?? {}) },
      privados: p.privados ?? [],
      recursos: p.recursos ?? [],
      medios,
    },
  };
}

/** Archiva el producto (sale de «Activos» y pasa a «Archivados») o lo devuelve a activos. No borra nada. */
export async function archivarProductoDropi(id: string, archivar: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: producto } = await supabase.from("wms_dropi_productos").select("nombre, archivado").eq("id", id).single();
  if (!producto) return { error: "El producto ya no existe." };
  if (producto.archivado === archivar) return {};
  const { error } = await supabase.from("wms_dropi_productos").update({ archivado: archivar, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  await registrarAuditoria({
    accion: "archivar_producto_dropi",
    entidad: "wms_dropi_productos",
    entidadId: id,
    antes: { Estado: archivar ? "Activo" : "Archivado" },
    despues: { Estado: archivar ? "Archivado" : "Activo" },
  });
  revalidatePath("/wms-productos-dropi");
  return {};
}

/** Los ajustes de stock de un producto (la sección «Historial de existencia» de su ficha). */
export async function obtenerHistorialExistenciaDropi(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "wms_dropi_productos")
    .eq("entidad_id", id)
    .eq("accion", "ajustar_stock_dropi")
    .order("creado_en", { ascending: false })
    .limit(50);
  if (error) return { error: "No se pudo cargar el historial de existencia." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/** Copia un producto como uno privado nuevo (sin SKU); las imágenes y videos apuntan a los mismos archivos. */
export async function duplicarProductoDropi(id: string): Promise<{ id: string } | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();

  const { data: origen } = await supabase.from("wms_dropi_productos").select("*").eq("id", id).single();
  if (!origen) return { error: "El producto ya no existe." };
  const { id: _id, creado_en: _c, actualizado_en: _a, ...campos } = origen as Record<string, unknown>;
  void _id;
  void _c;
  void _a;
  const { data: nuevo, error } = await supabase
    .from("wms_dropi_productos")
    .insert({ ...campos, nombre: `Copia de ${origen.nombre}`, publicacion: "privado", sku: null, creado_por: usuario.id })
    .select("id")
    .single();
  if (error || !nuevo) return { error: error?.message ?? "No se pudo duplicar el producto." };

  const { data: medios } = await supabase.from("wms_dropi_producto_medios").select("ruta, nombre_archivo, tipo, posicion").eq("producto_id", id);
  if ((medios ?? []).length > 0) await supabase.from("wms_dropi_producto_medios").insert((medios ?? []).map((m) => ({ ...m, producto_id: nuevo.id })));

  await registrarAuditoria({ accion: "duplicar_producto_dropi", entidad: "wms_dropi_productos", entidadId: nuevo.id as string, detalle: `Copia de ${origen.nombre}` });
  revalidatePath("/wms-productos-dropi");
  return { id: nuevo.id as string };
}

export async function eliminarProductoDropi(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: producto } = await supabase.from("wms_dropi_productos").select("nombre").eq("id", id).single();
  const { data: medios } = await supabase.from("wms_dropi_producto_medios").select("ruta").eq("producto_id", id);
  const { error } = await supabase.from("wms_dropi_productos").delete().eq("id", id);
  if (error) return { error: error.message };
  await quitarArchivosHuerfanos(supabase, (medios ?? []).map((m) => m.ruta as string));
  await registrarAuditoria({ accion: "eliminar_producto_dropi", entidad: "wms_dropi_productos", entidadId: id, detalle: producto?.nombre ?? undefined });
  revalidatePath("/wms-productos-dropi");
  return {};
}

/** La actividad de un producto para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialProductoDropi(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Producto no válido." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "wms_dropi_productos")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
