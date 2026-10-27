"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { esServicioDropi } from "@/lib/publicaciones/sin-publicacion";
import { idsDeDropi, ubicacionDeProducto, type BodegaDropi } from "@/lib/publicaciones/sincronizar-dropi";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const RUTA = "/publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/**
 * Lo que se copia de una publicación parecida a la nueva («Copiar datos de»: una republicación hecha a mano en Dropi suele ser el mismo
 * producto con otro ID). Todo lo que es de la publicación y no lo dice Dropi; el nombre, el precio, el tipo y la bodega salen de Dropi.
 */
const COPIAR = ["costo_mercancia", "fulfillment", "coste_real", "estado_reposicion", "competencia", "foto_url", "foto_huella", "responsable_id", "sku_maestro_id"] as const;

type Supa = ReturnType<typeof createServiceClient>;

/** El producto de la última lectura de «Mis productos», activo y que no es un envío ni un seguro; si no, el error. */
async function productoDeDropi(supabase: Supa, paisId: string, dropiId: unknown) {
  if (!Number.isInteger(dropiId) || (dropiId as number) <= 0) return { error: "ID de Dropi no válido." };
  const { data, error } = await supabase
    .from("dropi_productos_proveedor")
    .select("dropi_producto_id, nombre, archivado, privado, precio, bodegas, creado_dropi")
    .eq("pais_id", paisId)
    .eq("dropi_producto_id", dropiId as number)
    .maybeSingle();
  if (error) return { error: "No se pudo leer el producto de Dropi." };
  if (!data) return { error: "Ese ID no está en la última lectura de Dropi." };
  if (data.archivado) return { error: "Ese producto está archivado en Dropi." };
  if (esServicioDropi(data.nombre as string)) return { error: "Es un envío o un seguro de Dropi, no un producto." };
  return {
    producto: {
      id: Number(data.dropi_producto_id),
      nombre: String(data.nombre).slice(0, 200),
      privado: !!data.privado,
      precio: data.precio === null ? null : Number(data.precio),
      bodegas: (Array.isArray(data.bodegas) ? (data.bodegas as BodegaDropi[]) : []).map((b) => ({ id: Number(b.id), nombre: String(b.nombre), stock: Number(b.stock ?? 0) })),
      creado: (data.creado_dropi as string | null) ?? null,
    },
  };
}

/** La publicación del país que ya tiene ese ID de Dropi (archivadas incluidas), o null. */
async function publicacionConId(supabase: Supa, paisId: string, dropiId: number): Promise<{ numero: number | null; nombre: string } | null> {
  const { data } = await supabase.from("dropi_publicaciones").select("id, numero, nombre, dropi_id").eq("pais_id", paisId).not("dropi_id", "is", null).limit(5000);
  const otra = ((data ?? []) as { numero: number | null; nombre: string; dropi_id: string | null }[]).find((p) => idsDeDropi(p.dropi_id).includes(dropiId));
  return otra ? { numero: otra.numero, nombre: otra.nombre } : null;
}

async function contexto() {
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id))) return { error: "No tienes acceso a este país." } as const;
  return { usuario, supabase, paisId: pais.id } as const;
}

/**
 * Crea en el sistema la publicación de un producto que está en Dropi sin publicación. Con `copiarDe` (una publicación del país) copia sus
 * datos propios (producto vinculado, costos, responsable, foto) y las enlaza en «relacionados». No cambia nada en Dropi: el producto ya
 * existe allá, así que no pasa por la cola de «Aplicar en Dropi».
 */
