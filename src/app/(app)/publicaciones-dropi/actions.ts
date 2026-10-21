"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { ESTADOS, ESTADOS_PUBLICACION, ESTADOS_REPOSICION, ESTADOS_VENTA, TIPOS, UBICACIONES, etiqueta, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { rutaPropia } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const RUTA = "/publicaciones-dropi";
const BUCKET_FOTOS = "wms-productos";
const PREFIJO_URL_PUBLICA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const texto = (f: FormData, k: string, max: number) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
const deLista = (f: FormData, k: string, lista: OpcionPublicacion[]) => {
  const v = texto(f, k, 40);
  return lista.some((o) => o.valor === v) ? v : null;
};
const numero = (f: FormData, k: string): number | null | undefined => {
  const t = texto(f, k, 20);
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : undefined;
};
const fecha = (f: FormData, k: string) => {
  const t = texto(f, k, 10);
  return FECHA.test(t) ? t : null;
};

type Datos = Record<string, string | number | boolean | null>;

/** Lee y valida los datos de la ficha (crear o guardar). Devuelve el error como valor. */
function leerDatos(f: FormData): Datos | { error: string } {
  const nombre = texto(f, "nombre", 300);
  if (!nombre) return { error: "Escribe el nombre del producto." };
  const precio = numero(f, "precio_venta");
  const costo = numero(f, "costo_mercancia");
  const fulfillment = numero(f, "fulfillment");
  const real = numero(f, "coste_real");
  if ([precio, costo, fulfillment, real].includes(undefined)) return { error: "Un precio o costo no es válido." };
  const comp = texto(f, "competencia", 3);
  const email = texto(f, "privatizado_email", 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El correo del dropshipper no es válido." };
  const resp = texto(f, "responsable_id", 64);
  return {
    nombre,
    dropi_id: texto(f, "dropi_id", 60) || null,
    estado: deLista(f, "estado", ESTADOS) ?? "producto_nuevo",
    estado_publicacion: deLista(f, "estado_publicacion", ESTADOS_PUBLICACION),
    tipo_publicacion: deLista(f, "tipo_publicacion", TIPOS),
    privatizado_a: texto(f, "privatizado_a", 120) || null,
    privatizado_email: email || null,
    precio_venta: precio ?? null,
    costo_mercancia: costo ?? null,
    fulfillment: fulfillment ?? null,
    coste_real: real ?? null,
    estado_venta: deLista(f, "estado_venta", ESTADOS_VENTA),
    ubicacion: deLista(f, "ubicacion", UBICACIONES),
    estado_reposicion: deLista(f, "estado_reposicion", ESTADOS_REPOSICION),
    competencia: comp === "si" ? true : comp === "no" ? false : null,
    fecha_publicacion: fecha(f, "fecha_publicacion"),
    ultima_revision: fecha(f, "ultima_revision"),
    ultimo_cambio_precio: fecha(f, "ultimo_cambio_precio"),
    notas: texto(f, "notas", 5000) || null,
    responsable_id: UUID.test(resp) ? resp : null,
  };
}

/** La publicación, si existe y es de un país que la persona ve. */
async function publicacionPermitida(id: string, permitidos: string[] | null) {
  if (!UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones").select("*").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.pais_id))) return null;
  return data as Record<string, unknown> & { id: string; pais_id: string; nombre: string };
}

/** «Agregar»: una publicación nueva en el país de la barra. */
export async function crearPublicacion(f: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const paisId = texto(f, "pais_id", 64);
  const supabase = createServiceClient();
  if (!UUID.test(paisId) || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, paisId))) return { error: "País no válido." };
  const datos = leerDatos(f);
  if ("error" in datos) return datos;
  const { data, error } = await supabase
    .from("dropi_publicaciones")
    .insert({ ...datos, pais_id: paisId, fecha_publicacion: datos.fecha_publicacion ?? hoy(), ultimo_cambio_precio: datos.ultimo_cambio_precio ?? hoy(), responsable_id: datos.responsable_id ?? usuario.id, creado_por: usuario.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "42P01" ? "Falta correr en Supabase la migración 0116." : "No se pudo crear la publicación." };
  await registrarAuditoria({ accion: "crear_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: data.id, detalle: `${datos.nombre}${datos.dropi_id ? ` (ID ${datos.dropi_id})` : ""}` });
  revalidatePath(RUTA);
  return {};
}

/** Lo que se muestra de cada dato en la actividad (antes → después). */
const VISTA: [string, string, (v: unknown) => string][] = [
  ["nombre", "Producto", (v) => String(v ?? "—")],
  ["dropi_id", "ID Dropi", (v) => String(v ?? "—")],
  ["estado", "Estado", (v) => etiqueta(ESTADOS, v as string)],
  ["estado_publicacion", "En Dropi", (v) => etiqueta(ESTADOS_PUBLICACION, v as string)],
  ["tipo_publicacion", "Tipo", (v) => etiqueta(TIPOS, v as string)],
  ["privatizado_a", "Privatizado a", (v) => String(v ?? "—")],
  ["precio_venta", "Precio de venta", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["costo_mercancia", "Costo mercancía", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["fulfillment", "Fulfillment", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["coste_real", "Coste real", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["estado_venta", "Estado de venta", (v) => etiqueta(ESTADOS_VENTA, v as string)],
  ["ubicacion", "Dónde está", (v) => etiqueta(UBICACIONES, v as string)],
  ["estado_reposicion", "Reposición", (v) => etiqueta(ESTADOS_REPOSICION, v as string)],
  ["competencia", "Competencia", (v) => (v === null ? "—" : v ? "Sí" : "No")],
  ["ultima_revision", "Última revisión", (v) => String(v ?? "—")],
];

/** Guarda la ficha. Si cambia el precio, «Último cambio de precio» pasa a hoy (salvo que se haya escrito otra fecha). */
export async function actualizarPublicacion(f: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const id = texto(f, "id", 64);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  const datos = leerDatos(f);
  if ("error" in datos) return datos;
  const precioAntes = antes.precio_venta === null ? null : Number(antes.precio_venta);
  if (datos.precio_venta !== precioAntes && datos.ultimo_cambio_precio === (antes.ultimo_cambio_precio ?? null)) datos.ultimo_cambio_precio = hoy();

  const { error } = await createServiceClient()
    .from("dropi_publicaciones")
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar la publicación." };

  const cambios = VISTA.filter(([k]) => {
    const a = antes[k] === null || antes[k] === undefined ? null : typeof datos[k] === "number" ? Number(antes[k]) : antes[k];
    return a !== datos[k];
  });
  if (cambios.length)
    await registrarAuditoria({
      accion: "editar_publicacion_dropi",
      entidad: "dropi_publicaciones",
      entidadId: id,
      antes: Object.fromEntries(cambios.map(([k, n, ver]) => [n, ver(antes[k] ?? null)])),
      despues: Object.fromEntries(cambios.map(([k, n, ver]) => [n, ver(datos[k])])),
    });
  revalidatePath(RUTA);
  return {};
}

/** «Marcar revisada»: la última revisión pasa a hoy (y con ella la próxima, 28 días después). */
export async function marcarRevisada(id: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  const { error } = await createServiceClient().from("dropi_publicaciones").update({ ultima_revision: hoy(), actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo marcar como revisada." };
  await registrarAuditoria({ accion: "revisar_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: id, antes: { "Última revisión": String(antes.ultima_revision ?? "—") }, despues: { "Última revisión": hoy() } });
  revalidatePath(RUTA);
  return {};
}

/** La actividad de una publicación para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialPublicacion(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!(await publicacionPermitida(id, usuario.paisesPermitidos))) return { error: "Publicación no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "dropi_publicaciones")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/**
 * Vincula la publicación con un producto de Producto (o quita el vínculo, con `null`). Queda en la actividad. Devuelve el error
 * como valor.
 */
export async function vincularSkuPublicacion(id: string, skuId: string | null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  const supabase = createServiceClient();
  let nuevo: { codigo: string; nombre: string } | null = null;
  if (skuId !== null) {
    if (!UUID.test(skuId)) return { error: "Producto no válido." };
    const { data } = await supabase.from("skus_maestros").select("codigo, nombre").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe en Producto." };
    nuevo = data;
  }
  if ((antes.sku_maestro_id ?? null) === skuId) return {};
  let previo = "Sin vincular";
  if (antes.sku_maestro_id) {
    const { data } = await supabase.from("skus_maestros").select("codigo, nombre").eq("id", antes.sku_maestro_id as string).maybeSingle();
    if (data) previo = `${data.codigo} · ${data.nombre}`;
  }
  const { error } = await supabase.from("dropi_publicaciones").update({ sku_maestro_id: skuId, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar el vínculo." };
  await registrarAuditoria({
    accion: skuId ? "vincular_sku_publicacion" : "desvincular_sku_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: id,
    antes: { Producto: previo },
    despues: { Producto: nuevo ? `${nuevo.codigo} · ${nuevo.nombre}` : "Sin vincular" },
  });
  revalidatePath(RUTA);
  return {};
}

/**
 * Elimina una publicación de verdad (no se puede deshacer). **Solo un administrador** (quien puede modificar Usuarios y roles): el
 * resto archiva con el estado «Archivado». Se quita también de las «relacionadas» de las demás y se borra su foto si ninguna otra
 * fila la usa. Queda en la auditoría con lo que era. Devuelve el error como valor.
 */
export async function eliminarPublicacion(id: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: "Solo un administrador puede eliminar publicaciones." };
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  const supabase = createServiceClient();

  // Las demás publicaciones que la tenían como relacionada dejan de apuntarle (son ids dentro de una lista, sin llave foránea).
  const { data: conRelacion } = await supabase.from("dropi_publicaciones").select("id, relacionados").contains("relacionados", [id]);
  for (const fila of conRelacion ?? []) {
    const restantes = ((fila.relacionados as string[] | null) ?? []).filter((r) => r !== id);
    await supabase.from("dropi_publicaciones").update({ relacionados: restantes }).eq("id", fila.id);
  }

  const { error } = await supabase.from("dropi_publicaciones").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la publicación." };

  // La foto solo se borra si es de la carpeta de las publicaciones y ninguna otra fila la sigue usando.
  const foto = (antes.foto_url as string | null) ?? null;
  const ruta = rutaPropia(foto, PREFIJO_URL_PUBLICA, "publicaciones");
  if (ruta && foto) {
    const { count } = await supabase.from("dropi_publicaciones").select("id", { count: "exact", head: true }).eq("foto_url", foto);
    if (!count) await supabase.storage.from(BUCKET_FOTOS).remove([ruta]);
  }

  await registrarAuditoria({
    accion: "eliminar_publicacion_dropi",
    entidad: "dropi_publicaciones",
    entidadId: id,
    detalle: `${antes.nombre}${antes.dropi_id ? ` · ID Dropi ${antes.dropi_id}` : ""}`,
  });
  revalidatePath(RUTA);
  return {};
}
