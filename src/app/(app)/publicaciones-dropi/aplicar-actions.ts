"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 100;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface CambioParaDropi {
  id: string;
  /** «republicar» = crear el producto de nuevo en Dropi y archivar el viejo sin stock (migración 0145). */
  tipo: "cambio" | "republicar" | "apagar";
  /** «apagar»: además de sacar el stock, quitar la privatización (un producto privado, asignado a un correo). */
  quitarPrivados: boolean;
  /** El producto nuevo que un intento anterior de republicar ya creó en Dropi (el favorito sigue desde ahí). */
  nuevo: number | null;
  producto: number;
  /** null = no se cambia el nombre. */
  nombre: string | null;
  guia: string | null;
  /** null = no se cambia (migración 0139). */
  precio: number | null;
  sugerido: number | null;
  precioAntes: number | null;
  sugeridoAntes: number | null;
  publicacion: string;
}

async function paisDeCodigo(codigo: string, permitidos: string[] | null) {
  if (typeof codigo !== "string" || !/^[a-z]{2}$/i.test(codigo)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("paises").select("id, nombre").eq("codigo", codigo.toUpperCase()).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.id as string))) return null;
  return { id: data.id as string, nombre: data.nombre as string };
}

/** Lo que se copia de la publicación vieja a la nueva al republicar (todo lo que es de la publicación, no de Dropi ni de ClickUp). */
const COPIAR_AL_REPUBLICAR = [
  "pais_id",
  "nombre",
  "tipo_publicacion",
  "privatizado_a",
  "privatizado_email",
  "dropshipper_id",
  "precio_venta",
  "costo_mercancia",
  "fulfillment",
  "coste_real",
  "ubicacion",
  "estado_reposicion",
  "competencia",
  "ultima_revision",
  "ultimo_cambio_precio",
  "foto_url",
  "foto_huella",
  "notas",
  "responsable_id",
  "sku_maestro_id",
] as const;

/**
 * Al terminar una republicación (pedido de Hernán, 23 oct 2026): crea en el sistema la publicación nueva con los datos de la vieja,
 * el ID nuevo de Dropi y el mismo producto vinculado, publicada hoy y activa, y archiva la vieja; cada una queda en «relacionados»
 * de la otra. Si la nueva ya existe (otro intento o alguien la cargó), la usa.
 */
