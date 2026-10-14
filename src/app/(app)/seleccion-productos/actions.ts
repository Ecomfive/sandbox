"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { rutaPropia } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { ESTADOS_SELECCION, etiquetaEstadoSeleccion, FUENTES } from "./def-seleccion";

const MODULO = "seleccion-productos";
const ENTIDAD = "wms_seleccion_productos";
const RUTA = "/seleccion-productos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS: Set<string> = new Set(ESTADOS_SELECCION.map((e) => e.valor));
const FUENTES_VALIDAS: Set<string> = new Set(FUENTES.map((f) => f.valor));

// La foto vive en el mismo bucket público que las de Filtro de productos y las fichas, en su propia carpeta.
const BUCKET_FOTOS = "wms-productos";
const CARPETA_FOTOS = "seleccion";
const PREFIJO_URL_PUBLICA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;

const limpiarNombreArchivo = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-120);

/** Da permiso (URL firmada) para subir la foto directo desde el navegador, sin pasar el archivo por la acción. */
export async function prepararSubidaFotoSeleccion(nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof nombreArchivo !== "string" || !nombreArchivo.trim()) return { error: "El archivo no tiene nombre." };
  const ruta = `${CARPETA_FOTOS}/${crypto.randomUUID()}/${Date.now()}-${limpiarNombreArchivo(nombreArchivo)}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_FOTOS).createSignedUploadUrl(ruta);
  if (error || !data) return { error: error?.message ?? "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Borra del bucket una foto de esta carpeta que ya ninguna fila usa. Nunca lanza. */
async function borrarFotoSiEsNuestra(url: string | null) {
  const ruta = rutaPropia(url, PREFIJO_URL_PUBLICA, CARPETA_FOTOS);
  if (!ruta) return;
  const supabase = createServiceClient();
  const { count, error } = await supabase.from(ENTIDAD).select("id", { count: "exact", head: true }).eq("foto_url", url);
  if (error || (count ?? 0) > 0) return;
  await supabase.storage.from(BUCKET_FOTOS).remove([ruta]);
}

const texto = (formData: FormData, campo: string, max = 500): string | null => {
  const t = String(formData.get(campo) ?? "").trim();
  return t ? t.slice(0, max) : null;
};

/** Un monto de referencia en dólares: vacío = sin dato; negativo o no numérico = error. */
function monto(formData: FormData, campo: string, nombre: string): number | null | { error: string } {
  const t = String(formData.get(campo) ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { error: `${nombre}: escribe un monto válido.` };
  return Math.round(n * 100) / 100;
}

/** Un enlace: solo http(s), para que un `javascript:` no termine en un `href`. */
function enlace(formData: FormData, campo: string, nombre: string): string | null | { error: string } {
  const t = texto(formData, campo, 2000);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    return { error: `${nombre}: pega un enlace completo (https://…).` };
  }
}

const dolares = (n: number | string | null) => (n === null || n === undefined ? "—" : `$${Number(n).toFixed(2)}`);

const esError = (v: unknown): v is { error: string } => typeof v === "object" && v !== null && "error" in v;

/** Los datos editables de una fila, validados (lo mismo para crear y para guardar desde la ficha). */
async function leerDatos(formData: FormData) {
  const nombre = texto(formData, "nombre", 200);
  if (!nombre) return { error: "Escribe el nombre del producto." };
  const fecha = String(formData.get("fecha_captacion") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Elige la fecha de captación." };
  const urlPagina = enlace(formData, "url_pagina", "Página del producto");
  const urlAdLibrary = enlace(formData, "url_ad_library", "Ad Library");
  const costo = monto(formData, "costo_proveedor", "Costo proveedor");
  const precio = monto(formData, "precio_venta", "Precio de venta");
  for (const v of [urlPagina, urlAdLibrary, costo, precio]) if (esError(v)) return v;
  const foto = texto(formData, "foto_url", 2000);
  if (foto && !foto.startsWith(PREFIJO_URL_PUBLICA)) return { error: "La foto no es válida: súbela de nuevo." };
  const responsable = String(formData.get("responsable_id") ?? "").trim();
  if (responsable && !UUID.test(responsable)) return { error: "Elige un responsable válido." };
  if (responsable) {
    const { data } = await createServiceClient().from("perfiles").select("id").eq("id", responsable).eq("activo", true).maybeSingle();
    if (!data) return { error: "Ese responsable ya no está activo." };
  }
  return {
    datos: {
      nombre,
      fecha_captacion: fecha,
      foto_url: foto,
      url_pagina: urlPagina as string | null,
      url_ad_library: urlAdLibrary as string | null,
      costo_proveedor: costo as number | null,
      precio_venta: precio as number | null,
      categoria: texto(formData, "categoria", 80),
      responsable_id: responsable || null,
      notas: texto(formData, "notas", 4000),
    },
  };
}

/**
 * Crea una fila a mano. Si dice de qué fuente salió (se encontró en Drop Killer sin pasar por su módulo, por ejemplo), toma el
 * siguiente correlativo de esa fuente; si no, es «Manual» (MAN-0001). Arranca «Por evaluar», en el país de la barra de arriba.
 * Devuelve el error como valor: en producción Next.js oculta el mensaje de una excepción.
 */
export async function crearSeleccion(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const fuente = String(formData.get("fuente") ?? "manual");
  if (!FUENTES_VALIDAS.has(fuente)) return { error: "Elige una fuente válida." };
  const leido = await leerDatos(formData);
  if ("error" in leido) return { error: leido.error };

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: codigo, error: errorCodigo } = await supabase.rpc("wms_siguiente_codigo_fuente", { p_fuente: fuente });
  if (errorCodigo || !codigo) return { error: "No se pudo dar el código de la fuente. ¿Ya se corrió la migración 0104?" };

  const { data, error } = await supabase
    .from(ENTIDAD)
    .insert({ ...leido.datos, pais_id: pais.id, fuente, codigo_fuente: codigo, estado: "por_evaluar", creado_por: usuario.id })
    .select("id, numero")
    .single();
  if (error) return { error: "No se pudo crear la fila." };

  await registrarAuditoria({ accion: "crear_seleccion", entidad: ENTIDAD, entidadId: data.id, detalle: `${codigo} · ${leido.datos.nombre}` });
  revalidatePath(RUTA);
  return {};
}

