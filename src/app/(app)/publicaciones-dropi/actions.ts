"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { UBICACIONES, etiqueta, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import { enviarNombreADropi, enviarPrecioADropi } from "@/lib/publicaciones/cambios-dropi";
import { MAX_NOMBRE_DROPI } from "@/lib/publicaciones/dropi-guardado";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { rutaPropia } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const RUTA = "/publicaciones-dropi";
const BUCKET_FOTOS = "wms-productos";
const PREFIJO_URL_PUBLICA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

type Datos = Record<string, string | number | boolean | null>;

/** Lee y valida los datos de la ficha (crear o guardar). Devuelve el error como valor. */
function leerDatos(f: FormData): Datos | { error: string } {
  const nombre = texto(f, "nombre", 300);
  if (!nombre) return { error: "Escribe el nombre del producto." };
  const precio = numero(f, "precio_venta");
  const costo = numero(f, "costo_mercancia");
  const fulfillment = numero(f, "fulfillment");
  if ([precio, costo, fulfillment].includes(undefined)) return { error: "Un precio o costo no es válido." };
  const email = texto(f, "privatizado_email", 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El correo del dropshipper no es válido." };
  const resp = texto(f, "responsable_id", 64);
  return {
    nombre,
    dropi_id: texto(f, "dropi_id", 60) || null,
    // Estado, «En Dropi» y Tipo ya no se editan (21 oct 2026): salen de Dropi y de reglas. No van aquí, así guardar no los borra.
    privatizado_a: texto(f, "privatizado_a", 120) || null,
    privatizado_email: email || null,
    precio_venta: precio ?? null,
    costo_mercancia: costo ?? null,
    fulfillment: fulfillment ?? null,
    // «Coste real» ya no se usa (21 oct 2026): no va aquí, así guardar la ficha no borra el dato que quedó en la base.
    // «Estado de venta» ya no se edita (lo reemplazan las ventas de Dropi de 30 días): no va aquí, así guardar la ficha no
    // borra el dato que quedó en la base.
    ubicacion: deLista(f, "ubicacion", UBICACIONES),
    // «Reposición» y «Competencia» ya no se editan aquí (la reposición se hace desde Compras y la competencia se ve en la del
    // producto): no van, así guardar la ficha no borra lo que quedó en la base.
    // «Fecha de publicación» ya no se anota (21 oct 2026): sale de Dropi (la primera venta). Al crear una se pone la de hoy.
    // «Último cambio de precio» ya no se anota (21 oct 2026): lo detecta la lectura del catálogo de Dropi.
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
    .insert({ ...datos, pais_id: paisId, fecha_publicacion: datos.fecha_publicacion ?? hoy(), responsable_id: datos.responsable_id ?? usuario.id, creado_por: usuario.id })
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
  ["privatizado_a", "Privatizado a", (v) => String(v ?? "—")],
  ["precio_venta", "Precio de venta", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["costo_mercancia", "Costo de producto", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["fulfillment", "Fulfillment", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["ubicacion", "Dónde está", (v) => etiqueta(UBICACIONES, v as string)],
];

/**
 * Guarda la ficha. Si cambia el precio, «Último cambio de precio» pasa a hoy (salvo que se haya escrito otra fecha). Si cambia el
 * nombre (hasta 40 caracteres, lo que admite Dropi), se guarda y queda pendiente para Dropi, como «Usar este título» del Asistente
 * de IA: lo aplica «Aplicar en Dropi». `dropi` dice cómo quedó ese envío.
 */
export async function actualizarPublicacion(f: FormData): Promise<{ error?: string; dropi?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const id = texto(f, "id", 64);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  const datos = leerDatos(f);
  if ("error" in datos) return datos;
  // El nombre se edita aquí y viaja a Dropi (22 oct 2026); la sincronización con Dropi no lo pisa.
  const nombreNuevo = String(datos.nombre ?? "").trim();
  const cambiaNombre = !!nombreNuevo && nombreNuevo !== String(antes.nombre ?? "").trim();
  if (cambiaNombre && nombreNuevo.length > MAX_NOMBRE_DROPI) return { error: `Dropi admite ${MAX_NOMBRE_DROPI} caracteres en el nombre: este tiene ${nombreNuevo.length}.` };
  if (cambiaNombre) datos.nombre = nombreNuevo;
  else delete datos.nombre;

  const { error } = await createServiceClient()
    .from("dropi_publicaciones")
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar la publicación." };

  const cambios = VISTA.filter(([k]) => {
    if (k === "nombre") return cambiaNombre;
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
  let dropi: string | undefined;
  // El precio cambiado en la ficha también va a Dropi por la cola (22 oct 2026), junto con el nombre si los dos cambiaron.
  const precioAntes = antes.precio_venta === null || antes.precio_venta === undefined ? null : Number(antes.precio_venta);
  const precioNuevo = typeof datos.precio_venta === "number" ? datos.precio_venta : null;
  if (precioNuevo !== null && precioNuevo > 0 && (precioAntes === null || Math.abs(precioAntes - precioNuevo) > 0.004)) {
    const r = await enviarPrecioADropi(createServiceClient(), { id, pais_id: antes.pais_id, dropi_id: (antes.dropi_id as string | null) ?? null }, precioNuevo, precioAntes, { id: usuario.id, nombre: usuario.nombre || usuario.email });
    dropi = r.estado === "pendiente" ? r.detalle : `El precio se guardó, pero no quedó para Dropi: ${r.detalle}`;
  }
  if (cambiaNombre) {
    const r = await enviarNombreADropi(createServiceClient(), { id, pais_id: antes.pais_id, dropi_id: (antes.dropi_id as string | null) ?? null, sku_maestro_id: (antes.sku_maestro_id as string | null) ?? null }, nombreNuevo, { id: usuario.id, nombre: usuario.nombre || usuario.email });
    dropi = r.estado === "pendiente" ? `Nombre${dropi ? " y precio" : ""} para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.` : `El nombre se guardó, pero no quedó para Dropi: ${r.detalle}`;
  }
  revalidatePath(RUTA);
  return { dropi };
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