async function crearRepublicada(
  supabase: ReturnType<typeof createServiceClient>,
  fila: Record<string, unknown>,
  nuevo: number,
  usuario: { id: string },
): Promise<{ id: string } | { error: string }> {
  if (typeof fila.nueva_publicacion_id === "string") return { id: fila.nueva_publicacion_id };
  const { data: vieja } = await supabase.from("dropi_publicaciones").select("*").eq("id", fila.publicacion_id as string).maybeSingle();
  if (!vieja) return { error: "La publicación vieja ya no está en el sistema." };
  const { data: existente } = await supabase.from("dropi_publicaciones").select("id").eq("pais_id", vieja.pais_id).eq("dropi_id", String(nuevo)).limit(1).maybeSingle();
  let id = existente?.id as string | undefined;
  if (!id) {
    const datos: Record<string, unknown> = {};
    for (const k of COPIAR_AL_REPUBLICAR) datos[k] = vieja[k] ?? null;
    const relacionados = [...new Set([...((vieja.relacionados as string[] | null) ?? []), vieja.id as string])];
    const { data, error } = await supabase
      .from("dropi_publicaciones")
      .insert({
        ...datos,
        dropi_id: String(nuevo),
        estado: vieja.estado === "archivado" ? "al_dia" : vieja.estado,
        estado_publicacion: "activo",
        fecha_publicacion: new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }),
        relacionados,
        creado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Se republicó en Dropi, pero no se pudo crear la publicación nueva en el sistema." };
    id = data.id as string;
    await registrarAuditoria({ accion: "crear_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: id, detalle: `${vieja.nombre} (ID ${nuevo}) · republicada desde el ID ${vieja.dropi_id ?? "—"}` });
  }
  await supabase
    .from("dropi_publicaciones")
    .update({ estado: "archivado", estado_publicacion: "archivado", relacionados: [...new Set([...((vieja.relacionados as string[] | null) ?? []), id])], actualizado_en: new Date().toISOString() })
    .eq("id", vieja.id as string);
  return { id };
}

/**
 * Los cambios que esperan para Dropi en un país (pendientes y los que dieron error, para reintentarlos), para el favorito «Aplicar en
 * Dropi». No lleva nada de la sesión de Dropi: el favorito los aplica desde su pestaña.
 */
export async function pendientesParaDropi(codigoPais: string): Promise<{ error?: string; pais?: string; cambios?: CambioParaDropi[] }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pais = await paisDeCodigo(codigoPais, usuario.paisesPermitidos);
  if (!pais) return { error: "Ese país no está en el sistema o no lo puedes ver." };
  const leer = (columnas: string) =>
    createServiceClient().from("dropi_cambios_pendientes").select(`${columnas}, dropi_publicaciones(nombre)` as "*").eq("pais_id", pais.id).in("estado", ["pendiente", "error"]).order("creado_en").limit(MAX);
  let r = await leer("id, tipo, quitar_privados, nuevo_dropi_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  // Sin la migración 0148, sin apagados; sin la 0145, sin republicaciones.
  if (r.error) r = await leer("id, tipo, nuevo_dropi_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  if (r.error) r = await leer("id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  if (r.error) r = await leer("id, dropi_producto_id, nombre, nombre_guia");
  const { data, error } = r as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null };
  if (error) return { error: /does not exist|schema cache/i.test(error.message) ? "Falta correr en Supabase la migración 0137." : "No se pudieron leer los cambios pendientes." };
  return {
    pais: pais.nombre,
    cambios: (data ?? []).map((f) => ({
      id: f.id as string,
      tipo: f.tipo === "republicar" ? ("republicar" as const) : f.tipo === "apagar" ? ("apagar" as const) : ("cambio" as const),
      quitarPrivados: f.quitar_privados === true,
      nuevo: num(f.nuevo_dropi_id),
      producto: Number(f.dropi_producto_id),
      nombre: (f.nombre as string | null) ?? null,
      guia: (f.nombre_guia as string | null) ?? null,
      precio: num(f.precio),
      sugerido: num(f.precio_sugerido),
      precioAntes: num(f.precio_antes),
      sugeridoAntes: num(f.precio_sugerido_antes),
      publicacion: ((f.dropi_publicaciones as { nombre?: string } | null)?.nombre ?? "") as string,
    })),
  };
}

/**
 * Guarda lo que el favorito hizo en Dropi con cada cambio (aplicado, o el motivo del error). Solo acepta cambios de ese país que
 * seguían pendientes o con error; cada resultado queda en la actividad de su publicación a nombre de quien pulsó el favorito.
 */
export async function guardarResultadosDropi(codigoPais: string, resultados: unknown): Promise<{ error?: string; aplicados?: number; errores?: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pais = await paisDeCodigo(codigoPais, usuario.paisesPermitidos);
  if (!pais) return { error: "País no válido." };
  if (!Array.isArray(resultados) || resultados.length > MAX) return { error: "Resultados no válidos." };
  const limpios = resultados
    .map((r) => r as { id?: unknown; ok?: unknown; error?: unknown; nuevo?: unknown; archivado?: unknown })
    .filter((r) => typeof r.id === "string" && UUID.test(r.id))
    .map((r) => ({
      id: r.id as string,
      ok: r.ok === true,
      // «apagar»: si además quedó archivado (Dropi no archiva con órdenes pendientes: queda pendiente y se reintenta).
      archivado: r.archivado === true,
      error: typeof r.error === "string" ? r.error.slice(0, 300) : "Sin detalle",
      // El ID del producto que creó una republicación (aunque haya fallado un paso después).
      nuevo: Number.isInteger(r.nuevo) && (r.nuevo as number) > 0 && (r.nuevo as number) < 100_000_000 ? (r.nuevo as number) : null,
    }));
  if (!limpios.length) return { aplicados: 0, errores: 0 };
  const supabase = createServiceClient();
  const leerFilas = (columnas: string) =>
    supabase.from("dropi_cambios_pendientes").select(columnas).eq("pais_id", pais.id).in("estado", ["pendiente", "error"]).in("id", limpios.map((r) => r.id));
  let lectura = await leerFilas("id, tipo, quitar_privados, nuevo_dropi_id, nueva_publicacion_id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos");
  if (lectura.error) lectura = await leerFilas("id, tipo, nuevo_dropi_id, nueva_publicacion_id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos");
  if (lectura.error) lectura = await leerFilas("id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos");
  if (lectura.error) lectura = await leerFilas("id, publicacion_id, dropi_producto_id, nombre, nombre_guia, intentos");
  const filas = (lectura.data ?? []) as unknown as Record<string, unknown>[];
  const porId = new Map((filas ?? []).map((f) => [f.id as string, f]));
  const ahora = new Date().toISOString();
  const auditoria: Parameters<typeof registrarAuditoriaLote>[0] = [];
  let aplicados = 0;
  let errores = 0;
  for (const r of limpios) {
    const f = porId.get(r.id);
    if (!f) continue;
    if (f.tipo === "apagar") {
      // Sin stock en Dropi pero sin archivar: sigue pendiente (con el motivo) y el próximo «Aplicar en Dropi» solo repite el archivado.
      const hecho = r.ok && r.archivado;
      const parcial = r.ok && !r.archivado;
      await supabase
        .from("dropi_cambios_pendientes")
        .update(hecho ? { estado: "aplicado", aplicado_en: ahora, error: null, intentos: Number(f.intentos) + 1 } : parcial ? { estado: "pendiente", error: r.error, intentos: Number(f.intentos) + 1 } : { estado: "error", error: r.error, intentos: Number(f.intentos) + 1 })
        .eq("id", r.id);
      // Sin stock y sin privatización en Dropi (aunque no haya dejado archivar): en el sistema la publicación deja de ser de ese correo.
      let privatizacion = "";
      if (r.ok && f.quitar_privados === true) {
        const { data: antes } = await supabase.from("dropi_publicaciones").select("privatizado_a, privatizado_email").eq("id", f.publicacion_id as string).maybeSingle();
        const previo = [antes?.privatizado_a, antes?.privatizado_email].filter(Boolean).join(" · ");
        if (previo) {
          await supabase.from("dropi_publicaciones").update({ privatizado_a: null, privatizado_email: null, actualizado_en: ahora }).eq("id", f.publicacion_id as string);
          privatizacion = ` · privatización quitada (antes: ${previo})`;
        }
      }
      // Archivado en Dropi: ahora sí queda archivada también en el sistema.
      if (hecho) await supabase.from("dropi_publicaciones").update({ estado: "archivado", estado_publicacion: "archivado", actualizado_en: ahora }).eq("id", f.publicacion_id as string);
      auditoria.push({
        accion: hecho ? "dropi_apagado" : parcial ? "dropi_apagado_parcial" : "dropi_apagado_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: hecho ? `ID ${f.dropi_producto_id}: sin stock y archivado en Dropi${privatizacion} (desde Dropi)` : `ID ${f.dropi_producto_id} · ${r.error}${privatizacion}`,
      });
      if (hecho) aplicados++;
      else errores++;
      continue;
    }
    if (f.tipo === "republicar") {
      const nuevo = r.nuevo ?? (f.nuevo_dropi_id == null ? null : Number(f.nuevo_dropi_id));
      // Terminó en Dropi: la publicación nueva en el sistema (una sola vez) y la vieja archivada.
      const creada = r.ok && nuevo ? await crearRepublicada(supabase, f, nuevo, usuario) : null;
      const ok = r.ok && !!nuevo && !!creada && !("error" in creada);
      const error = !r.ok ? r.error : !nuevo ? "Dropi no devolvió el ID del producto nuevo." : creada && "error" in creada ? creada.error : "Sin detalle";
      await supabase
        .from("dropi_cambios_pendientes")
        .update({
          ...(ok ? { estado: "aplicado", aplicado_en: ahora, error: null } : { estado: "error", error }),
          intentos: Number(f.intentos) + 1,
          nuevo_dropi_id: nuevo,
          ...(creada && !("error" in creada) ? { nueva_publicacion_id: creada.id } : {}),
        })
        .eq("id", r.id);
      auditoria.push({
        accion: ok ? "dropi_republicada" : "dropi_republicar_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: ok ? `ID ${f.dropi_producto_id} → ID nuevo ${nuevo}: archivada en Dropi sin stock (desde Dropi)` : `ID ${f.dropi_producto_id}${nuevo ? ` · ID nuevo ${nuevo}` : ""} · ${error}`,
      });
      if (ok) aplicados++;
      else errores++;
      continue;
    }
    await supabase
      .from("dropi_cambios_pendientes")
      .update(r.ok ? { estado: "aplicado", aplicado_en: ahora, error: null, intentos: Number(f.intentos) + 1 } : { estado: "error", error: r.error, intentos: Number(f.intentos) + 1 })
      .eq("id", r.id);
    auditoria.push({
      accion: r.ok ? "dropi_nombre_aplicado" : "dropi_nombre_error",
      entidad: "dropi_publicaciones",
      entidadId: f.publicacion_id as string,
      detalle: r.ok
        ? `ID ${f.dropi_producto_id} · ${[f.nombre ? `«${f.nombre}»` : "", f.nombre_guia ? `guía «${f.nombre_guia}»` : "", f.precio != null ? `precio $${Number(f.precio).toFixed(2)}` : "", f.precio_sugerido != null ? `sugerido $${Number(f.precio_sugerido).toFixed(2)}` : ""].filter(Boolean).join(" · ")} (desde Dropi)`
        : `ID ${f.dropi_producto_id} · ${r.error}`,
    });
    // Un precio ya aplicado en Dropi deja hechas las tareas abiertas de subir o bajar el precio de esa publicación (migración 0128).
    if (r.ok && f.precio != null)
      await supabase
        .from("dropi_publicaciones_decisiones")
        .update({ hecha_en: ahora, hecha_por_nombre: usuario.nombre || usuario.email, hecha_como: "dropi", hecha_nota: `Aplicado en Dropi: $${Number(f.precio).toFixed(2)}` })
        .eq("publicacion_id", f.publicacion_id as string)
        .eq("decision", "aceptada")
        .in("tipo", ["subir_precio", "igualar_precio"])
        .is("hecha_en", null);
    if (r.ok) aplicados++;
    else errores++;
  }
  await registrarAuditoriaLote(auditoria);
  revalidatePath("/publicaciones-dropi");
  return { aplicados, errores };
}