export async function crearDesdeDropi(dropiId: number, copiarDe: string | null): Promise<{ error?: string; id?: string; detalle?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const { usuario, supabase, paisId } = ctx;
  const r = await productoDeDropi(supabase, paisId, dropiId);
  if ("error" in r) return { error: r.error };
  const p = r.producto;
  const ya = await publicacionConId(supabase, paisId, p.id);
  if (ya) return { error: `El ID ${p.id} ya es de ${numeroPublicacion(ya.numero)} (${ya.nombre}).` };

  let base: Record<string, unknown> | null = null;
  if (copiarDe !== null) {
    if (typeof copiarDe !== "string" || !UUID.test(copiarDe)) return { error: "Publicación no válida." };
    const { data } = await supabase.from("dropi_publicaciones").select("*").eq("id", copiarDe).eq("pais_id", paisId).maybeSingle();
    if (!data) return { error: "La publicación para copiar ya no está en este país." };
    base = data as Record<string, unknown>;
  }
  const copia: Record<string, unknown> = {};
  if (base) for (const k of COPIAR) copia[k] = base[k] ?? null;
  const estadoBase = base?.estado as string | undefined;
  const { data, error } = await supabase
    .from("dropi_publicaciones")
    .insert({
      ...copia,
      pais_id: paisId,
      nombre: p.nombre,
      dropi_id: String(p.id),
      estado: estadoBase && estadoBase !== "archivado" ? estadoBase : base ? "al_dia" : "producto_nuevo",
      estado_publicacion: "activo",
      tipo_publicacion: p.privado ? "privado" : "publico",
      precio_venta: p.precio,
      ubicacion: ubicacionDeProducto(p) ?? ((base?.ubicacion as string | null) ?? null),
      fecha_publicacion: (p.creado ?? hoy()).slice(0, 10),
      ...(base ? { relacionados: [base.id as string] } : {}),
      responsable_id: (copia.responsable_id as string | null) ?? usuario.id,
      creado_por: usuario.id,
    })
    .select("id, numero")
    .single();
  if (error || !data) return { error: "No se pudo crear la publicación." };
  if (base) {
    const relacionados = [...new Set([...((base.relacionados as string[] | null) ?? []), data.id as string])];
    await supabase.from("dropi_publicaciones").update({ relacionados, actualizado_en: new Date().toISOString() }).eq("id", base.id as string);
  }
  const deBase = base ? ` · con los datos de ${numeroPublicacion(base.numero as number | null)} (${base.nombre as string})` : "";
  await registrarAuditoria({ accion: "crear_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: data.id as string, detalle: `${p.nombre} (ID ${p.id}) · estaba en Dropi sin publicación${deBase}` });
  revalidatePath(RUTA);
  return { id: data.id as string, detalle: `${numeroPublicacion(data.numero as number | null)} creada con el ID ${p.id}.` };
}

/**
 * Le pone el ID de un producto que está en Dropi sin publicación a una publicación del país que todavía no tiene ID de Dropi (se anotó a
 * mano antes de publicarla). No vale para un borrador que espera «Publicar en Dropi»: ese crearía otro producto en Dropi.
 */
export async function vincularADropi(dropiId: number, publicacionId: string): Promise<{ error?: string; detalle?: string }> {
  const ctx = await contexto();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, paisId } = ctx;
  if (typeof publicacionId !== "string" || !UUID.test(publicacionId)) return { error: "Publicación no válida." };
  const r = await productoDeDropi(supabase, paisId, dropiId);
  if ("error" in r) return { error: r.error };
  const p = r.producto;
  const ya = await publicacionConId(supabase, paisId, p.id);
  if (ya) return { error: `El ID ${p.id} ya es de ${numeroPublicacion(ya.numero)} (${ya.nombre}).` };
  const { data: pub } = await supabase.from("dropi_publicaciones").select("id, numero, nombre, dropi_id, estado, estado_publicacion, ubicacion").eq("id", publicacionId).eq("pais_id", paisId).maybeSingle();
  if (!pub) return { error: "La publicación ya no está en este país." };
  if (idsDeDropi(pub.dropi_id as string | null).length) return { error: "Esa publicación ya tiene un ID de Dropi." };
  const { data: crear } = await supabase.from("dropi_cambios_pendientes").select("id").eq("publicacion_id", publicacionId).eq("tipo", "crear").in("estado", ["pendiente", "error"]).limit(1);
  if (crear?.length) return { error: "Esa publicación espera «Publicar en Dropi»: deshaz ese cambio pendiente antes de vincularla." };
  const { error } = await supabase
    .from("dropi_publicaciones")
    .update({
      dropi_id: String(p.id),
      estado_publicacion: "activo",
      tipo_publicacion: p.privado ? "privado" : "publico",
      ...(pub.estado === "archivado" ? { estado: "al_dia" } : {}),
      ...(pub.ubicacion ? {} : { ubicacion: ubicacionDeProducto(p) }),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", publicacionId);
  if (error) return { error: "No se pudo vincular." };
  await registrarAuditoria({
    accion: "editar_publicacion_dropi",
    entidad: "dropi_publicaciones",
    entidadId: publicacionId,
    antes: { "ID Dropi": "—" },
    despues: { "ID Dropi": String(p.id) },
    detalle: `ID ${p.id} de Dropi (${p.nombre}) vinculado: estaba en Dropi sin publicación`,
  });
  revalidatePath(RUTA);
  return { detalle: `${numeroPublicacion(pub.numero as number | null)} quedó con el ID ${p.id}.` };
}