/** Guarda la ficha de una fila (todo menos el estado, la fuente y su código). */
export async function actualizarSeleccion(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Fila no válida." };
  const leido = await leerDatos(formData);
  if ("error" in leido) return { error: leido.error };

  const supabase = createServiceClient();
  const { data: antes } = await supabase.from(ENTIDAD).select("nombre, foto_url, categoria, costo_proveedor, precio_venta").eq("id", id).maybeSingle();
  if (!antes) return { error: "La fila ya no existe." };
  const { error } = await supabase.from(ENTIDAD).update({ ...leido.datos, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  if (antes.foto_url !== leido.datos.foto_url) await borrarFotoSiEsNuestra(antes.foto_url);
  await registrarAuditoria({
    accion: "actualizar_seleccion",
    entidad: ENTIDAD,
    entidadId: id,
    antes: { Nombre: antes.nombre, Categoría: antes.categoria ?? "—", "Costo proveedor": dolares(antes.costo_proveedor), "Precio de venta": dolares(antes.precio_venta) },
    despues: { Nombre: leido.datos.nombre, Categoría: leido.datos.categoria ?? "—", "Costo proveedor": dolares(leido.datos.costo_proveedor), "Precio de venta": dolares(leido.datos.precio_venta) },
  });
  revalidatePath(RUTA);
  return {};
}

/**
 * Mueve una o varias filas a un estado (desde su celda, su ficha o la barra de varias a la vez). Una sola escritura y una
 * línea de actividad por fila que cambió. Hasta 300 filas por vez.
 */
export async function cambiarEstadoSeleccion(ids: string[], estado: string): Promise<{ error?: string; cambiadas?: number }> {
  await requireModuloEscritura(MODULO);
  if (!ESTADOS.has(estado)) return { error: "Estado no válido." };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 300 || !ids.every((i) => typeof i === "string" && UUID.test(i))) return { error: "Selección no válida." };

  const supabase = createServiceClient();
  const { data: actuales, error: errorLeer } = await supabase.from(ENTIDAD).select("id, estado").in("id", ids);
  if (errorLeer) return { error: "No se pudo leer la selección." };
  const cambian = (actuales ?? []).filter((f) => f.estado !== estado);
  if (cambian.length === 0) return { cambiadas: 0 };

  const { error } = await supabase
    .from(ENTIDAD)
    .update({ estado, actualizado_en: new Date().toISOString() })
    .in(
      "id",
      cambian.map((f) => f.id),
    );
  if (error) return { error: "No se pudo cambiar el estado." };

  await registrarAuditoriaLote(
    cambian.map((f) => ({
      accion: "cambiar_estado_seleccion",
      entidad: ENTIDAD,
      entidadId: f.id,
      antes: { Estado: etiquetaEstadoSeleccion(f.estado) },
      despues: { Estado: etiquetaEstadoSeleccion(estado) },
    })),
  );
  revalidatePath(RUTA);
  return { cambiadas: cambian.length };
}

/** La actividad de una fila (de la auditoría), de la más nueva a la más vieja. Basta poder abrir el módulo. */
export async function obtenerHistorialSeleccion(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Fila no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", ENTIDAD)
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
