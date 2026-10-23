"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoriaLote } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 100;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface CambioParaDropi {
  id: string;
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
  let r = await leer("id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  if (r.error) r = await leer("id, dropi_producto_id, nombre, nombre_guia");
  const { data, error } = r as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null };
  if (error) return { error: /does not exist|schema cache/i.test(error.message) ? "Falta correr en Supabase la migración 0137." : "No se pudieron leer los cambios pendientes." };
  return {
    pais: pais.nombre,
    cambios: (data ?? []).map((f) => ({
      id: f.id as string,
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
    .map((r) => r as { id?: unknown; ok?: unknown; error?: unknown })
    .filter((r) => typeof r.id === "string" && UUID.test(r.id))
    .map((r) => ({ id: r.id as string, ok: r.ok === true, error: typeof r.error === "string" ? r.error.slice(0, 300) : "Sin detalle" }));
  if (!limpios.length) return { aplicados: 0, errores: 0 };
  const supabase = createServiceClient();
  const leerFilas = (columnas: string) =>
    supabase.from("dropi_cambios_pendientes").select(columnas).eq("pais_id", pais.id).in("estado", ["pendiente", "error"]).in("id", limpios.map((r) => r.id));
  let lectura = await leerFilas("id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos");
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
